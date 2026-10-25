# Chapter 3: The Button, Control, and Interaction Encyclopedia

**Draft v1, 25 October 2026. This chapter is deliberately incomplete.** Only controls named in two official CapCut pages could be cataloged (S7: https://www.capcut.com/help/export-videos-in-capcut ; S8: https://www.capcut.com/resource/how-to-use-capcut-on-pc ; both accessed 25 Oct 2026). I could not run CapCut or view its screenshots. Many controls a real encyclopedia needs (timeline toolbar icons, zoom, snapping, undo/redo, playback controls, transform fields, keyframe buttons, audio sliders) are **not documented in these sources and are not listed**. I will not invent labels or icon names.

## 3.1 How to read the table

Columns requested in the brief that cannot be verified from these sources (**initial state, preconditions beyond what is stated, state changes, undo behavior**) are collapsed into one column, **"Unverified aspects"**, to avoid filling the table with repeated "unknown". Confidence values: **Documented** (stated in an official page), **Inferred** (implied by wording), **Unknown**.

## 3.2 Verified controls

| # | Control (label as written) | Location | Category | Purpose | User action | Observable result (as documented) | Evidence | Confidence | Unverified aspects |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Create project | Main (start) interface | Project | Start a new project | Click | Editor opens (inferred; next step is Import) | S8 | Documented (label), Inferred (result) | Dialog fields, defaults |
| 2 | Import | Media panel, left | Media | Bring files into the project | Click | Files upload into the media area | S8 | Documented | Accepted formats, multi-select, folder import, errors |
| 3 | Drag imported file to timeline | Media panel to timeline | Media/timeline | Add media to timeline | Drag | Clip appears on timeline | S8 | Documented | Snap, track choice, overwrite vs insert |
| 4 | Split (icon) | Timeline editing area | Editing | Divide the selected clip at the playhead | Select clip, position playhead, click | Clip divided into two | S8 | Documented | Icon identity, keyboard shortcut, linked-audio behavior |
| 5 | Playhead | Timeline | Playback | Marks the current time and the split point | Position (method unspecified) | Defines split location | S8 | Documented (existence) | Scrub, snapping, frame stepping |
| 6 | Video > Basic > Auto reframe | Property panel (Video, Basic) | Transform | Re-fit video to selected aspect ratios | Enable and choose aspect ratio(s) | Main content kept centered | S8 | Documented | Tracking method, per-ratio output, keyframes |
| 7 | Aspect ratio options (e.g., 4:3, 1:1, 16:9) | Auto reframe | Canvas | Target ratio | Select | Frame reshaped | S8 | Documented (names) | Full list, 9:16 presence |
| 8 | Transition tab | Feature tabs | Transitions | Browse transitions | Click tab, apply | Transition added between clips | S8 | Documented | Duration control, handles |
| 9 | Filters | Feature tabs | Color/Look | Apply looks, e.g., named filters Humble, Bad Bunny, Freedom, Hollywood Past | Select | Look applied | S8 | Documented | Intensity, scope |
| 10 | Effects > Video effects | Feature tabs | Effects | Add dynamic effects | Select | Effect applied | S8 | Documented | Parameter panel |
| 11 | Stickers (custom) | Feature tabs | Overlay | Add stickers | Select | Sticker added | S8 | Documented (existence) | Placement |
| 12 | Captions > Auto captions | Feature tabs | Captions | Generate synced captions | Select language, click Generate | Captions created | S8 | Documented | Local vs cloud, word timing, correction UI |
| 13 | Language selector (auto captions) | Auto captions panel | Captions | Choose spoken language | Select | Sets recognition language | S8 | Documented | Language list |
| 14 | Generate (auto captions) | Auto captions panel | Captions | Start generation | Click | Captions created | S8 | Documented | Progress, cancel, failure |
| 15 | Audio > Music | Audio tab | Audio | Add background tracks | Browse and add | Track added | S8 | Documented | Licensing, download needs |
| 16 | Audio > Sound effects | Audio tab | Audio | Add effects | Browse and add | Added | S8 | Documented | |
| 17 | Audio > Voice changer > Voice filters | Audio tab | Audio | Modify voice; options named Micro, Low, High, Sweet, Flashback | Select | Voice processed | S8 | Documented | Realtime or render |
| 18 | Text > Add text | Text tab | Text | Place a text box on the timeline | Click | Text clip created | S8 | Documented | Defaults |
| 19 | Script/text editor (right side) | Right panel | Text | Enter or paste text | Type | Text updated | S8 | Documented | Style controls |
| 20 | AI writer | Text area | AI/Text | Generate a script | Click | Script produced | S8 | Documented | Online dependence |
| 21 | Text to speech > voice style > Generate speech | Text area | AI/Audio | Create narration from text | Choose voice, click | Speech clip generated | S8 | Documented | Voice list, local vs cloud |
| 22 | AI media > AI video > Text to video / Image to video | Left sidebar | AI | Generate video from prompt or image | Enter prompt/import image, choose model, duration, aspect ratio, Generate | Generated clip | S8 | Documented | Credits, cost, cloud processing, models listed in S8 are third-party named features |
| 23 | Import image (image to video) | AI video panel | AI/Media | Upload source image | Click | Image loaded | S8 | Documented | |
| 24 | Auto cutout / background removal | Feature list | AI/Video | One-click background removal | Not described in step detail | Background removed | S8 (feature list) | Documented (existence only) | UI location, local vs cloud |
| 25 | Chroma key | Feature list | Effect | Remove green screen color | Not described | Color removed | S8 (feature list) | Documented (existence only) | Controls |
| 26 | Keyframe, Mask | Feature list | Animation/Compositing | Animate properties; mask regions | Not described | | S8 (feature list) | Documented (existence only) | Everything else |
| 27 | Update (button) | Top-right of app | App | Update the desktop app | Click | Updates (alternatively reinstall from the website) | S1 (earlier: https://www.capcut.com/help/why-update-to-a-new-version) | Documented | Update flow, prompts |
| 28 | Export (top right) | Editor top bar | Export | Open export settings | Click | Export panel opens | S7, S8 | Documented | Shortcut (varies per secondary source) |
| 29 | Resolution (dropdown) | Export panel | Export | Choose output size; desktop options include 2K 2560x1440 and 4K 3840x2160 | Select | Sets output resolution | S7, S8 | Documented | Full list; availability depends on hardware, source media, and plan |
| 30 | Frame rate (dropdown) | Export panel | Export | Choose output fps; up to 60 fps depending on source | Select | Sets fps | S7, S8 | Documented | Full list [SECONDARY: 24, 25, 30, 50, 60 per a third-party guide] |
| 31 | Bitrate | Export panel | Export | Quality vs size | Adjust | Higher bitrate = better quality, larger file | S7, S8 | Documented | Options: [SECONDARY] Recommended/Lower/Higher/Custom; Custom CBR/VBR claims are third-party |
| 32 | Codec / Format | Export panel | Export | Choose encoding/container | Select | Sets codec and format | S8 | Documented (existence); values [SECONDARY] | Supported list |
| 33 | File name, save location | Export panel | Export | Name and place output | Edit | | S8 captions | Documented (caption text) | Defaults |
| 34 | Export (confirm) | Export panel | Export | Start render | Click | Video rendered and saved | S8 | Documented | Progress UI, cancel, hardware acceleration option |
| 35 | Share (YouTube / TikTok) | After export | Export | Publish directly | Click | Shares | S8 | Documented (existence) | Account requirement |

## 3.3 Items stated only by third parties (not catalogued as verified)

Keyboard shortcut panel icon and rebinding [SECONDARY: fastshortcuts.com]; shortcut conflict warnings [SECONDARY]; estimated file size in export dialog [SECONDARY: hollyland.com]; export-frame-rate list [SECONDARY: store.hollyland.com]; hardware-acceleration toggle: **no source yet**.

## 3.4 Controls the encyclopedia still needs (research queue)

Timeline: zoom, snapping toggle, link/unlink, track lock/hide/mute, add track, undo/redo, delete, duplicate, freeze, reverse. Player: play/pause, frame step, fullscreen, preview quality, ratio selector. Video panel: position/scale/rotation fields, opacity, blend mode, crop, mask controls, stabilization, speed (normal and curve), animation/keyframe diamonds. Audio panel: volume, fades, noise reduction, enhance voice, beat detection. Text panel: font, size, color, stroke, shadow, alignment, animations. Project: save, autosave, project list, draft management. Settings: cache location, hardware acceleration, shortcuts. Sources needed: CapCut help center pages and first-hand observation.

## What a Future Coding Agent Must Understand

- This catalog proves only that these labelled functions exist; it says nothing of exact UI or behavior.
- Design the original editor's controls from Chapters 8-15, not from this partial list.
- Capabilities gated by plan, hardware, or online access (export resolution, AI features) should be modeled as availability flags.
- **Verified:** 35 controls at label level. **Remaining:** most of the interface.
- **Related:** Chapters 2, 4, 5, 15, 17, 18.
