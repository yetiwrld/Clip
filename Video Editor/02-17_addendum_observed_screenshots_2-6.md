# Addendum: Observed Settings, Export, Shortcuts, Text Panel, and Context Menu (Screenshots 2-6)

**Date:** 25 October 2026. **Evidence:** five user-supplied screenshots of CapCut Desktop for Windows (free plan), all labeled **[OBSERVED]**. They show what the screen displayed in one state. They do **not** show what pressing a control does, so behavior statements are marked **[INFERRED]** or **[UNKNOWN]**. Personal user-profile folder names in paths are omitted here as `<user>`. The application version is still not visible: **[UNKNOWN]**.

---

## 1. Settings window (screenshot 2)

A modal "Settings" dialog with four tabs: **Draft**, **Edit**, **Performance**, **General**. Only the **Draft** tab was captured; the other three tabs are **[UNKNOWN]**.

| Field (Draft tab) | Observed value / control |
|---|---|
| Save to | Folder path under the user profile ending in `com.lveditor.draft` (middle of path truncated), folder-picker button |
| Screen recording | Path ending in `Data/VideoRecord`, folder-picker button |
| Download to | Path ending in `Data\Cloud files`, folder-picker button |
| Cache | Radio: **Don't delete** (selected) / **Auto delete cache from [30] days ago** (number dropdown) |
| Cache size | **273.48MB** with a trash (clear) button |
| Auto sync | Toggle (off); hint text "Sign in to use auto upload" |
| Preset save path | Path ending in `User Data\Presets`, folder-picker button |
| Buttons | **Save** (primary), **Cancel** |

What this tells a developer:
- The app has a user-configurable **draft (project) folder**, separate from a **cloud files download** folder, a **screen recording** folder, and a **preset** folder. Projects are called **drafts**.
- Cache is managed with an **age-based auto-delete policy** (days) and a **manual clear** with a size readout. This matches the cache design in Chapters 7 and 20.
- **Auto sync of projects is tied to signing in** (cloud sync is an account feature).
- The draft folder name suggests an app-specific directory under the user's application-data area; whether it is Local or Roaming is not visible **[UNKNOWN]**. The format of files inside it is **[UNKNOWN]**.

## 2. Export dialog (screenshot 3)

A modal dialog titled "Export-1022" (project name). Left side: a cover-image preview with an **Edit cover** button. Right side, top to bottom:

| Row | Observed |
|---|---|
| Export timeline | "Timeline 01" (display text) |
| Name | Text field, value "1022(2)" (appears to auto-number against an existing name **[INFERRED]**) |
| Export to | Path field (under the user profile, AppData, truncated) with folder-picker button |
| **Video** | Collapsible section with a checked checkbox |
| Remove watermark | Gem icon, toggle (off) |
| Resolution | Dropdown, shown value **480P** |
| Bit rate | Dropdown, shown value **Recommended** |
| Codec | Dropdown, shown value **H.264** |
| Format | Dropdown, shown value **mp4** |
| Frame rate | Dropdown, shown value **30fps**; the open list shows **24fps, 25fps, 29.97fps, 30fps (checked), 50fps, 59.94fps, 60fps** |
| Optical flow | Gem icon (below the frame-rate list, partly hidden) |
| Color space | Greyed row (state not readable) |
| **Audio** | Collapsible section with a checkbox that appears unchecked; contents not visible |
| Footer text | "Duration: 1m 4s \| Size: about 22 MB" (estimated size before export) |
| Export button | Hidden behind the open dropdown |

Observations:
- Frame-rate list is **observed**, confirming the earlier secondary claim and including the fractional rates 29.97 and 59.94.
- The **estimated file size and duration** are shown before exporting.
- The **free plan** shows a watermark control with a gem (Pro) icon. That a watermark is applied on free exports is **[INFERRED]** from the "Remove watermark" control; not directly shown.
- Whether 480P was a default or a previously chosen value, and the resolution options list, are **[UNKNOWN]**.
- Video and Audio are separate collapsible sections with their own enable checkboxes, so **exporting audio-only or video-only** appears possible **[INFERRED]**.
- **Optical flow** next to frame rate suggests frame-interpolation when converting frame rates **[INFERRED]**; Pro-gated by the gem icon.
- The export UI exports the **"Timeline 01"**, while the player header says "Player-Timeline 01" and the left sidebar has **Subprojects**. This suggests a project can contain **more than one timeline** **[INFERRED]**.

## 3. Shortcuts panel (screenshot 4)

A modal "Shortcuts" dialog opened from the keyboard icon. It has four tabs (**Timeline**, **Player**, **Basic**, **Other**) and a top-right dropdown labeled **"Shortcut 1"** (appears to select a shortcut preset or scheme **[INFERRED]**). Buttons: **Reset**, **Save** (disabled until a change), **Cancel**. The list scrolls; only the first part of the **Timeline** tab was captured.

Timeline tab, as displayed (Windows keys):

| Function | Key | Function | Key |
|---|---|---|---|
| Split | Ctrl+B | Shuttle left | J |
| Split all | Ctrl+Shift+B | Shuttle stop | K |
| Select mode | A | Shuttle right | L |
| Split mode | B | Delete left | Q |
| Select leftward | [ | Delete right | W |
| Select rightward | ] | Show/Hide keyframe panel | Alt+K |
| Main track magnet | P | Add keyframe on keyframe panel | Shift + mouse click (cursor icon shown) |
| Auto snapping | N | Add keyframe | Shift+Alt+K |
| Linkage switch | ~ (tilde/backtick key) | Ease in | (no key assigned) |
| Preview axis switch | S | Ease out | (no key assigned) |
| Zoom in | Ctrl and + | Easing | (no key assigned) |
| Zoom out | Ctrl and - | Linear | (no key assigned) |

Findings:
- This **confirms** the third-party shortcut reports for Split, Split all, Select mode, Split mode, Delete left (Q), Delete right (W).
- It **corrects** my earlier cautionary note that J/K/L might not apply: **J/K/L shuttle exists**.
- It shows **editing-mode toggles with shortcuts**: main track magnet, auto snapping, linkage switch, preview axis switch. These four names plausibly correspond to the teal toggle icons at the right of the timeline toolbar **[INFERRED from naming; icon-to-name mapping not confirmed]**.
- Easing commands (Ease in, Ease out, Easing, Linear) are keyboard-assignable commands with **no default key**: they concern keyframe interpolation.
- Shortcut settings support **Reset**, **Save**, **Cancel** and apparent **named schemes** (dropdown). Rebinding mechanics and the conflict dialog are not shown.

**Toast notification seen in screenshots 4, 5 and 6:** a CapCut notification reading "Keyboard shortcut conflicts with an existing one" with the line "Record screen: [Ctrl+Alt+P]" and a **Don't remind me again** button. So CapCut registers a **global (system-wide) hotkey** for screen recording and warns when another application already uses that combination. Relevant to Chapter 17's conflict handling and to Chapter 19 (global hotkeys).

The **Player**, **Basic**, and **Other** tabs (play/pause, frame step, save, undo/redo, copy/paste, and so on) are **not yet captured**: **[UNKNOWN]**.

## 4. Text panel (screenshot 5)

With a text clip selected ("FINAL" on the text track, white outline), the right panel changes from Video-style tabs to **Text**-style tabs:

| Level | Observed |
|---|---|
| Panel tabs | **Text** (selected), **Animation**, **Tracking**, **Text to speech**, **AI avatars** (gem icon) |
| Sub-tabs | **Basic**, **Bubble**, **Effects** |
| Content box | Editable text field containing the clip's text |
| Font | Dropdown, value **System** |
| Font size | Slider with numeric field (value 15) |
| Pattern | **B**, **U**, **I** toggle buttons (B appears active) |
| Case | **TT**, **tt**, **Tt** buttons |
| Color | White swatch with dropdown, keyframe controls at right |
| Spacing | **Character** and **Line** numeric fields (both 0) |
| Alignment | Six icons (left, center, right and three further alignment/distribution icons I could not name with certainty) |
| Preset style | Section label (cut off), **Save as preset** button |

Observed behavior-relevant facts:
- The **inspector content depends on the selected clip type** (text clip shows text tabs; video clip showed Video/Audio/Speed/...). Matches the selection-driven inspector in Chapter 5.
- The **timeline toolbar also changes**: with the text clip selected, the toolbar shows fewer icons (add, select, undo, redo, three split/trim icons, delete) than with a video clip selected (screenshot 1 also showed crop-like and other icons). Toolbar contents are **context-sensitive**.
- Text has **presets** (save/apply style), and the **text color has keyframe controls** (animatable property) **[INFERRED from the keyframe arrows beside Color]**.
- Text can be animated, tracked, and converted to speech from the same panel.

## 5. Clip context menu (screenshot 6)

Right-click menu on a video clip. Items, in order, with shortcut and tag text as displayed:

| Item | Shortcut / tag |
|---|---|
| EditPilot | |
| Copy | Ctrl+C |
| Cut | Ctrl+X |
| Copy attributes | Ctrl+Shift+C |
| Paste attributes | disabled (nothing copied) |
| Delete | **Backspace** |
| Edit | submenu |
| Split scenes | tag "Free" |
| Transcript | gem (Pro) |
| Separate audio | gem, submenu |
| Extract audio | gem, Ctrl+Shift+S |
| Sync video and audio | disabled |
| Create compound clip (subproject) | Alt+G |
| Create multi-camera clip | disabled, tag "Free" |
| Save preset | |
| Group / Ungroup | both disabled |
| Export selected clips | |
| Deactivate clip | V |
| Trim clip | disabled |
| Replace clip | |
| Link to media | disabled |
| Open file location | |
| Edit effects | disabled |
| Show variable speed animation | disabled |
| Range | submenu |
| Render | submenu |

What this shows:
- **Copy/paste attributes** (copying clip properties and applying them to others), **compound clips** called **subprojects**, **groups**, **multi-camera clips**, **deactivate clip** (disable a clip without deleting it), **replace clip**, **relink ("Link to media")**, **open file location**, **range**, and **render** (submenu contents unknown) all exist as clip commands.
- **Disabled items** reveal the enablement logic: "Paste attributes" is disabled with an empty clipboard; "Link to media" (relink) is disabled because the media is linked; "Group/Ungroup" disabled with one clip selected; "Edit effects" disabled because the clip has no effects; "Show variable speed animation" disabled because no speed curve is set. These are **[INFERRED]** from the item names and disabled states.
- Plan markers: items tagged **Free** (Split scenes, multi-camera) or with a **gem** (Transcript, Separate audio, Extract audio) show the product mixes free and paid functions inside one menu.
- **Delete is shown with Backspace**, not Delete, on this menu (the dedicated Delete key behavior is not shown).

## 6. Other observations across all five screenshots

- **Undo and Redo are greyed** in every capture, consistent with a session where no edits had been made; they are real toolbar buttons.
- The **media bin** shows "Added" badges on files already placed on the timeline.
- Consistent **gem icons** mark Pro features and **"Free"** tags mark free ones, so feature gating is a visible UI concept.

## 7. How these screenshots change the textbook

| Chapter | Change |
|---|---|
| 2 | Layout, panels, context-sensitive inspector, modal dialogs, notification toast now observed |
| 3 | About 90 more controls observed (settings, export, shortcuts, text, context menu); see tables above |
| 4 | Export workflow fields; right-click workflows; shortcut-driven split/delete observed |
| 7, 16, 20 | Cache policy and sizes; draft folder; cloud files folder; preset path; auto sync tied to sign-in |
| 12 | Text panel fields observed; Transcript and captions paths exist |
| 15 | Export dialog fields, frame-rate list, size estimate, watermark and optical flow gem items |
| 17 | Shortcut table is now observed rather than secondary; J/K/L, [, ], P, N, ~, S, Alt+K, Shift+Alt+K found; conflict toast and global hotkey noted |
| 18 | Transcript, Separate audio, Extract audio, Optical flow, Tracking, Text to speech, AI avatars appear as gated or AI features; processing locations still unknown |
| 19 | App registers a global hotkey with a conflict warning |
| 22 | Subprojects (compound clips), multi-camera, groups, presets are real feature candidates |

## 8. Still not captured

Settings tabs Edit, Performance and General; Shortcuts tabs Player, Basic and Other; export Audio section and resolution list; the Export button and progress screen; Captions tab; keyframe and Animation tab; Speed tab; Audio tab; Edit/Range/Render submenus; Menu contents; the start screen; and the About screen with the version number. Typed lists of items from any of these are as good as screenshots.
