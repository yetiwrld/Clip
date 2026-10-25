# Technical Textbook: CapCut Desktop and Modern Video Editor Architecture

**Status:** Work in progress, delivered as numbered Markdown parts.
**Research date:** 25 October 2026
**Scope:** Research and documentation only. No application code is built.

---

## 0.1 Evidence conventions (used in every chapter)

Every claim carries one of these labels.

| Label | Meaning |
|---|---|
| **[OFFICIAL]** | Stated on a CapCut-owned page (capcut.com help center, etc.) |
| **[SECONDARY]** | Stated by a third-party guide, course, or archive; not confirmed by CapCut |
| **[OBSERVED]** | Seen directly in a demonstration or screenshot that is cited |
| **[GENERAL]** | General video-editing or software-engineering knowledge, not specific to CapCut |
| **[PROPOSED]** | A design suggested for an original editor; not a claim about CapCut |
| **[UNKNOWN]** | Could not be verified; do not rely on it |

Each chapter keeps three layers apart:

- **Layer A:** observable CapCut behavior
- **Layer B:** general technical explanation
- **Layer C:** possible implementation approaches for an original Windows editor

A behavior seen in CapCut does not prove CapCut's internal design. A good design for a new editor does not describe CapCut's internals.

## 0.2 Limits of the research method

- I could not run CapCut myself. Layer A rests on documentation, help pages, and cited third-party demonstrations. Nothing here is a first-hand test of the application.
- Much of the searchable material about CapCut is third-party (blogs, courses, archive sites). Rows that rest only on such sources are labeled **[SECONDARY]** or lower.
- CapCut's own help center is the target primary source. Pages not yet read are listed in section 0.4.
- Interface labels, shortcut keys, and feature availability change between versions, regions, subscription tiers, and rollout experiments.

## 0.3 Master table of contents and status

| Part | Chapters | Status |
|---|---|---|
| 0 | Master TOC, conventions, research log | **Done (this file)** |
| 1 | Ch 1 Understanding CapCut Desktop | **Draft v1 delivered** (`01_chapter_1_understanding_capcut_desktop.md`) |
| 1 | Ch 2 Interface and workspace | **Draft v1 delivered** (`02_...md`; label-level evidence only) |
| 1 | Ch 3 Control encyclopedia | **Draft v1 delivered, partial** (`03_...md`; 35 controls of many) |
| 1 | Ch 4 Interaction sequences | **Draft v1 delivered, partial** (`04_...md`; 25 workflows, few documented) |
| 2 | Ch 5 State | **Draft v1 delivered** (`05_...md`) |
| 2 | Ch 6 Video fundamentals | **Draft v1 delivered** (`06_...md`; standards citations pending) |
| 2 | Ch 7 Media management | **Draft v1 delivered** (`07_...md`) |
| 2 | Ch 8 Timeline engine | **Draft v1 delivered** (`08_...md`) |
| 2 | Ch 9 Playback and rendering | **Draft v1 delivered** (`09_...md`) |
| 3 | Ch 10 Properties and animation | **Draft v1 delivered** (`10_...md`; CapCut property set unverified) |
| 3 | Ch 11 Effects, compositing, transitions | **Draft v1 delivered** (`11_...md`; CapCut effects unverified) |
| 3 | Ch 12 Text and captions | **Draft v1 delivered** (`12_...md`; subtitle spec citations pending) |
| 3 | Ch 13 Audio | **Draft v1 delivered** (`13_...md`; loudness standard citations pending) |
| 3 | Ch 14 Color | **Draft v1 delivered** (`14_...md`; color standard citations pending) |
| 3 | Ch 15 Export | **Draft v1 delivered** (`15_...md`; CapCut export dialog unverified) |
| 3 | Ch 16 Projects, undo, recovery | **Draft v1 delivered** (`16_...md`; Microsoft file-API citations pending) |
| 4 | Ch 17 Shortcuts | **Draft v1 delivered** (`17_...md`; all CapCut keys secondary-sourced) |
| 4 | Ch 18 AI features | **Draft v1 delivered** (`18_...md`; auto captions cloud-dependent per official page) |
| 4 | Ch 19 Windows architecture | **Draft v1 delivered** (`19_...md`; Qt/Microsoft/GStreamer docs still to fetch) |
| 4 | Ch 20 Performance on target PC | **Draft v1 delivered** (`20_...md`; hardware codec support unverified) |
| 4 | Ch 21 Reliability and testing | **Draft v1 delivered** (`21_...md`) |
| 4 | Ch 22 Scope and prioritization | **Draft v1 delivered** (`22_...md`) |
| 5 | Ch 23 Data models | **Draft v1 delivered** (`23_...md`) |
| 5 | Ch 24 Pseudocode | **Draft v1 delivered** (`24_...md`) |
| 5 | Ch 25 Diagrams | **Draft v1 delivered** (`25_...md`) |
| 5 | Ch 26 Glossary and reference tables | **Draft v1 delivered** (`26_...md`) |
| IV | Section 29 Technical decisions reference | **Draft v1 delivered** (`29_technical_decisions_reference.md`) |
| 6 | Coverage audit, uncertainty register, coding-agent handoff, DOCX/PDF assembly | Outstanding |

Parts 2, 4 (architecture and performance), and 5 depend mostly on general engineering knowledge and official technical documentation (FFmpeg, Qt, Microsoft). They can proceed without further CapCut research.

## 0.4 Research log

### Sources read so far

| # | Source | Publisher | Type | What it supports |
|---|---|---|---|---|
| S1 | Why Should I Update to a New Version of CapCut? https://www.capcut.com/help/why-update-to-a-new-version | CapCut | **[OFFICIAL]** | Desktop update paths: download the installer from the official site, or use the Update button in the app's top-right corner |
| S2 | CapCut Complete Guide 2026 https://bigvu.tv/blog/capcut-complete-guide-2026-download-templates-pricing-when-switch/ | BIGVU (a competing product vendor) | **[SECONDARY]**, commercial interest | Desktop runs on Windows 10+ and macOS 10.15+; templates differ across mobile, desktop, and web; mobile-template projects can display incorrectly on desktop |
| S3 | CapCut 6.0 Beta 5 / 5.9.1 version guide https://macmyths.com/capcut-6-0-beta-5-5-9-1-what-the-versions-mean-and-which-to-use/ | MacMyths | **[SECONDARY]** | A FileHippo archive lists 5.9.1 for Windows at 31 March 2025 and a 6.0 line after it. Archive dates are not official release dates |
| S4 | CapCut shortcuts cheat sheet https://fastshortcuts.com/shortcuts/capcut/ | FastShortcuts | **[SECONDARY]** | Keyboard panel is opened from a keyboard icon in the project's top toolbar; shortcuts are desktop-only; a conflict warning appears when rebinding; letter shortcuts do not work while a text field is focused; the Export binding varies by build |
| S5 | CapCut desktop tutorial https://primalvideo.com/guides/capcut-for-pc-mac-tutorial/ | Primal Video | **[SECONDARY]** | Mac and Windows layouts match; selectable layouts exist, including a vertical-video workspace; free tier is more limited than before |
| S6 | Skillademia shortcuts page https://www.skillademia.com/shortcuts/capcut-shortcuts/ | Skillademia | **[SECONDARY]**, commercial interest | Claims of 4K export, keyframes, speed curves, multi-track editing (unverified) |
| S7 | How Do I Export 2K/4K Videos in CapCut? https://www.capcut.com/help/export-videos-in-capcut (dated 14 Jan 2026; accessed 25 Oct 2026) | CapCut Help Center | **[OFFICIAL]** | Windows 10 (64-bit)+ and macOS 12+ requirement; desktop export 2K/4K, frame rate up to 60 fps depending on source, bitrate adjustable; hardware/storage caveat; 4K availability conditions per platform; mobile templates sync to desktop |
| S8 | How to Use CapCut on PC & Mac https://www.capcut.com/resource/how-to-use-capcut-on-pc (dated 10 Oct 2026; accessed 25 Oct 2026) | CapCut resource article | **[OFFICIAL]**, tutorial/marketing; screenshots not viewable by me | Create project, Import, Split, Auto reframe, Transition/Filters/Effects tabs, Auto captions, Audio/Voice changer, Text to speech, AI media, Export settings, Pro+ upgrade |
| S9 | Why Aren't Auto Captions Working in CapCut? https://www.capcut.com/help/auto-captions (accessed 25 Oct 2026) | CapCut Help Center | **[OFFICIAL]** | Auto captions rely on speech recognition and cloud processing; connection issues can interrupt; silent audio prevents captions |
| S10 | Is CapCut AI Safe to Use? https://www.capcut.com/help/is-capcut-ai-safe-to-use (accessed 25 Oct 2026) | CapCut Help Center | **[OFFICIAL]** | AI tools may process text/image/video/audio; advises caution with sensitive content; no per-feature locations |

### Sources still to read (priority order)

1. CapCut help center pages on export settings, system requirements, project and draft management, keyframes, captions, and AI tools
2. CapCut Microsoft Store listing (version, size, requirements)
3. CapCut's own shortcut documentation
4. FFmpeg official documentation (ffmpeg.org/documentation.html)
5. Qt official documentation (doc.qt.io), including Qt Multimedia
6. GStreamer official documentation
7. Microsoft Learn: Media Foundation, Direct3D 11/12, DXVA, Windows app data locations
8. Adobe Premiere Pro and DaVinci Resolve manuals (for general editing concepts)

### Current known uncertainties

- Current Windows version number as of October 2026: **[UNKNOWN]**
- Exact current free versus Pro feature split: **[UNKNOWN]** (sources conflict or are commercial)
- Whether any named AI feature runs locally or remotely: **[UNKNOWN]** pending official statements
- CapCut project file format and internal architecture: **[UNKNOWN]**, not publicly documented as far as found

## 0.5 Companion deliverables (added 25 Oct 2026)

| File | Contents |
|---|---|
| `D1_coverage_audit_and_matrix.md` | Coverage audit and matrix (audit did not fully pass; gaps listed) |
| `D2_research_and_uncertainty_register.md` | Bibliography, verified vs secondary claims, gaps |
| `D3_executive_technical_overview.md` | Executive overview |
| `D4_coding_agent_handoff.md` | Handoff guide for the coding agent |

Status: all 26 chapters and the decisions table have first drafts; Chapters 2, 3, 4, 17, 18 are partial; DOCX/PDF assembly not done.
