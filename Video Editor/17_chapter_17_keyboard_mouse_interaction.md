# Chapter 17: Keyboard, Mouse, and Professional Editing Interaction

**Draft v1, 25 October 2026.** CapCut's shortcut list could **not** be read from an official page. Every CapCut-specific key below is **[SECONDARY]** (third-party sites summarizing the app). Sources:

- **[F]** FastShortcuts CapCut cheat sheet, https://fastshortcuts.com/shortcuts/capcut/ , accessed 25 Oct 2026. States that its split/trim/tool keys match CapCut's own desktop shortcut walkthrough and that the rest is the default desktop map seen in the keyboard panel. This is a claim by the site, not verified.
- **[L]** Lilach Bullock, "How to Split a Clip in CapCut on Desktop and Phone", https://www.lilachbullock.com/?p=152619 , accessed 25 Oct 2026. Paraphrases CapCut's desktop guide.
- **[C]** Litcommerce "Capcut Tool Cheat Sheet" PDF, https://litcommerce.com/wp-content/uploads/2025/06/Capcut-Tool-Cheat-Sheet.pdf , accessed 25 Oct 2026.
- **[K]** Skillademia, https://www.skillademia.com/shortcuts/capcut-shortcuts/ , accessed 25 Oct 2026 (commercial interest).

Treat all as unconfirmed until checked against the keyboard panel in the running app.

---

## 17.1 Discovery

- **[SECONDARY, F]** The shortcut list lives behind a keyboard icon in the top toolbar of an open project.
- **[SECONDARY, F]** Shortcuts exist only in the desktop app; mobile has none; the browser version keeps a few (play, arrows, undo) and loses others to the browser.
- **[SECONDARY, F]** Letter shortcuts stop working while a caption or text field is focused.
- **[SECONDARY, byteplus.com, low quality]** Customization is claimed to be available under settings; not corroborated.
- **[SECONDARY, F]** Rebinding triggers a conflict warning (earlier note; unverified).

## 17.2 Reported shortcut table (Windows; Mac replaces Ctrl with Command)

| Function | Reported key | Context | Source | Confidence |
|---|---|---|---|---|
| Split selected clip at playhead | Ctrl+B | Timeline | F, L, C, K | SECONDARY, consistent across 4 sites |
| Split all tracks at playhead | Ctrl+Shift+B | Timeline | F, C ("Split all") | SECONDARY |
| Split subtitle block at playhead | Ctrl+B with playhead inside the caption, or right-click > Split | Caption track | L (citing CapCut's help) | SECONDARY |
| Split mode | B | Timeline | F | SECONDARY |
| Return to select mode | A | Timeline | F | SECONDARY |
| Delete left of playhead | Q | Timeline | F | SECONDARY |
| Delete right of playhead | W | Timeline | F | SECONDARY |
| Delete selected clip | Delete | Timeline | F, K | SECONDARY |
| Delete and close gap | key not captured | Timeline | K | UNKNOWN key |
| Delete keyframe | key not captured | Timeline/keyframe | K | UNKNOWN key |
| Undo | Ctrl+Z | Global | F, L, byteplus | SECONDARY |
| Redo | key not captured (Ctrl+Shift+Z common) | Global | | UNKNOWN |
| Undo a compound clip | key not captured | Timeline | F, C | UNKNOWN key |
| Quit | key not captured | Global | F | UNKNOWN key |

Toolbar items, per [L]: the editing tools are in a row above the timeline, with Split first, then Delete left and Delete right; right-clicking a clip on desktop offers Split scenes.

Not reported by any source I read: play/pause key, frame step, zoom, marker, copy/paste, save, export key (one source says it varies by build). **Do not assume** Space, arrow keys, J/K/L, or Ctrl+S behave as in other editors.

## 17.3 Customary shortcuts in other editors (not CapCut)

Space play/pause, J/K/L shuttle, I/O mark in/out, arrow keys frame step, Ctrl+Z/Ctrl+Shift+Z undo/redo, Ctrl+S save, Ctrl+C/V copy/paste, Home/End, +/- zoom. These are conventions; CapCut parity is unverified.

## 17.4 Routing design [PROPOSED]

```text
on_key(event):
    if modal dialog: dialog handles; return
    if focused widget is a text input:
        text input handles character keys
        only chords flagged "global while typing" (save, undo within field) pass through
        return
    ctx = context_of(focused panel)            # timeline, library, preview, inspector
    cmd = keymap.lookup(ctx, chord)
    if cmd and cmd.enabled(state): run(cmd)
    else if ctx != GLOBAL: try keymap.lookup(GLOBAL, chord)
```

Principles: context-specific keymaps over a global one; one registry shared by menus, toolbar and shortcuts (Chapter 5); conflict detection per context; display the key in tooltips; allow rebinding with import/export; handle non-US layouts by binding on logical keys where the key means a letter and on physical positions where it means a place (for example J/K/L cluster).

## 17.5 Mouse and precision interaction

| Interaction | Behavior to define |
|---|---|
| Click clip | Select; modifier toggles/extends |
| Drag clip | Move with snapping; visual ghost; drop preview; mode (insert/overwrite) |
| Drag clip edge | Trim; show tooltip with new duration and timecode |
| Drag playhead / ruler | Scrub; audio scrub optional |
| Wheel | Scroll; modifier zooms timeline; define horizontal scroll |
| Right-click | Context menu from command registry |
| Double-click | Open properties or text edit |
| Precision | Hold a key for fine movement; frame-step by arrow keys; numeric entry fields in the inspector |
| Escape | Cancel drag or deselect |

Accessibility and input: full keyboard operation of core actions, visible focus indicators, screen-reader labels, non-color cues, adjustable shortcut keys, support for touch/pen as a stretch goal, no timing-only interactions.

## 17.6 Shortcut conflicts

Sources: duplicates in the same context, OS-reserved chords, IME or accessibility software chords, text-field typing, and layout differences. Resolve by context scoping, reserved-chord lists, and a conflict dialog showing both commands.

## What a Future Coding Agent Must Understand

- Only a handful of CapCut keys are reported (split, split all, split mode, select mode, delete left/right, delete, undo), all secondary-sourced.
- Build a command registry and context-aware keymap; do not hard-code keys in widgets.
- Never let letter shortcuts fire while a text field is focused.
- Keep customary editor conventions optional and configurable.
- **Verified:** none from an official page. **Related:** Chapters 3, 5, 8.

---

## 17.7 Update: shortcuts now OBSERVED (25 Oct 2026)

A user screenshot of CapCut's own Shortcuts dialog (Timeline tab) confirms: Split Ctrl+B; Split all Ctrl+Shift+B; Select mode A; Split mode B; Delete left Q; Delete right W; Select leftward [ and rightward ]; Main track magnet P; Auto snapping N; Linkage switch ~; Preview axis switch S; Zoom in Ctrl and +, Zoom out Ctrl and -; **Shuttle left/stop/right J/K/L** (this corrects the caution in 17.2 that J/K/L should not be assumed); Show/Hide keyframe panel Alt+K; Add keyframe Shift+Alt+K; Add keyframe on keyframe panel Shift+click; Ease in, Ease out, Easing, Linear have no default key. The dialog has tabs Timeline, Player, Basic, Other, a scheme dropdown ("Shortcut 1"), and Reset, Save, Cancel buttons. A conflict toast shows CapCut registers a global hotkey (Record screen, Ctrl+Alt+P) and warns when it conflicts. The context menu shows Delete as Backspace, Copy Ctrl+C, Cut Ctrl+X, Copy attributes Ctrl+Shift+C, Extract audio Ctrl+Shift+S, Create compound clip Alt+G, Deactivate clip V. The Player, Basic and Other tabs are not yet captured. Details: `02-17_addendum_observed_screenshots_2-6.md`.
