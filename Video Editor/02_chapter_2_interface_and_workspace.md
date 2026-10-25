# Chapter 2: Complete Interface and Workspace Analysis

**Draft v1, 25 October 2026.** Evidence base for this chapter is small. Two CapCut-owned pages were read in full:

- **[S7]** "How Do I Export 2K/4K Videos in CapCut?" CapCut Help Center, dated 14 Jan 2026. https://www.capcut.com/help/export-videos-in-capcut (accessed 25 Oct 2026)
- **[S8]** "How to Use CapCut on PC & Mac" CapCut resource article, dated 10 Oct 2026. https://www.capcut.com/resource/how-to-use-capcut-on-pc (accessed 25 Oct 2026)

Both are official but are tutorial/marketing pages, not an interface specification. They describe labels in prose and show screenshots **that I could not view** (only their alt-text captions were available). I did not run CapCut. **Therefore everything below is [OFFICIAL-DOCUMENTED] at the level of label and sequence only; screen positions, exact layout, and behavior are [UNKNOWN] unless stated.** Third-party items are marked [SECONDARY].

---

## 2.1 Regions that official text confirms exist

| Region | What the official text says | Evidence |
|---|---|---|
| Start/home screen | A main interface offering "Create project"; also feature cards such as "AI video maker" and "AI design" on the start screen | S8 text and screenshot captions |
| Media panel (left) | An "Import" control sits in the media panel on the left | S8 screenshot caption: import control highlighted in the media panel on the left |
| Left sidebar | Contains an "AI media" entry with "AI video" beneath it | S8 |
| Preview (player) | A video preview area appears in the editor alongside media and timeline | S8 captions (media, video preview, timeline) |
| Timeline | Clips are placed on a timeline; a playhead is positioned to split | S8 |
| Top-right Export button | "Export" at the top right opens the export settings; a second "Export" confirms | S7, S8 |
| Property/inspector panel | A "Video" panel with a "Basic" section containing "Auto reframe"; an editor panel on the right side for text | S8 |
| Feature tabs | "Transition", "Filters", "Effects" (with "Video effects"), "Captions" (with "Auto captions"), "Audio" (with "Music", "Sound effects", "Voice changer" and "Voice filters"), "Text" ("Add text") | S8 |
| Export dialog | Shows file name, save location, resolution, bitrate, format, and frame rate (caption text); another variant mentions codec | S8 captions and steps |

Not confirmed by these pages: top-level menu bar contents, settings/preferences dialog, account controls, context menus, keyboard shortcut panel, project management screen layout. These remain **[UNKNOWN]** (earlier secondary note: a keyboard panel opens from a keyboard icon in the toolbar [SECONDARY, fastshortcuts.com]).

## 2.2 Version and platform facts (official)

- Windows requirement stated as Windows 10 (64-bit) or later; macOS Monterey (12.0) or later [S7].
- The article says Windows and Mac are covered together, implying the same interface family, but exact parity is not documented [S8].
- Resolution options on desktop include 2K (2560x1440) and 4K (3840x2160) [S7]. Frame rate up to 60 fps depending on the source [S7].
- Hardware: the page states the computer must have sufficient GPU/CPU power and storage for high-resolution export [S7].
- The page observes that projects created from mobile templates sync to desktop [S7] (contradicting or refining earlier secondary reports of mobile-template display problems; behavior details remain unverified).
- Page text mentions an upgrade to "CapCut Pro+" for more advanced features [S8], so feature availability depends on plan.
- Current Windows application version number: **[UNKNOWN]**; neither page states it.

## 2.3 Per-region analysis template

For each region the textbook's brief asks for ten attributes. Only the verified ones are filled; the rest are recorded as unknown so a later pass can fill them from first-hand observation.

### Media panel
1. Purpose: import and browse media (and, per S8, the audio and effects libraries are reached via the tabs listed above).
2. Visible components: an "Import" control (S8). Others [UNKNOWN].
3-4. What it shows/information: [UNKNOWN] beyond imported media.
5. Operations: import; items are dragged to the timeline (S8: "Drag the imported files into the timeline").
6-10. Interactions, state changes, shortcuts, common mistakes: [UNKNOWN] (developer concepts in Chapters 5 and 7).

### Timeline
1. Purpose: arrange and edit clips.
2. Components: clips, playhead (S8), a split icon (S8). Track headers, zoom control, snapping: [UNKNOWN] officially.
5. Operations: select clip, place playhead, click Split to divide the clip (S8).
Engineering concepts: Chapter 8.

### Preview
Shows the current frame at the playhead. Controls beneath it (play, fullscreen, ratio): [UNKNOWN]. Engineering concepts: Chapter 9.

### Property panel
A "Video" panel with a "Basic" section including "Auto reframe" with aspect-ratio choices such as 4:3, 1:1, 16:9 (S8). The article says CapCut keeps the main content centered when reframing [S8]; the method is **[UNKNOWN]**. Other tabs for audio, speed, animation, and so on are not documented in these sources.

### Text and captions
"Text" > "Add text" places a text box on the timeline; a right-side editor accepts the script (S8). "Captions" > "Auto captions" asks for the video language and has a "Generate" button (S8).

### Audio
"Audio" > "Music" and "Sound effects" libraries; "Voice changer" > "Voice filters" with options named Micro, Low, High, Sweet, Flashback (S8).

### Export
Detailed in Chapter 15 and in the Chapter 3 table. Official: click Export (top right), set resolution, frame rate, bitrate, then click Export again [S7, S8].

## 2.4 Variations

The articles describe a separate start-screen entry ("AI video maker") with its own editor containing "Scenes", "Media", "Voiceover", "Elements", and "Music" panels, and its own export panel listing file name, quality, resolution, format, and frame rate (S8). This shows that **the editor has more than one workspace type**, and the labels differ between workspaces. A regular project editor and an AI-video-maker workspace should be treated as different surfaces.

## 2.5 Developer concepts mapped to the regions (Layer B/C)

| Visible region | Underlying concept | Chapter |
|---|---|---|
| Media panel | Asset registry, probing, thumbnails | 7 |
| Timeline | Track/clip model, time domains | 8 |
| Preview | Frame evaluation, playback clock | 9 |
| Property panel | Property evaluation, keyframes, selection-driven inspector | 5, 10 |
| Effects/Transitions tabs | Effect chain, handles | 11 |
| Text/Captions | Text layout, subtitle model, ASR pipeline | 12 |
| Audio tab | Mixer, effects, library assets | 13 |
| Export | Snapshot, encoder, mux | 15 |

## 2.6 Common confusions (from general NLE experience; not CapCut-verified)

Splitting at the wrong playhead position because the playhead and selection are separate; expecting export to include a different frame rate than the project; a feature in the tab bar that needs the network or an account; plan-gated assets.

## What a Future Coding Agent Must Understand

- Officially confirmed: a library/panel-and-tabs layout with media, preview, timeline, top-right export, and a selection-driven property panel; several workspaces.
- Not confirmed: exact layout, menus, settings, shortcuts. Do not invent them; design an original layout.
- Interface regions map to subsystems; keep UI thin over a command layer (Chapter 5).
- **Evidence quality:** two official tutorial pages, screenshots not inspected; no first-hand observation.
- **Related:** Chapters 3, 4, 5, 8, 9, 15.
