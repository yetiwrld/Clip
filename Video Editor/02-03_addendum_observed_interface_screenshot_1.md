# Addendum to Chapters 2 and 3: Observed Interface (Screenshot 1)

**Date:** 25 October 2026. **Evidence:** one user-supplied full-window screenshot of CapCut Desktop for Windows (free plan, project named "1022", 17 portrait clips, one clip selected). Evidence label: **[OBSERVED: screenshot 1]**. This is first-hand evidence of what the screen showed in one state; it does **not** prove behavior (what a click does). Items I could not read clearly are marked **[ILLEGIBLE/UNIDENTIFIED]**. The application version number is not visible: **[UNKNOWN]**.

---

## A.1 Window layout (observed)

Four regions: media/feature panel (top left), player (top center), property panel (top right), timeline (bottom, full width).

| Region | Observed contents |
|---|---|
| Title bar | CapCut logo, **Menu** dropdown (top left), project name "1022" (center) |
| Top-right cluster | Layout/workspace icon with dropdown, keyboard icon, **"Unlock for N2,900"** upgrade button (gem icon), **Share** button, teal **Export** button, window controls |
| Left panel top tab row | **Media** (selected), **Audio**, **Text**, **Stickers**, **Effects**, **Transitions**, **Captions**, **Filters**, **Adjustment**, **Templates**, **AI avatar** |
| Left sidebar (inside Media) | **Import** (highlighted, dropdown), **Media**, **Subprojects**, **Yours** (dropdown), **Generate** (dropdown, AI badge), **Spaces** (dropdown), **Library** (dropdown) |
| Media toolbar | **Import** button, **Record** button, search field "Search media", view-mode toggle, sort dropdown, filter dropdown; an "All" heading |
| Media grid | Thumbnails with an **"Added"** badge, 4-second duration badge (00:04), truncated file names |
| Media panel footer | **AI clipper**, hint text "Select media to get started", **Start clipping** button with a "Try free" tag |
| Player header | Title **"Player-Timeline 01"**, a menu (hamburger) icon at the right |
| Player | Portrait (9:16-style) preview showing the frame at the playhead, with burned-in text "Level 1"; a floating **"Close"** tooltip is visible beside it (a transient UI element) |
| Player footer | Timecode **00:00:00:00 / 00:01:03:04** (current / total), a Play button, and at right: an icon with a notification dot, **Full**, a fit/focus icon, **Ratio**, a fullscreen icon |
| Property panel tabs | **Video** (selected), **Audio**, **Speed**, **Animation**, **Adjust**, **AI stylize** |
| Property sub-tabs (Video) | **Basic** (selected), **Remove BG**, **Mask**, **Retouch** |
| Floating element | **EditPilot** button (bottom right of the timeline area) |

## A.2 Property panel: Video > Basic (observed)

| Control | Observed state |
|---|---|
| **Transform** section header (collapsible), with a reset icon and keyframe controls (previous / diamond / next) | Present |
| **Scale** slider with numeric field **100%** and stepper arrows, keyframe controls | Slider near the left of the track, value 100% |
| **Uniform scale** toggle | On |
| **Position** X and Y numeric fields with steppers (both 0), keyframe controls | Present, values 0, 0 |
| **Rotate** numeric field **0.00 degrees** with steppers and a small dial widget, keyframe controls | Present |
| Alignment button row | Eight icons (align left, horizontal center, right, top, vertical center, bottom, then two distribute icons that appear disabled/greyed) |
| **Blend** (checkbox checked, dropdown arrow), reset icon, keyframe controls | Present |
| **Stabilize** (checkbox unchecked, **gem icon**, dropdown arrow) | Gem suggests a Pro-gated feature; the gem's meaning is **inferred**, not stated |
| **Enhance quality** (checkbox unchecked, gem icon, dropdown arrow) | Same inference |
| Panel scrollbar and a small **"Show"** tooltip at the bottom | More controls exist below the visible area (not shown) |

**Observation of behavior-relevant structure:** property rows follow a repeating pattern: label, value control(s), a reset icon at the right of section headers, and a three-part keyframe control (previous keyframe, add/toggle keyframe diamond, next keyframe). This suggests per-property animation with keyframes is built into the inspector **(inferred from controls, not tested)**.

## A.3 Timeline (observed)

| Element | Observation |
|---|---|
| Toolbar left group | **"+"** (add), a **select/pointer tool with dropdown**, **Undo** (active) and **Redo** (greyed), three split-related icons, a **trash/delete** icon, then further icons I could not identify with certainty |
| Toolbar right group | Microphone/record icon; three teal-highlighted toggle-style icons (one with a dropdown), a further icon with dropdown, a preview-related icon, **zoom out**, a **zoom slider**, **zoom in** |
| Ruler | Marks at 00:00, 00:30, 01:00, 01:30, 02:00, 02:30, 03:00; the playhead (white handle) is at the start |
| Track headers | Text track with **lock** and **eye** icons; main video track with **track icon, lock, eye, speaker (mute) icon, and a "..." menu**; a **Cover** button beside the main track |
| Text track | 17 small orange/red clips with labels like "Level 1" through "Level 3" and "FINAL" |
| Main video track | 17 adjacent clips, each labeled with its file name, thumbnails across the clip body, and an **audio waveform drawn inside the same clip strip** |
| Selected clip | One clip ("Excava...") with a white outline |
| Timeline length | Content ends near 1:03, matching the 00:01:03:04 total shown in the player |

Teal-highlighted toggles and the unidentified icons: I will not guess their names. Tooltips on those icons would settle this (see request below).

## A.4 What this changes in earlier chapters

- **Chapter 2:** layout and tab labels are now observed, not just documented in prose. The tab list is longer than the official article implied (Stickers, Adjustment, Templates, AI avatar, plus a Generate/Spaces/Library sidebar).
- **Chapter 3:** adds about 40 controls at label level (see A.5). Initial states are partially observed.
- **Chapter 4:** Split confirmed as a toolbar group; Undo/Redo exist as toolbar buttons; keyframe controls exist in the Video > Basic panel.
- **Chapter 8:** the timeline shows audio inside the video clip strip (waveform within the same block) and a separate text track above; **whether the audio is a separate linked track is not visible here.**
- **Chapter 13:** audio waveform display appears on the main track clips.
- **Chapter 17:** a keyboard icon exists in the top-right cluster (consistent with secondary reports).
- **Chapter 18:** several AI-labeled entries are visible in the interface: AI clipper, AI avatar, Generate, AI stylize, Remove BG, Retouch, EditPilot. Their processing locations remain unknown.
- **Plan gating:** the upgrade button and gem icons are observed; which features need Pro is not established beyond the icons.

## A.5 Additional control rows (observed; behavior unverified)

| Control | Location | Category | Confidence |
|---|---|---|---|
| Menu (dropdown) | Title bar | App | Observed (contents unknown) |
| Workspace/layout icon + dropdown | Top right | Workspace | Observed |
| Keyboard icon | Top right | Shortcuts | Observed |
| Unlock for N2,900 | Top right | Plan | Observed |
| Share | Top right | Export | Observed |
| Export | Top right | Export | Observed |
| Media / Audio / Text / Stickers / Effects / Transitions / Captions / Filters / Adjustment / Templates / AI avatar tabs | Left panel | Libraries | Observed |
| Import (sidebar) / Media / Subprojects / Yours / Generate / Spaces / Library | Left sidebar | Media sources | Observed |
| Import button, Record button | Media toolbar | Media | Observed |
| Search media field, view toggle, sort, filter | Media toolbar | Media | Observed |
| AI clipper, Start clipping (Try free) | Media footer | AI | Observed |
| Player menu icon | Player header | Player | Observed |
| Timecode (current / total, with frames) | Player footer | Playback | Observed |
| Play | Player footer | Playback | Observed |
| Full, fit/focus icon, Ratio, Fullscreen icons | Player footer | Preview | Observed (meanings partly inferred from labels) |
| Video / Audio / Speed / Animation / Adjust / AI stylize tabs | Property panel | Inspector | Observed |
| Basic / Remove BG / Mask / Retouch sub-tabs | Property panel (Video) | Inspector | Observed |
| Scale, Uniform scale, Position X/Y, Rotate | Video > Basic > Transform | Transform | Observed |
| Alignment row (8 icons) | Video > Basic | Transform | Observed |
| Blend, Stabilize, Enhance quality | Video > Basic | Compositing/Enhancement | Observed |
| Keyframe prev/diamond/next | Per property | Animation | Observed |
| Reset icon | Section headers | Inspector | Observed |
| Add (+), select tool, Undo, Redo, split icons, delete | Timeline toolbar | Editing | Observed (icon identity of split variants unconfirmed) |
| Record (mic) | Timeline toolbar | Audio | Observed (inferred icon) |
| Zoom out / slider / zoom in | Timeline toolbar | Navigation | Observed |
| Lock / eye / mute icons on track headers | Track headers | Track state | Observed |
| Cover | Beside main track | Project | Observed |
| EditPilot | Bottom right | AI assistant | Observed (function unknown) |

## A.6 Still needed to finish Chapters 2, 3, 4 and 17

The most useful remaining captures, in order: (1) the export dialog; (2) the shortcuts panel (or its text); (3) the timeline toolbar zoomed in with tooltips for the unidentified icons; (4) a right-click menu on a clip; (5) the Text tab with a text clip selected; (6) the Captions tab; (7) the Settings window. Typed lists of tooltips or tab names work as substitutes.
