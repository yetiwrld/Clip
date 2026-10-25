# Coverage Audit and Matrix (Textbook section 31)

**Audit date:** 25 October 2026. **Method:** I listed the delivered files, counted words per file with `wc -w`, and confirmed that each chapter file contains the "What a Future Coding Agent Must Understand" section (all 26 do). I compared each chapter against the brief's required topic lists. I did **not** re-verify every citation against its source a second time, and I did **not** run CapCut.

**Result: the audit did not pass in full.** The general-engineering chapters meet their scope. The CapCut-specific chapters (2, 3, 4, 17, 18) are materially incomplete because first-party documentation was thin and I had no first-hand access to the application.

---

## 31.1 Size check

- Total delivered text, all `.md` files including the TOC: about 33,200 words; the 26 chapters plus the decisions table: about 31,600 words. This is inside the brief's "30,000-50,000 words or more when research supports it" range at the low end.
- Word count is not depth. The general chapters average about 1,200 words each, which is compact. Several required topics get a paragraph where a textbook would give a section (see gaps below). The brief asked me to prioritize accuracy and coverage over word count; coverage is incomplete where marked.

## 31.2 Required-topic coverage matrix

Evidence quality scale: **A** = official CapCut source; **B** = official technical documentation (FFmpeg) only; **C** = secondary sources only; **D** = general knowledge, no source cited; **N** = none/unknown.

| Required topic (brief) | Chapter / file | Evidence quality | Outstanding gaps |
|---|---|---|---|
| What CapCut Desktop is, users, vs web/mobile | 1 | A (limited), C | Official comparison page not read; current version unknown |
| Feature map | 1 | C | |
| Interface regions | 2 | A (labels only) | Layout, menus, settings, context menus, account controls, shortcuts panel not verified; screenshots not viewed |
| Control catalog with 13 columns | 3 | A (35 controls) | Most controls absent; several requested columns merged into one |
| 25 workflows | 4 | A for about 8, D for rest | Behavior for most workflows is proposed only |
| State management | 5 | D | No sources cited |
| Video fundamentals | 6 | B (library roles), D | Standards (ITU-R, ISO) not cited |
| Media import and files | 7 | B, D | Windows path/permission documentation not cited |
| Timeline engine | 8 | D | Worked examples included; no CapCut behavior verified |
| Playback/preview/render | 9 | B, D | Media Foundation/Direct3D docs not cited |
| Properties, animation | 10 | C (existence), D | CapCut ranges/defaults unknown |
| Effects, compositing, transitions | 11 | B, C, D | CapCut effect catalog unverified |
| Text, captions | 12 | A (auto captions flow), D | Subtitle format specs not cited; font controls unverified |
| Audio | 13 | B, C, D | Loudness standards not cited |
| Color | 14 | B, C, D | Color standards not cited; CapCut controls unverified |
| Export | 15 | A (settings and conditions), C, D | Progress/cancel/failure UI, hardware acceleration toggle unknown |
| Project files, undo, recovery | 16 | D | CapCut format unknown; Microsoft file-API docs not cited |
| Shortcuts and interaction | 17 | C only | No official shortcut page read |
| AI features | 18 | A (captions cloud dependence), C | Local/remote for most features unknown; Terms/Privacy not read |
| Windows architecture | 19 | B (FFmpeg only), D | Qt, Electron, GStreamer, Microsoft, packaging docs not fetched |
| Performance on target PC | 20 | C (hardware specs), D | AMD official specs and codec support not verified; no benchmarks (by design) |
| Reliability and testing | 21 | D | |
| Scope prioritization | 22 | D | |
| Data models | 23 | D (proposed) | |
| Pseudocode | 24 | D (proposed) | |
| Diagrams (12 required) | 25 | D (proposed) | All 12 delivered |
| Glossary and distinctions | 26 | D | 39 terms; all required terms present; 10 distinctions delivered |
| Technical decisions | 29 | D | 21 decisions; no decisions made, as required |

## 31.3 Brief requirements not fully met

1. **Primary-source research (Part I, section 3):** the brief required Qt, GStreamer, Microsoft, Adobe, and DaVinci Resolve official documentation and CapCut release notes. I fetched only FFmpeg library pages and two CapCut help/resource pages. This is the largest shortfall.
2. **Citations "adjacent to claims," consolidated bibliography with titles, publishers, URLs, dates:** per-chapter citations exist; a consolidated bibliography is in `D2_research_and_uncertainty_register.md` for the sources actually read. Many general technical claims carry no citation.
3. **Screenshots:** none included or inspected.
4. **Version and research date:** research date recorded (25 Oct 2026); CapCut Desktop version number **not found**.
5. **Chapter 3 columns:** the 13 requested columns were not all populated; unverified ones were merged (stated in the chapter).
6. **"Never present an incomplete textbook as complete":** this audit states that it is incomplete.
7. **DOCX/PDF assembly:** not done; delivered as Markdown chapters, which the brief permits as the fallback format. A DOCX and PDF can be produced from these files on request.
8. **Shortcut reference table with source citations:** delivered, but all entries are secondary.
9. **Annotated screenshots (section Chapter 2):** not possible without the application or image access.

## 31.4 Checks that passed

- Every chapter keeps proposed designs labeled as proposed and CapCut internals labeled unknown.
- The "What a Future Coding Agent Must Understand" section is present in all 26 chapters.
- Technical decisions are not made on the coding agent's behalf.
- No application code beyond illustrative pseudocode and data sketches was written; no software was installed or built.
- No benchmark results for the target PC are claimed.

## 31.5 Recommended next steps to close gaps (in priority order)

1. First-hand observation of CapCut Desktop (screen recording or screenshots) to complete Chapters 2, 3, 4, 17.
2. Fetch and cite: CapCut Terms of Service and Privacy Policy; AMD specification page for the Ryzen 5 4600U; Microsoft Learn (Media Foundation, DXVA, Direct3D, known folders, file replace APIs); Qt documentation and licensing; GStreamer; FFmpeg license page; subtitle and color standards.
3. Add a consolidated bibliography with access dates.
4. Expand compact chapters where the brief asked for depth (timeline, rendering, audio, color), with more worked examples.
5. Produce the DOCX/PDF if desired.
