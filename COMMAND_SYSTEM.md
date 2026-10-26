# Commands and keyboard shortcuts

One registry, one listener, one palette. This file is the map.

---

## What existed before

Four independent `window.addEventListener('keydown', …)` listeners: editor
transport, timeline editing, the mobile inspector drawer, and every modal's
Escape handler. Each one repeated the same "is the user typing?" guard, each
one had its own idea of which keys were taken, and none of them was
discoverable — the only hint that Space plays was a hard-coded tooltip.

## The shape of it now

```
src/renderer/commands/
  types.ts           command shape, categories, category order
  keys.ts            match, format, fuzzy score  (pure, unit-tested)
  registry.ts        the store, dispatch decision, conflict report (pure dispatch)
  appCommands.ts     navigation, projects, project tabs, settings sections
  screenCommands.ts  editor transport/edit commands, timeline commands
  useGlobalShortcuts.ts   the only keydown listener in the renderer
src/renderer/components/CommandPalette.tsx
```

A command is data:

```ts
{
  id: 'editor.split',
  title: 'Split at playhead',
  category: 'Timeline',
  keywords: ['razor', 'cut'],       // extra words the palette matches
  shortcut: { key: 'b', mod: true },
  hint: 'Selected clip, caption block or text layer',
  enabled: () => Boolean(selected), // availability, checked before running
  allowInInput: false,              // may it fire while typing?
  allowInModal: false,              // may it fire inside a dialog?
  hidden: false,                    // shortcut-only commands stay out of search
  run: () => split()
}
```

The same object supplies the palette row, the key binding and the entry in the
shortcut reference. There is no second list to keep in sync.

## Dispatch rules

The listener decides, in this order:

1. **Palette open?** Nothing else fires. The palette owns the keyboard.
2. **A dialog open?** Only commands marked `allowInModal` fire.
3. **Focus in an input, textarea, select or contenteditable?** Only commands
   marked `allowInInput` fire. That is why typing "j" in the clip title does
   not rewind, but Ctrl+K still opens the palette.
4. **Is the command available?** `enabled()` is checked at press time, not at
   registration, so a command can come and go with the selection.
5. **Most recent registration wins.** A screen's command beats a global one
   with the same key while that screen is mounted.

Matching is exact: Ctrl means Ctrl or Cmd and nothing else, Shift is never
implied, and Alt must match. `tests/unit/commands.test.ts` asserts this, and
also asserts that the shipped set has no duplicate ids and no two commands
claiming the same shortcut.

## The commands

Global, always registered:

| Keys | Command |
|---|---|
| Ctrl/⌘ K | Command palette |
| Ctrl/⌘ / | Keyboard shortcuts reference |
| Ctrl/⌘ 1 | Go to Projects |
| Ctrl/⌘ 2 | Go to Render queue |
| Ctrl/⌘ 3 | Go to Settings |
| Alt ← | Go back (editor → its project, otherwise → Projects) |

Editor, registered while the editor screen is mounted:

| Keys | Command |
|---|---|
| Space | Play or pause |
| J / K / L | Rewind / pause / play forward |
| , / . | Step one frame back or forward |
| ← / → | Playhead one frame back or forward |
| Shift ← / → | Playhead one second back or forward |
| Home / End | Clip start / clip end |
| I / O | Set clip start / end at the playhead |
| Ctrl Z / Ctrl Shift Z / Ctrl Y | Undo / redo |
| Esc | Close the inspector drawer (only when it is open) |

Timeline, registered while the timeline is mounted:

| Keys | Command |
|---|---|
| Ctrl X / C / V | Cut, copy, paste clips through the editor's own clipboard |
| Ctrl D | Duplicate the selection after itself |
| Ctrl B | Split at the playhead |
| Delete / Backspace | Delete the selection, leaving a gap |
| Shift Delete | Ripple delete: remove it and close the gap |
| Ctrl A | Select every clip on an unlocked track |
| Esc | Clear the timeline selection (closes the properties panel first) |
| Shift S | Toggle magnetic snapping |

The timeline's copy, cut, paste, duplicate and split keys belong to the editing
context only. Inside a text field, subtitle editor, track name or numeric input
they keep their normal text behaviour: the dispatcher checks the focused element
before it consults the clipboard at all.

Palette-only (no shortcut, because a slip would be costly or the action is
rare): Export clip, Optimize clip boundaries, Toggle inspector, New project,
every project tab, every settings section, and one entry per project.

## The palette

- Opens with Ctrl+K, closes with Escape, Ctrl+K again, or a click outside.
- Search is fuzzy: "proj" and "gtp" both reach "Go to Projects", a contiguous
  match always outranks a scattered one, and keywords are searched too.
- Empty search shows **Recent** (last six, stored in `localStorage`) followed by
  every available command grouped by category.
- Arrow keys walk one flat list across groups; Enter runs; the highlighted row
  scrolls into view without moving the page.
- Ctrl+/ switches between *commands* and the *shortcuts reference*, which is the
  same list filtered to commands that have a key, searchable by key or name.
- Focus moves into the search field on open and returns to whatever had it on
  close. The list is a listbox with `aria-activedescendant`, so a screen reader
  reads the highlighted row as you move.
- Appearance is tokens only: `--surface`, `--border-strong`, `--radius-lg`,
  `--shadow-3`, the type scale, and the motion system's `pop-in` / `fade-in`.
  Reduced motion turns both off like every other animation.

## Why there is no conflict with the operating system

Ctrl+K, Ctrl+/, Ctrl+1…3 and Alt+← are not text-editing or window-management
keys. The function keys and Ctrl+W / Ctrl+R / F5 are left alone, so the renderer
never fights the browser or the window manager.

Ctrl+C/V/X/A are claimed only while a timeline selection or the clip clipboard
makes them meaningful, and never inside a text field — check `enabled()` in
`timelineCommands`. Outside that context they fall through to the browser's own
copy, paste, cut and select-all. Everything the app does claim is
`preventDefault`ed only on an exact match.

## Adding or rebinding a command

Add the object to the catalog that owns the behaviour, or register it from the
component that owns the state:

```ts
useEffect(() => registerCommands(myCommands(() => handlersRef.current)), [])
```

The unregister function it returns is the effect cleanup, so a command can
never outlive its screen. Rebinding is a data change: replace the `shortcut`
field. A future settings screen can do that by re-registering the same ids with
new specs — nothing in the palette or the dispatcher assumes a fixed key.

## Tests

`tests/unit/commands.test.ts` (18 tests) covers key formatting for macOS and
Windows, exact modifier matching, fuzzy ranking and null results, dispatch
precedence for text fields, dialogs and the open palette, availability checks,
last-registration-wins, and a sweep of the shipped catalogs for duplicate ids
and conflicting shortcuts.

## Known gaps

- Escape is still handled inside `Modal` itself, because a dialog closing
  itself is scoped to that dialog and must work even while another command owns
  Escape.
- The palette does not re-filter when the view changes underneath it; it
  re-reads availability on the next open, which is the only time it is visible.
- Bindings are not user-editable yet. The registry makes that a data change,
  not a rewrite, but there is no settings UI for it.
