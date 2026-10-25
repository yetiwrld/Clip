#!/usr/bin/env python3
"""Local transcript-segment speaker grouping using Resemblyzer voice embeddings.

The script never uploads audio. It may fetch the pretrained voice-encoder weights
once on first use; later runs use the model cache. Speaker numbers are similarity
groups, not real-world identity claims.
"""
from __future__ import annotations

import argparse
import json
import sys
from typing import Any

RESULT_PREFIX = "CLIPWRIGHT_DIARIZATION_RESULT:"
PROGRESS_PREFIX = "CLIPWRIGHT_DIARIZATION_PROGRESS:"
COSINE_DISTANCE_THRESHOLD = 0.34


def report(progress: float, message: str) -> None:
    record = {"progress": max(0.0, min(1.0, progress)), "message": message}
    print(PROGRESS_PREFIX + json.dumps(record, separators=(",", ":")), file=sys.stderr, flush=True)


def normalize(vector: Any, np: Any) -> Any:
    vector = np.asarray(vector, dtype=np.float32)
    norm = float(np.linalg.norm(vector))
    if not norm or not np.isfinite(norm):
        return vector
    return vector / norm


def greedy_cluster(embeddings: list[Any], np: Any) -> list[int]:
    """Bounded-memory fallback for unusually large transcripts."""
    centroids: list[Any] = []
    counts: list[int] = []
    labels: list[int] = []
    threshold = 1.0 - COSINE_DISTANCE_THRESHOLD
    for embedding in embeddings:
        if not centroids:
            centroids.append(embedding.copy())
            counts.append(1)
            labels.append(0)
            continue
        similarities = np.asarray([float(np.dot(center, embedding)) for center in centroids])
        best = int(np.argmax(similarities))
        if float(similarities[best]) < threshold:
            centroids.append(embedding.copy())
            counts.append(1)
            labels.append(len(centroids) - 1)
        else:
            labels.append(best)
            counts[best] += 1
            centroids[best] = normalize(centroids[best] * (counts[best] - 1) + embedding, np)
    return labels


def cluster_embeddings(embeddings: list[Any], np: Any) -> list[int]:
    if len(embeddings) <= 1:
        return [0] * len(embeddings)
    if len(embeddings) > 1200:
        return greedy_cluster(embeddings, np)

    from scipy.cluster.hierarchy import fcluster, linkage
    from scipy.spatial.distance import pdist

    matrix = np.vstack(embeddings)
    distances = pdist(matrix, metric="cosine")
    distances = np.nan_to_num(distances, nan=1.0, posinf=1.0, neginf=1.0)
    tree = linkage(distances, method="average")
    labels = fcluster(tree, t=COSINE_DISTANCE_THRESHOLD, criterion="distance")
    return [int(label) for label in labels]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True)
    parser.add_argument("--segments", required=True)
    args = parser.parse_args()

    try:
        import numpy as np
        import soundfile as sf
        from resemblyzer import VoiceEncoder, preprocess_wav

        with open(args.segments, "r", encoding="utf-8") as file:
            segments = json.load(file)
        if not isinstance(segments, list) or not segments:
            raise ValueError("No transcript segments were provided.")

        report(0.02, "Loading the local voice model")
        encoder = VoiceEncoder(device="cpu", verbose=False)
        audio, sample_rate = sf.read(args.audio, dtype="float32", always_2d=True)
        audio = np.mean(audio, axis=1)
        if sample_rate != 16000 or len(audio) < sample_rate // 2:
            raise ValueError("The extracted audio is too short or is not 16 kHz mono.")

        embeddings: list[Any] = []
        embedded_segment_ids: list[int] = []
        total = len(segments)
        report(0.12, "Building local voice embeddings")
        update_every = max(1, total // 30)
        for index, segment in enumerate(segments):
            try:
                segment_id = int(segment["id"])
                start = max(0.0, float(segment["start"]))
                end = min(len(audio) / sample_rate, float(segment["end"]))
                if end <= start:
                    continue
                # Short ASR phrases benefit from a little padding; very short
                # fragments are skipped rather than guessed as a new speaker.
                start = max(0.0, start - 0.08)
                end = min(len(audio) / sample_rate, end + 0.08)
                center = (start + end) / 2
                if end - start < 1.15:
                    start = max(0.0, center - 0.575)
                    end = min(len(audio) / sample_rate, center + 0.575)
                left = max(0, int(start * sample_rate))
                right = min(len(audio), int(end * sample_rate))
                if right - left < int(0.55 * sample_rate):
                    continue
                waveform = preprocess_wav(audio[left:right], source_sr=sample_rate)
                if waveform is None or len(waveform) < int(0.45 * sample_rate):
                    continue
                embedding = normalize(encoder.embed_utterance(waveform), np)
                if not np.all(np.isfinite(embedding)):
                    continue
                embeddings.append(embedding)
                embedded_segment_ids.append(segment_id)
            except Exception:
                # A single empty/noisy/invalid segment should not abort the
                # full transcript; it remains unassigned for manual correction.
                pass

            if index % update_every == 0 or index + 1 == total:
                fraction = (index + 1) / total
                report(0.12 + fraction * 0.62, f"Comparing voice samples ({index + 1} of {total})")

        if not embeddings:
            raise ValueError("No transcript segment contained enough clear speech for a voice embedding.")

        report(0.78, "Grouping similar local voice samples")
        raw_labels = cluster_embeddings(embeddings, np)
        first_seen: dict[int, int] = {}
        for order, label in enumerate(raw_labels):
            first_seen.setdefault(label, order)
        ordered_labels = {label: index for index, label in enumerate(sorted(first_seen, key=first_seen.get))}
        assignments_by_id = {
            segment_id: ordered_labels[label]
            for segment_id, label in zip(embedded_segment_ids, raw_labels)
        }
        assignments = [
            {"segmentId": int(segment["id"]), "speaker": assignments_by_id.get(int(segment["id"]))}
            for segment in segments
        ]
        speaker_count = len(set(assignments_by_id.values()))
        report(0.96, f"Found {speaker_count} local voice group{'s' if speaker_count != 1 else ''}")
        result = {"assignments": assignments, "speakerCount": speaker_count}
        print(RESULT_PREFIX + json.dumps(result, separators=(",", ":")), flush=True)
        return 0
    except Exception as error:
        print(f"Local diarization error: {error}", file=sys.stderr, flush=True)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
