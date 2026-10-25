# Icon system

One library, one stroke ramp, one size per role. This is what exists now, why
each number is what it is, and what was changed to get here.

---

## 1. One library

`lucide-react` (v1.48.0, already in the project) is the only icon set.
83 distinct icons across 16 files. No emoji, no unicode symbols used as icons,
no second icon package. The only non-lucide drawing in the app is the spinner
in `components/ui.tsx`, which is two SVG arcs on the same 24 × 24 grid and
follows the same size and colour rules.

Every glyph is an outline icon with round caps and joins on a 24 × 24 grid —
lucide's own house style. Nothing in the app uses a filled icon except the
favourite star, explained in section 6.

## 2. One stroke weight

Before this pass, stroke width was set per call site: `1.75` on the four
sidebar items, `1.5` on a dashboard thumbnail and a clip-list glyph, `2.5` on
the pipeline checkmark, and lucide's default `2` everywhere else. Two icons
side by side could be drawn at 1.5 and 2.5.

Now the weight is set in one place — `<LucideProvider strokeWidth={1.75}>` in
`main.tsx` — and tuned by size in `global.css`, because a stroke that reads
well at 28 px looks thin at 12 px:

| rendered size | stroke | apparent weight |
|---|---|---|
| 12 px | 2.0 | ~1.0 px |
| 14 px | 1.9 | ~1.1 px |
| 16 px | 1.75 | ~1.2 px |
| 20 px | 1.6 | ~1.3 px |
| 28 px | 1.5 | ~1.75 px |

The ramp keeps the perceived line weight even across the scale instead of
letting small icons disappear and large ones turn chunky.

## 3. Sizes by role

| role | size | where |
|---|---|---|
| inline text, badges, section headers, small button labels | 12 | `.tiny`, badges, inspector section rows, `.btn.sm` |
| toolbar, menus, icon-only buttons, regular buttons | 14 | timeline toolbar, `.menu`, transport, `.btn` |
| navigation, tabs, main play control | 16 | sidebar nav, project tabs, editor tool rail, `transport-play` |
| standalone figures | 20 | project thumbnails, small panel empty states |
| empty states, status illustrations | 28 | `.empty-icon`, `.icon-big`, `.inspector-empty` |

Usage after the pass: 12 px × 88, 14 px × 113, 16 px × 15, 20 px × 6,
28 px × 10. 18 call sites were moved to the correct size for their role —
mostly icon-only buttons that were 12 and text buttons that were 14.

## 4. Icon-only buttons

All icon-only controls are exact squares built from the same `.btn` rules:

* `.btn.icon` — 30 × 30, for regular toolbars;
* `.btn.sm.icon` — 24 × 24, for dense rows;
* `padding: 0`, `aspect-ratio: 1`, centred glyph;
* hover, press, focus ring and disabled all inherited from `.btn`, so an icon
  button cannot look like a different kind of control;
* `aria-label` on every one of them, and a `title` tooltip (guarded by a test).

Outside `.btn`, the two remaining icon chips are the timeline track tools
(lock, hide, mute) and the caption favourite star — both 22 px boxes with a
12 px glyph, kept deliberately small because they sit inside a clip label.

## 5. One glyph per action

| action | glyph | note |
|---|---|---|
| save | `Save` | |
| edit | `Pencil` | everywhere |
| delete / discard | `Trash2` | every destructive action, always red |
| search | `Search` | `ScanSearch` is reserved for AI moment detection |
| settings | `Settings` | imported as `SettingsIcon` |
| close / cancel | `X` | |
| add | `Plus` | |
| duplicate / copy | `Copy` | also "copy description", "copy transcript" |
| reveal file | `FolderOpen` | |
| retry / reset | `RotateCcw` | |
| refresh / re-check | `RefreshCw` | |
| undo / redo | `Undo2` / `Redo2` | |
| export | `Package` | fixed this pass |
| import a file | `Upload` | |
| save a report to disk | `Download` | diagnostics only |

Two fixes this pass:

* **Export** was three different icons — `Upload` in the editor top bar,
  `Package` in the clip list, `Download` in diagnostics. The editor now uses
  `Package`, the same as the clip list. `Download` stays for "write a report
  file to disk", which is a different action.
* **Captions** and **Text / graphics** both used `Type`. Captions now uses the
  `Captions` glyph — the same one the editor tool rail uses.

## 6. Deliberate exceptions

* **Favourite star** fills when active (`fill="currentColor"`). Filled versus
  outline is the convention for a toggle, and colour alone is not enough.
* **Disabled** buttons dim to 0.5 opacity with the glyph at 0.8, so the icon
  reads as unavailable without turning into a ghost.
* **Selected** navigation takes the accent on the icon only
  (`.nav-item.active > .lucide`), keeping the label bright — restrained, and
  consistent with the editor rail's tinted active state.
* **Semantic colour** is applied by the parent, never inline. The one inline
  colour left is the warning triangle in the sidebar badge, which is a status
  colour, not a style choice.

## 7. Screen checks

| screen | result |
|---|---|
| Sidebar / app shell | nav icons 16, one stroke, accent only on the active item |
| Dashboard | project rows: 16 in the header, 14 in the action menu, 12 in the status chip; no mixed weights |
| Project page | tabs 16, pipeline check 12; folder/retry 14 |
| Source tab | action row 12 glyphs with 12 px labels, delete red |
| Clips tab | Edit/Render/Export 12, overflow menu 14, delete red |
| Transcript tab | 12 in buttons, 14 for the header actions |
| Moments tab | 14 in card actions, 28 for the empty state |
| Renders tab | 12 in rows, 14 for the folder button |
| Render queue | 12 for run-again and discard |
| Editor | rail 16, top bar 14, transport 16 (play) / 14 (rest), inspector section rows 12, empty state 28 |
| Settings | nav 14, field row icons 12–14 |

## 8. Guards

`tests/unit/design-tokens.test.ts` now also fails if:

* any component sets `strokeWidth` outside the provider;
* the per-size stroke ramp is removed from the stylesheet;
* an icon-only button has no `aria-label`;
* an icon is rendered at a size outside 12 / 14 / 16 / 20 / 28.

## 9. Still open

* The transcript toolbar and the render queue rows still show every action at
  once; icons are consistent, but the rows themselves could be trimmed.
* Nothing has been checked on a real screen yet. Optical weight is calibrated
  numerically (section 2), not by eye.
