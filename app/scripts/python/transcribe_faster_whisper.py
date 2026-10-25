#!/usr/bin/env python3
"""Run offline speech transcription with faster-whisper.

The Node host owns process management and cancellation. This helper writes one
JSON result to stdout; progress records and library diagnostics go to stderr so
stdout always remains machine-readable.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def emit_error(code: str, message: str) -> None:
    print(json.dumps({"error": {"code": code, "message": message}}, ensure_ascii=False), flush=True)


def emit_progress(progress: float, message: str) -> None:
    print(json.dumps({"progress": max(0.0, min(1.0, progress)), "message": message}), file=sys.stderr, flush=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Transcribe media using faster-whisper")
    parser.add_argument("--input", required=True, help="Path to source media")
    parser.add_argument("--model", required=True, choices=("tiny", "base", "small", "medium"))
    parser.add_argument("--model-dir", required=True, help="Directory used to cache downloaded models")
    parser.add_argument("--device", default="cpu", choices=("cpu", "cuda"))
    parser.add_argument("--compute", default="int8", choices=("int8", "float16"))
    parser.add_argument("--beam-size", type=int, default=5, choices=(1, 3, 5))
    parser.add_argument("--language", default=None, help="Optional BCP-47 language code")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source = Path(args.input)
    if not source.is_file():
        emit_error("INPUT_MISSING", "The input media file does not exist.")
        return 2

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        emit_error("FASTER_WHISPER_NOT_INSTALLED", "Install faster-whisper with: python -m pip install faster-whisper")
        return 2

    try:
        Path(args.model_dir).mkdir(parents=True, exist_ok=True)
        emit_progress(0.0, "Loading speech model")
        model = WhisperModel(
            args.model,
            device=args.device,
            compute_type=args.compute,
            download_root=args.model_dir,
        )
    except Exception as exc:  # model downloads, CTranslate2 setup and corrupt caches
        emit_error("MODEL_LOAD_FAILED", str(exc)[:800])
        return 1

    try:
        segments_iter, info = model.transcribe(
            str(source),
            language=args.language,
            beam_size=args.beam_size,
            word_timestamps=True,
        )
        duration = max(0.0, float(getattr(info, "duration", 0.0) or 0.0))
        segments: list[dict[str, Any]] = []
        last_progress = -1.0
        for segment in segments_iter:
            text = str(getattr(segment, "text", "") or "").strip()
            start = max(0.0, float(getattr(segment, "start", 0.0) or 0.0))
            end = max(start, float(getattr(segment, "end", start) or start))
            if not text or end <= start:
                continue
            words: list[dict[str, Any]] = []
            for word in getattr(segment, "words", None) or []:
                word_text = str(getattr(word, "word", "") or "").strip()
                word_start = max(0.0, float(getattr(word, "start", start) or start))
                word_end = max(word_start, float(getattr(word, "end", word_start) or word_start))
                if word_text and word_end > word_start:
                    words.append({"word": word_text, "start": word_start, "end": word_end})
            row: dict[str, Any] = {"start": start, "end": end, "text": text}
            if words:
                row["words"] = words
            segments.append(row)

            progress = min(0.99, end / duration) if duration > 0 else min(0.99, len(segments) / (len(segments) + 8.0))
            if progress - last_progress >= 0.02:
                emit_progress(progress, "Transcribing audio")
                last_progress = progress

        if not segments:
            emit_error("NO_SPEECH", "No speech segments were detected in this audio.")
            return 1
        result = {"language": getattr(info, "language", None), "segments": segments}
        print(json.dumps(result, ensure_ascii=False, separators=(",", ":")), flush=True)
        return 0
    except Exception as exc:  # decoder/inference errors
        emit_error("TRANSCRIPTION_FAILED", str(exc)[:800])
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
