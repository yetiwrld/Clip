# Research and Uncertainty Register (Deliverable D)

**Research date:** 25 October 2026. Current CapCut Desktop for Windows version: **not determined**.

---

## D.1 Consolidated bibliography (sources actually read)

| ID | Title and URL | Publisher | Date | Type |
|---|---|---|---|---|
| S1 | Why Should I Update to a New Version of CapCut? https://www.capcut.com/help/why-update-to-a-new-version | CapCut | undated | OFFICIAL |
| S2 | CapCut Complete Guide 2026 https://bigvu.tv/blog/capcut-complete-guide-2026-download-templates-pricing-when-switch/ | BIGVU | 2026 | SECONDARY, commercial interest |
| S3 | CapCut 6.0 Beta / 5.9.1 versions https://macmyths.com/capcut-6-0-beta-5-5-9-1-what-the-versions-mean-and-which-to-use/ | MacMyths | n/a | SECONDARY |
| S4 | CapCut shortcuts cheat sheet https://fastshortcuts.com/shortcuts/capcut/ | FastShortcuts | n/a | SECONDARY |
| S5 | CapCut for PC & Mac tutorial https://primalvideo.com/guides/capcut-for-pc-mac-tutorial/ | Primal Video | 2026 | SECONDARY |
| S6 | CapCut Keyboard Shortcuts https://www.skillademia.com/shortcuts/capcut-shortcuts/ | Skillademia | n/a | SECONDARY, commercial interest |
| S7 | How Do I Export 2K/4K Videos in CapCut? https://www.capcut.com/help/export-videos-in-capcut | CapCut Help Center | 14 Jan 2026 | OFFICIAL |
| S8 | How to Use CapCut on PC & Mac https://www.capcut.com/resource/how-to-use-capcut-on-pc | CapCut | 10 Oct 2026 | OFFICIAL (tutorial) |
| S9 | Why Aren't Auto Captions Working in CapCut? https://www.capcut.com/help/auto-captions | CapCut Help Center | n/a | OFFICIAL |
| S10 | Is CapCut AI Safe to Use? https://www.capcut.com/help/is-capcut-ai-safe-to-use | CapCut Help Center | n/a | OFFICIAL |
| S11 | How to Split a Clip in CapCut on Desktop and Phone https://www.lilachbullock.com/?p=152619 | Lilach Bullock | n/a | SECONDARY |
| S12 | Capcut Tool Cheat Sheet (PDF) https://litcommerce.com/wp-content/uploads/2025/06/Capcut-Tool-Cheat-Sheet.pdf | Litcommerce | 2025 | SECONDARY |
| S13 | CapCut's Latest Terms of Service and Pricing Just Got Worse https://podcastle.ai/blog/capcut-terms-of-service | Podcastle (competitor) | n/a | SECONDARY, commercial interest, unverified |
| F1 | FFmpeg Documentation index https://ffmpeg.org/doxygen/0.10/index.html | FFmpeg project | 0.10 docs | OFFICIAL technical (older release docs) |
| F2 | Libavfilter Documentation https://ffmpeg.org/libavfilter.html | FFmpeg project | n/a | OFFICIAL technical |
| H1 | AMD Ryzen 5 4600U specs https://www.notebookcheck.net/AMD-Ryzen-5-4600U-Laptop-Processor-Benchmarks-and-Specs.449977.0.html | Notebookcheck | n/a | SECONDARY |
| H2 | AMD Ryzen 5 4600U https://www.cpu-monkey.com/en/cpu-amd_ryzen_5_4600u | CPU-Monkey | n/a | SECONDARY |

Note: F1 documents FFmpeg 0.10-era libraries; current FFmpeg versions should be checked on ffmpeg.org before implementation.

Sources seen in search results but **not used** because unreliable or irrelevant: assorted blogs with generic or machine-written text; opencut.app (a different product).

## D.2 Claims verified against CapCut-owned pages

- Desktop app requires Windows 10 (64-bit) or later (S7).
- Export panel reachable via top-right Export; resolution, frame rate, bitrate settings exist; 2K/4K available on desktop subject to conditions (S7, S8).
- Frame rate up to 60 fps depending on source (S7).
- Auto captions: Captions > Auto captions, language selection, Generate (S8); processing relies on cloud (S9).
- Other documented UI labels listed in Chapter 3 (S8).
- In-app Update button and reinstall path (S1).
- Plan upgrade named "Pro+" in S8; free/paid boundaries not specified.

## D.3 Claims supported only by secondary sources

- Keyboard shortcuts and their keys (Chapter 17).
- Export frame-rate list (24, 25, 30, 50, 60), CBR/VBR options, recommended bitrate presets, estimated file size in the export dialog.
- Shortcut panel behavior: icon in the top toolbar, conflict warnings, letter keys disabled while text fields are focused.
- Mobile-template compatibility problems on desktop (contradicted or refined by S7).
- Terms-of-service licensing claims (S13).
- Hardware details of the Ryzen 5 4600U and its Vega iGPU (H1, H2).
- Version history (5.9.1 at 31 Mar 2025) from archive sites.

## D.4 Features whose availability varies

Resolution options (hardware, OS, source media, plan), frame-rate ceilings, watermark and bitrate limits, Pro+ assets, AI features (credits, plan, region, account), templates (region, network), cloud projects. All **UNKNOWN in detail**.

## D.5 Proprietary details not verifiable

CapCut's media engine, rendering architecture, GPU usage, project file format and location, cache layout, undo implementation, effect implementations, AI model hosting and architecture, autosave behavior, timeline data structures, and update mechanism. No evidence was found for any of them. Nothing in the textbook asserts them; all architecture is **[PROPOSED]**.

## D.6 Research gaps

| Gap | Impact |
|---|---|
| First-hand observation of the app | Chapters 2-4 and 17 incomplete |
| CapCut release notes and current version | Version-dependent claims uncertain |
| CapCut Terms and Privacy Policy | Chapter 18 data handling unverified |
| AMD official specs, codec support on the target iGPU | Chapter 20 hardware decode/encode unknown |
| Microsoft Learn documentation | Chapters 7, 9, 16, 19 platform claims uncited |
| Qt, Electron, GStreamer docs and licenses | Chapter 19 option comparison unverified |
| Standards: ITU-R BT.709/1886/2020/2100/1770, subtitle formats, ISO base media | Chapters 6, 12, 13, 14 uncited |
| Adobe and DaVinci Resolve documentation | Comparison material absent |

## D.7 Areas the future coding agent must independently validate

1. Codec/profile hardware decode and encode support on the target PC (runtime probing).
2. Licensing of any media library or codec chosen (FFmpeg build configuration, codec patents, GUI framework licenses).
3. Windows file-replacement and flush semantics for atomic saves.
4. Actual preview and export performance on the 4600U (benchmark plan in Chapter 20).
5. Standards-compliant behavior for subtitle formats, color tagging, and loudness measurement.
6. Whether any CapCut behavior described here (labels, shortcuts) is current; the app changes frequently.
7. Terms-of-use and trademark/IP boundaries: build an original product; do not copy CapCut's interface, branding, templates, or assets.
