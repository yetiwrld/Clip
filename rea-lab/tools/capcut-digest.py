#!/usr/bin/env python3
"""
capcut-digest.py — turn a CapCut draft folder into a readable style report.

Usage:
    python3 rea-lab/tools/capcut-digest.py /path/to/draft-folder
    python3 rea-lab/tools/capcut-digest.py /path/to/draft-folder --json

Reads only the JSON inside a CapCut project folder (draft_content.json and
draft_meta_info.json). Ignores caches, media and thumbnails, so it is safe to
run on a folder you just unzipped.

Why this exists: instead of guessing at "the CapCut look", read the real
numbers out of a real project — clip durations, text styling, transitions,
speed changes, audio gain.
"""

from __future__ import annotations

import argparse
import json
import os
import statistics as stats
import sys
from collections import Counter


def us(value: int | None) -> float:
    """CapCut stores times in microseconds."""
    return (value or 0) / 1_000_000


def load(folder: str, name: str) -> dict:
    path = os.path.join(folder, name)
    if not os.path.exists(path):
        sys.exit(f"missing {name} in {folder}")
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def material_index(draft: dict) -> dict[str, tuple[str, dict]]:
    """Map material id -> (material list name, material object)."""
    index: dict[str, tuple[str, dict]] = {}
    for key, values in draft.get("materials", {}).items():
        if not isinstance(values, list):
            continue
        for item in values:
            if isinstance(item, dict) and "id" in item:
                index[item["id"]] = (key, item)
    return index


def digest(folder: str) -> dict:
    draft = load(folder, "draft_content.json")
    canvas = draft.get("canvas_config", {})
    mats = material_index(draft)
    segment_count = sum(len(t.get("segments", [])) for t in draft.get("tracks", []))

    report: dict = {
        "folder": os.path.basename(os.path.normpath(folder)),
        "capcut_version": draft.get("new_version"),
        "canvas": {
            "width": canvas.get("width"),
            "height": canvas.get("height"),
            "ratio": canvas.get("ratio"),
            "orientation": "vertical" if (canvas.get("height") or 0) > (canvas.get("width") or 0) else "horizontal",
        },
        "fps": draft.get("fps"),
        "duration_seconds": round(us(draft.get("duration")), 3),
        "track_count": len(draft.get("tracks", [])),
        "segment_count": segment_count,
        "tracks": [],
        "text_layers": [],
        "transitions": [],
        "speed_changes": [],
        "animations": [],
        "audio": [],
        "keyframe_count": 0,
        "material_inventory": {
            key: len(value)
            for key, value in draft.get("materials", {}).items()
            if isinstance(value, list) and value
        },
    }

    # ---- keyframes (CapCut keeps these in a top-level dict, not per segment) ----
    for kind, entries in (draft.get("keyframes") or {}).items():
        if isinstance(entries, list):
            report["keyframe_count"] += len(entries)

    # ---- per track ----
    for track in draft.get("tracks", []):
        segments = track.get("segments", [])
        durations = [us(s.get("target_timerange", {}).get("duration")) for s in segments]
        info = {
            "type": track.get("type"),
            "flag": track.get("flag"),
            "segments": len(segments),
            "total_seconds": round(sum(durations), 3),
        }
        if durations:
            info.update({
                "clip_seconds": {
                    "min": round(min(durations), 3),
                    "median": round(stats.median(durations), 3),
                    "mean": round(stats.mean(durations), 3),
                    "max": round(max(durations), 3),
                },
                # A fixed-length grid is a signature: "every clip is 4.0s".
                "uniform": len({round(d, 2) for d in durations}) == 1,
            })
        report["tracks"].append(info)

        for segment in segments:
            # --- text styling ---
            if track.get("type") == "text":
                kind, text_mat = mats.get(segment.get("material_id", ""), (None, None))
                if text_mat:
                    report["text_layers"].append(describe_text(text_mat, segment))

            # --- speed ---
            speed = segment.get("speed", 1.0)
            for ref in segment.get("extra_material_refs", []):
                kind, mat = mats.get(ref, (None, None))
                if kind == "speeds" and mat:
                    if mat.get("curve_speed") or mat.get("mode") not in (0, None):
                        report["speed_changes"].append({
                            "kind": "curve",
                            "mode": mat.get("mode"),
                            "curve": mat.get("curve_speed"),
                        })
                if kind == "transitions" and mat:
                    report["transitions"].append({
                        "name": mat.get("name"),
                        "effect_id": mat.get("effect_id"),
                        "seconds": round(us(mat.get("duration")), 3),
                        "overlap": mat.get("is_overlap"),
                    })
                if kind == "material_animations" and mat:
                    for anim in mat.get("animations", []):
                        report["animations"].append({
                            "type": anim.get("type"),
                            "name": anim.get("name"),
                            "seconds": round(us(anim.get("duration")), 3),
                        })
            if abs(speed - 1.0) > 1e-6:
                report["speed_changes"].append({"kind": "constant", "speed": round(speed, 4)})

            # --- transform, so we know if anything is scaled/moved ---
            clip = segment.get("clip") or {}
            if track.get("type") == "video":
                scale = (clip.get("scale") or {}).get("x", 1.0)
                transform = clip.get("transform") or {}
                if abs(scale - 1) > 1e-6 or abs(transform.get("x", 0)) > 1e-6 or abs(transform.get("y", 0)) > 1e-6:
                    report.setdefault("transformed_segments", []).append({
                        "track": track.get("type"),
                        "scale": round(scale, 4),
                        "x": round(transform.get("x", 0), 4),
                        "y": round(transform.get("y", 0), 4),
                    })

            # --- audio ---
            if track.get("type") == "audio":
                volume = segment.get("volume", 1.0)
                report["audio"].append({
                    "start": round(us(segment.get("target_timerange", {}).get("start")), 3),
                    "seconds": round(us(segment.get("target_timerange", {}).get("duration")), 3),
                    "volume": round(volume, 4),
                    "gain_db": round(20 * (volume and __import__("math").log10(volume)) if volume else -999, 2),
                    "fade": segment.get("audio_fade"),
                })

    # --- audio materials carry the real names ---
    report["audio_sources"] = [
        {"name": a.get("name"), "seconds": round(us(a.get("duration")), 2)}
        for a in draft.get("materials", {}).get("audios", [])
    ]

    # Collapse identical text STYLING into one entry. The text itself and the
    # duration are per-instance, so they must not be part of the signature —
    # otherwise "Level 1"/"Level 2" look like different styles.
    if report["text_layers"]:
        styling = ("bold", "fill", "size", "outline_width", "outline_color",
                   "letter_spacing", "line_spacing", "alignment", "pos_x", "pos_y", "scale")
        signatures = Counter(
            json.dumps({k: t.get(k) for k in styling}, sort_keys=True)
            for t in report["text_layers"]
        )
        report["text_styles"] = [
            {"count": count, **json.loads(sig)} for sig, count in signatures.most_common()
        ]

    return report


def describe_text(text_mat: dict, segment: dict) -> dict:
    """Flatten CapCut's rich-text content blob into the properties that matter."""
    try:
        content = json.loads(text_mat.get("content", "{}"))
    except json.JSONDecodeError:
        content = {}
    style = (content.get("styles") or [{}])[0]
    fill = ((style.get("fill") or {}).get("content") or {}).get("solid") or {}
    strokes = style.get("strokes") or []
    stroke = strokes[0] if strokes else {}
    stroke_fill = ((stroke.get("content") or {}).get("solid") or {})
    clip = segment.get("clip") or {}
    transform = clip.get("transform") or {}

    def rgb(value):
        return "#" + "".join(f"{round(c * 255):02x}" for c in value) if value else None

    return {
        "text": content.get("text", ""),
        "bold": style.get("bold"),
        "fill": rgb(fill.get("color")),
        "size": style.get("size"),
        "outline_width": round(stroke.get("width", 0.0), 4) if stroke else 0.0,
        "outline_color": rgb(stroke_fill.get("color")),
        "letter_spacing": text_mat.get("letter_spacing"),
        "line_spacing": text_mat.get("line_spacing"),
        "alignment": text_mat.get("alignment"),
        # CapCut: y is in half-canvas units, +y is up.
        "pos_x": round(transform.get("x", 0.0), 4),
        "pos_y": round(transform.get("y", 0.0), 4),
        "scale": round((clip.get("scale") or {}).get("x", 1.0), 4),
        "seconds": round(us(segment.get("target_timerange", {}).get("duration")), 3),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("folder", help="CapCut draft folder (contains draft_content.json)")
    parser.add_argument("--json", action="store_true", help="emit JSON instead of a report")
    args = parser.parse_args()

    report = digest(args.folder)
    if args.json:
        print(json.dumps(report, indent=2))
        return

    canvas = report["canvas"]
    print(f"project      : {report['folder']}  (CapCut {report['capcut_version']})")
    print(f"canvas       : {canvas['width']}x{canvas['height']} {canvas['orientation']}  @ {report['fps']}fps")
    print(f"duration     : {report['duration_seconds']:.2f}s   tracks: {report['track_count']}   segments: {report['segment_count']}")
    print(f"keyframes    : {report['keyframe_count']}")
    print(f"materials    : {', '.join(f'{k}={v}' for k, v in report['material_inventory'].items())}")

    print("\ntracks:")
    for track in report["tracks"]:
        clip = track.get("clip_seconds")
        pacing = f"{clip['min']}s / {clip['median']}s / {clip['max']}s" if clip else "-"
        uniform = "  [UNIFORM GRID]" if track.get("uniform") else ""
        print(f"  {track['type']:<6} segments={track['segments']:<3} total={track['total_seconds']:>7.2f}s  min/med/max={pacing}{uniform}")

    if report.get("text_styles"):
        print("\ntext styles (identical styling collapsed):")
        for style in report["text_styles"]:
            print(f"  x{style['count']}  {style['fill']} fill, {style['outline_width']} {style['outline_color']} outline, "
                  f"bold={style['bold']}, pos=({style['pos_x']}, {style['pos_y']}), scale={style['scale']}")
        texts = [t["text"] for t in report["text_layers"]]
        print(f"  texts: {texts[:8]}{' ...' if len(texts) > 8 else ''}")

    if report["transitions"]:
        print("\ntransitions:")
        for name, count in Counter(t["name"] for t in report["transitions"]).items():
            secs = [t["seconds"] for t in report["transitions"] if t["name"] == name]
            print(f"  {name:<20} x{count}  durations={secs}")
    else:
        print("\ntransitions: none  (hard cuts only)")

    if report["speed_changes"]:
        print(f"\nspeed changes: {report['speed_changes']}")
    else:
        print("\nspeed changes: none (all clips play at 1.0x)")

    if report["animations"]:
        print(f"\nanimations: {Counter(a['name'] for a in report['animations']).most_common()}")
    else:
        print("animations   : none")

    if report["audio"]:
        print("\naudio segments:")
        for item in report["audio"]:
            print(f"  start={item['start']:>7.2f}s dur={item['seconds']:>6.2f}s volume={item['volume']} ({item['gain_db']} dB) fade={item['fade']}")
        if report.get("audio_sources"):
            print(f"  sources: {[s['name'] for s in report['audio_sources']]}")


if __name__ == "__main__":
    main()
