# Coding-Agent Handoff Reference (Deliverable E)

**Date:** 25 October 2026.

## 1. What this package is

A **research reference** for designing an original Windows desktop video editor. It is **not** proof of CapCut's private architecture, and it is **not** a specification to copy. Do not reproduce CapCut's interface, branding, templates, stock assets, or protected content. Use the concepts and general interaction patterns to design an original product.

Treat evidence labels literally: OFFICIAL, SECONDARY, GENERAL, PROPOSED, UNKNOWN (definitions in `00_master_toc_and_research_log.md`). PROPOSED designs are suggestions, not facts about CapCut.

## 2. Your starting constraints

- Target machine: Windows 11 Pro 64-bit, AMD Ryzen 5 4600U (6 cores / 12 threads, 15 W-class), integrated AMD Radeon graphics sharing system RAM, 16 GB RAM, about 1.14 TB storage, development in Visual Studio Code.
- Local processing is the default goal. Mark every feature that needs the network, an account, or a paid service.
- No language, GUI framework, or media library is mandated. The decisions table (`29_technical_decisions_reference.md`) lists options and criteria; make decisions with evidence from small spikes on the target PC.

## 3. Reading order

| Before you decide or implement... | Read |
|---|---|
| Overall scope and dependencies | 22, 29 |
| Time, timeline data, edit operations | 6, 8, 23, 24 |
| Project structure, saving, undo, recovery | 5, 16, 23, 24 |
| Media import, assets, caches, proxies | 7, 20, 23 |
| Preview, playback, rendering | 9, 10, 11, 14, 25 |
| Text and captions | 12, 18 |
| Audio | 13 |
| Export | 15, 6 |
| UI behavior and shortcuts | 2, 3, 4, 5, 17 |
| AI features | 18, 22 |
| Windows architecture and packaging | 19, 29 |
| Performance on this PC | 20 |
| Testing and reliability | 21 |
| Terminology | 26 |
| Gaps and cautions | `D1_coverage_audit_and_matrix.md`, `D2_research_and_uncertainty_register.md` |

## 4. Rules distilled from the book

1. Exact time (integer ticks or rationals); never float seconds for stored times.
2. Clips reference assets by id; edits change ranges and parameters, never source files.
3. All project changes go through commands; commands are undoable; drags are one transaction.
4. Preview and export share the same evaluation code; they differ only in quality settings and media sources (proxies versus originals).
5. Save atomically with validation and a backup; autosave elsewhere; version the file format from day one.
6. Keep caches and proxies disposable; bound them by bytes; make background jobs cancellable and prioritized.
7. Detect hardware decode and encode capability at runtime; keep software fallbacks; allow disabling acceleration.
8. Do not run heavy work on the UI thread; snapshot project state for export.
9. Treat AI features as optional providers with consent, cost, and offline behavior; store results as normal editable data.
10. Report errors with specific causes and recovery actions; log without capturing private content.

## 5. What you must verify yourself

- Current official documentation for any library, framework, or API you choose (versions, license terms, Windows support).
- Hardware codec support and real performance on the target PC (benchmark plan in Chapter 20).
- Standards behind subtitle formats, color tagging, loudness, and containers.
- Anything in Chapters 2, 3, 4, 17, 18 you intend to rely on: they are partial and partly secondary-sourced.

## 6. Suggested workflow for the coding agent

1. Read this file, then Chapters 22 and 29.
2. Propose an architecture and a decision log; run spikes for the blocking decisions (GUI, media engine, hardware acceleration, preview strategy).
3. Build the time model, project model, command layer, and tests before the UI (Chapters 8, 16, 21, 23, 24).
4. Build probe/import, preview, then export on top of one shared evaluation path.
5. Keep a conformance media corpus and golden projects from the start.
6. Re-check the uncertainty register before each milestone.

## 7. Out of scope for this package

No source code, repository, installer, or benchmark results. No claims about CapCut's source code or private APIs.
