# CLIPWRIGHT STUDIO
# UNIFIED MASTER SPECIFICATION
## COMPLETE VIDEO EDITING SYSTEM — BEHAVIOR, ARCHITECTURE, DATA MODEL, AI, AUDIO, UI/UX, PERFORMANCE, RENDERING, AND IMPLEMENTATION

This document consolidates the three supplied Clipwright Studio specifications into one master reference.

## Source integration
- The behavior/interaction guidance is consolidated from the two complete editing-system documents.
- The canonical architecture, project schema, ownership rules, time/composition model, command model, migration rules, and phased implementation roadmap are consolidated from the architecture/data-model document.
- Additional workflow examples, cross-system constraints, and explicit guardrails from the third document are retained where they add information rather than duplicating the broader behavior guide.
- The shared ChatGPT link supplied with the request could not be fetched successfully, so this unified document is grounded in the three uploaded files.

## Core objective

> Build **one coherent professional video editor with AI integrated into the workflow**.

Clipwright Studio should feel like a real timeline-based editing application in which AI helps the user work faster—not like an AI tool with a basic video player attached.

---

# MASTER ARCHITECTURAL CONTRACT

1. **One authoritative project model.** Timeline, preview, inspector, autosave, persistence, renderer, export, AI editing, undo/redo, and validation derive from the same project representation.
2. **One authoritative time model.** Clips, captions, audio, silence removal, markers, moments, transitions, keyframes, effects, speed changes, tracking, and render ranges use the same canonical time system.
3. **Source time and project time are different.** Preserve both and maintain an authoritative mapping between them.
4. **One authoritative composition model.** Canvas, aspect ratio, crop, transform, rotation, scale, position, layers, masks, opacity, and keyframes must be interpreted consistently by preview and renderer.
5. **Non-destructive editing.** Original media remains unchanged during normal editing; the project stores instructions and references.
6. **AI is assistive.** AI can analyze, recommend, generate, automate, predict, and track, but the user can inspect, change, override, delete, or restore AI-created results.
7. **UI represents real state.** Controls must affect real project state, preview behavior, and/or renderer behavior.
8. **Preview and render parity.** The preview is an interactive approximation of the same project logic the final renderer executes.
9. **No parallel engines.** Do not create competing timeline, time, composition, camera, keyframe, AI, renderer, or persistence models.
10. **Refactor before layering patches.** Inspect the existing application and preserve working functionality where possible; consolidate duplicated architecture instead of building around it.


---

# SECTION A — COMPLETE EDITOR BEHAVIOR AND INTERACTION MODEL

# PART 1 — THE COMPLETE MENTAL MODEL

Think of Clipwright as a system that transforms source media into an editable project and then renders that project into a final video.

```text
SOURCE MEDIA
    ↓
MEDIA ASSETS
    ↓
PROJECT
    ↓
TIMELINE
    ↓
EDITING OPERATIONS
    ↓
COMPOSITION
    ↓
PREVIEW
    ↓
FINAL RENDER
    ↓
OUTPUT VIDEO
```

The project contains the instructions describing how the final video should be created.

The original source media remains separate.

---

# PART 2 — THREE FUNDAMENTAL LAYERS

## 1. SOURCE MEDIA

These are the original files.

Examples:

- video.mp4
- podcast.mov
- music.mp3
- voice.wav
- image.png
- logo.png

They must remain unchanged by normal editing.

---

## 2. PROJECT / EDIT

The project describes what to do with those assets.

For example:

```text
Use video.mp4
Source In = 00:12.400
Source Out = 00:42.800
Place on timeline at 00:05.000
Scale = 1.25
Position = X/Y
Crop = ...
Volume = 0.70
```

This is non-destructive editing.

---

## 3. FINAL OUTPUT

The renderer takes the project instructions and creates a real media file.

Example:

```text
clipwright-export.mp4
```

The output should correspond to the current project state.

---

# PART 3 — ONE AUTHORITATIVE PROJECT MODEL

This is an extremely important engineering principle.

There should be **one authoritative representation of the project**.

The following should derive from that project model:

- timeline
- preview
- inspector
- saved project
- render system
- export settings
- AI editing operations

Do not maintain separate incompatible versions such as:

```text
frontend timeline state
preview state
renderer state
database state
AI state
```

that can drift apart.

Instead:

```text
                    PROJECT MODEL
                         │
        ┌────────────────┼────────────────┐
        ↓                ↓                ↓
     Timeline         Preview         Renderer
        ↓                ↓                ↓
      Editor          Viewer          Export
```

---

# PART 4 — SOURCE TIME VS PROJECT TIME

The editor must distinguish between:

## Source Time

Time inside the original media.

## Project Time

Time inside the edited timeline.

Example:

Source:

```text
01:20 → 01:45
```

Timeline:

```text
00:15 → 00:40
```

The clip is using 25 seconds from the source and placing it at a different location in the project.

Store both concepts.

Never assume they are interchangeable.

---

# PART 5 — SOURCE-TO-PROJECT MAPPING

The editor needs a reliable mapping between source time and project time.

This becomes essential when:

- clips are trimmed
- clips are split
- silence is removed
- clips are moved
- speed changes
- clips are reversed
- sections are deleted
- compound/nested edits exist

This mapping must be authoritative.

Captions, moments, camera keyframes, tracking, effects, and other time-based features must know which timeline they belong to.

---

# PART 6 — THE TIMELINE IS THE HEART OF THE EDITOR

The timeline represents the actual edit.

It answers:

> What is visible and audible at every point in project time?

A professional timeline can contain multiple tracks.

Example:

```text
VIDEO 3       ─────────────██████████
VIDEO 2             ───────████████──
VIDEO 1       ███████████████████████
GRAPHICS              ───────────────
CAPTIONS      ███████████████████████
VOICEOVER             ███████████████
MUSIC         ███████████████████████
SFX                    ██    ███
```

---

# PART 7 — TRACK TYPES

At minimum, support a model capable of:

## Video tracks

For:

- main video
- B-roll
- overlays
- alternate footage

## Graphics/image tracks

For:

- logos
- images
- visual overlays

## Audio tracks

For:

- original audio
- music
- voiceover
- sound effects

## Caption/text representation

For:

- captions
- subtitles
- text layers

The exact UI can differ, but the underlying model should remain organized.

---

# PART 8 — TRACK ORDER

Visual tracks are layered.

Higher visual layers generally appear above lower layers.

For example:

```text
Logo
Caption
B-roll
Main video
Background
```

Audio tracks are mixed together.

They are not "above" or "below" one another in the same visual sense.

---

# PART 9 — CLIP, ASSET, AND INSTANCE

These are different concepts.

### Asset

The original imported file reference.

### Clip/Instance

A use of that asset on the timeline.

Example:

```text
Asset:
music.mp3
```

Instances:

```text
00:00 → 00:20
00:40 → 01:00
```

Do not duplicate the physical media file unnecessarily.

---

# PART 10 — MEDIA IMPORT

The user must be able to:

- import through the UI
- drag from Windows File Explorer
- drop into Media
- drop directly on the timeline
- import multiple files

The system should analyze media and extract appropriate metadata.

---

# PART 11 — MEDIA BINS / ORGANIZATION

The media library should support useful organization.

Where appropriate, allow:

- folders/bins
- search
- filtering
- sorting
- favorites
- recent assets
- media type filtering

Do not require everything to remain in one giant list.

---

# PART 12 — MEDIA METADATA

For each asset, where supported, retain useful information such as:

- filename
- path/reference
- media type
- duration
- resolution
- frame rate
- codec
- audio channels
- sample rate
- file size

Technical information can remain in an Advanced/Details section.

---

# PART 13 — SOURCE MONITOR VS EDITOR PREVIEW

Where useful, distinguish:

## Source View

Shows the original source media.

Useful for:

- browsing source
- marking in/out
- deciding what to add to timeline

## Program / Project Preview

Shows what the edited timeline currently produces.

This distinction is optional if the current architecture does not need a separate source monitor, but the underlying concepts should remain understandable.

---

# PART 14 — IN/OUT POINTS

The editor should support a concept of:

### In Point

Where selected source content begins.

### Out Point

Where selected source content ends.

These may be used when extracting source material into the timeline.

Do not confuse:

- source in/out
- project clip boundaries
- project in/out range

They are related but different.

---

# PART 15 — PROJECT RANGE / LOOP RANGE

The project should support selecting a time range for playback or processing.

For example:

```text
00:20 ─────────── 00:35
        selected range
```

The user should be able to:

- preview the range
- render only the range where supported
- analyze only the range where useful

Do not confuse this with clipping the source.

---

# PART 16 — PLAYHEAD

The playhead represents current project time.

At:

```text
00:17.500
```

all preview systems should reflect that exact project time.

That includes:

- video
- audio
- captions
- effects
- keyframes
- animations
- tracking
- inspector state

---

# PART 17 — SCRUBBING

Scrubbing means dragging the playhead through time.

It should feel immediate.

Do NOT run expensive operations such as:

- AI inference
- FFmpeg renders
- database writes
- full timeline rebuilding

on every tiny playhead movement.

Use lightweight preview operations.

---

# PART 18 — PLAYBACK

Playback should support:

- play
- pause
- seek
- frame stepping
- loop
- playback speed

Where practical, support familiar editor navigation such as:

- J/K/L playback behavior
- frame stepping
- keyboard shortcuts

Do not assume every shortcut is required; inspect the current application and implement a coherent shortcut system.

---

# PART 19 — FRAME STEPPING

The user should be able to move precisely:

- one frame backward
- one frame forward

The preview, playhead and selected time must remain synchronized.

---

# PART 20 — TIMELINE ZOOM

Timeline zoom changes only the display scale.

It must NOT change actual time.

Zoomed out:

```text
Entire project visible
```

Zoomed in:

```text
Precise editing
```

---

# PART 21 — TIMELINE SCROLLING

Horizontal scrolling moves through project time.

Vertical scrolling moves through tracks.

Do not allow track scrolling to accidentally alter time position.

---

# PART 22 — TIMELINE RESIZING

The user should be able to resize the timeline vertically.

This allows:

- more timeline visibility
- larger preview
- waveform inspection
- caption inspection
- keyframe inspection

Remember the user's preferred layout where practical.

---

# PART 23 — TRACK CONTROLS

Each track should have appropriate controls such as:

- select
- mute
- visibility
- lock
- solo where implemented
- track name

Do not show controls that do nothing.

---

# PART 24 — CLIP SELECTION

When a clip is selected:

- show a clear selection state
- expose its appropriate properties in the Inspector
- allow editing operations on that clip

Selection must be unambiguous.

---

# PART 25 — MULTI-SELECTION

Support multi-selection where useful.

For example:

- move several clips
- delete several clips
- duplicate several clips

Do not accidentally apply media-specific properties to incompatible selections.

---

# PART 26 — MOVE

Moving a clip changes its project position.

It should not unexpectedly change:

- source in/out
- original media
- unrelated tracks

---

# PART 27 — TRIM

Trimming changes the visible/usable duration of a timeline clip.

It is non-destructive.

---

# PART 28 — SPLIT

Split divides one timeline instance into separate editable instances.

The resulting sections must preserve correct source references.

---

# PART 29 — DELETE

Deleting a timeline clip should normally remove it from the project timeline without deleting the original source asset.

---

# PART 30 — DUPLICATE

Duplicating creates another timeline instance.

The original asset remains shared where appropriate.

---

# PART 31 — SLIP EDIT

Where technically practical, support a slip edit.

A slip edit changes which part of the source is visible inside an unchanged timeline duration.

Example:

The clip remains:

```text
10 seconds long
```

but the source content shifts from:

```text
Source 00:20–00:30
```

to:

```text
Source 00:24–00:34
```

The timeline position and duration remain the same.

---

# PART 32 — SLIDE EDIT

Where appropriate, support slide editing.

A slide moves a clip while adjusting neighboring clip boundaries so the surrounding timeline relationship is preserved.

This should only be implemented if the current timeline model can support it safely.

---

# PART 33 — ROLL EDIT

Where appropriate, support a roll edit.

A roll moves the boundary between two adjacent clips while preserving the overall combined duration.

Example:

```text
Clip A | Clip B
```

moving the boundary changes how much of each clip is visible, but the total timeline duration remains unchanged.

---

# PART 34 — RIPPLE EDIT

A ripple edit changes one clip boundary and shifts subsequent content.

Example:

Remove 3 seconds from Clip A:

```text
Clip A shorter
↓
everything after Clip A moves 3 seconds earlier
```

This must be explicit.

Do not silently ripple the entire timeline when the user only intended a local trim.

Provide clear editing modes.

---

# PART 35 — EDIT MODES

Where the UI supports them, clearly distinguish:

- normal select/move
- ripple
- roll
- slip
- slide
- blade/split

Do not hide powerful editing behavior behind unpredictable interactions.

---

# PART 36 — BLADE / CUT TOOL

Provide a clear way to split clips at the playhead.

Only compatible clips at that time should be split.

The operation must be undoable.

---

# PART 37 — SNAP

Snapping can target:

- playhead
- clip edges
- keyframes
- captions
- scene changes
- silence boundaries
- markers
- moment boundaries

Snapping should be toggleable.

---

# PART 38 — MARKERS

Implement project/timeline markers.

Markers can represent:

- important moments
- notes
- edit points
- music beats
- scene boundaries
- AI suggestions

Markers are metadata attached to time.

They do not necessarily affect rendering.

Support:

- add marker
- rename
- color/category if appropriate
- move
- delete
- jump to marker

---

# PART 39 — BEAT / RHYTHM MARKERS

Where useful, audio analysis may identify beats.

These can be displayed as optional timeline markers.

The user can then align:

- cuts
- transitions
- graphics
- effects

to those markers.

Do not automatically cut video to beats unless explicitly requested.

---

# PART 40 — SCENE BOUNDARIES

Scene detection may identify visual changes.

These can assist:

- moments
- trimming
- snapping
- navigation

They should not automatically modify the project unless requested.

---

# PART 41 — SPEED

Speed changes the playback duration of a clip.

Example:

100%:

```text
10 seconds → 10 seconds
```

200%:

```text
10 seconds → 5 seconds
```

50%:

```text
10 seconds → 20 seconds
```

Changing speed affects project duration and therefore affects timing mappings.

---

# PART 42 — SPEED CURVES

Where supported, allow speed to vary over time.

For example:

```text
100% → 40% → 100%
```

This is different from one fixed speed value.

The system must account for changing time mapping.

---

# PART 43 — FREEZE FRAME

A freeze frame holds one frame for a selected duration.

The source is unchanged.

The project instructs the renderer to display the selected frame for longer.

---

# PART 44 — REVERSE

Where supported, reverse playback.

This changes source playback direction.

The timeline duration may remain equivalent.

Time mapping becomes important.

---

# PART 45 — TRANSFORM SYSTEM

Transform includes:

- position
- scale
- rotation
- anchor/pivot where supported

The transform system should be unified.

Do not create separate incompatible transform logic for:

- video
- images
- graphics
- camera

unless there is a clear reason.

---

# PART 46 — CROP SYSTEM

Crop determines which source region is visible.

It should be non-destructive.

---

# PART 47 — ASPECT RATIO

Aspect ratio defines the project/output canvas.

Examples:

- 16:9
- 9:16
- 1:1
- 4:5
- 4:3
- 21:9
- custom

---

# PART 48 — CROP + ASPECT RATIO

Selecting:

```text
9:16
```

should NOT automatically determine the exact framing.

The user must be able to:

- move framing
- zoom
- crop
- center
- manually position the subject

---

# PART 49 — FIT

Entire source visible.

---

# PART 50 — FILL

Canvas filled without distortion.

Some source content may be cropped.

---

# PART 51 — KEYFRAMED FRAMING

Camera/reframe is animated composition.

Keyframes can change:

- position
- scale
- rotation
- crop framing

---

# PART 52 — CAMERA TRANSITIONS

Support existing:

### Cut
Immediate change.

### Smooth
Interpolated movement.

### Hold
Maintain until next change.

---

# PART 53 — EASING

For smooth movement, where supported:

- Linear
- Ease In
- Ease Out
- Ease In-Out

Do not use overly complicated easing controls unless they are implemented correctly.

---

# PART 54 — SUBJECT TRACKING

Tracking can create automated framing.

The user must be able to correct the result.

AI should assist rather than remove control.

---

# PART 55 — PAN / ZOOM

A traditional pan/zoom animation is simply a camera transform changing over time.

Do not build a second unrelated animation architecture for this.

---

# PART 56 — KEYFRAME INTERPOLATION

Interpolated properties must remain mathematically predictable.

For example:

Position:

```text
X: 100 → 500
```

between two keyframes may smoothly interpolate.

The preview and renderer must use the same interpretation.

---

# PART 57 — EFFECTS

Effects modify media visually.

Examples:

- brightness
- contrast
- saturation
- temperature
- blur
- sharpen
- color adjustments
- stylized effects

Each effect should have a defined scope:

- clip
- track
- project

Do not confuse these.

---

# PART 58 — MASKS

Where the editor supports masks, a mask defines which area of an effect or layer is visible.

Possible shapes:

- rectangle
- ellipse
- freeform/path where supported

Masks may eventually be keyframed.

Do not add placeholder masks that do nothing.

---

# PART 59 — OPACITY

Opacity controls transparency.

Example:

```text
100% = fully visible
50% = partially transparent
0% = invisible
```

Opacity should work correctly for video, image, graphics and supported layers.

---

# PART 60 — BLEND MODES

Where supported, blend modes define how one visual layer interacts with another.

Examples may include:

- Normal
- Multiply
- Screen
- Overlay

Only expose modes that the renderer actually supports correctly.

---

# PART 61 — TRANSITIONS

A transition occurs between adjacent clips.

Examples:

- cut
- fade
- dissolve

Transitions must have:

- duration
- location
- affected clips

Do not treat a transition as a general effect.

---

# PART 62 — AUDIO SYSTEM

Audio is a first-class editing system.

It may include:

- original media audio
- imported music
- voiceover
- sound effects
- additional audio

All appropriate tracks must be mixable.

---

# PART 63 — AUDIO CLIP PROPERTIES

An audio clip may have:

- source
- source in/out
- project position
- volume
- mute
- fade
- speed
- pitch where supported
- pan where supported

---

# PART 64 — AUDIO PANNING

Where supported, pan controls stereo placement.

Example:

```text
Left ←── Center ──→ Right
```

Do not show it if the render engine cannot support it correctly.

---

# PART 65 — AUDIO FADE

Fade in and fade out should be visually represented and rendered correctly.

---

# PART 66 — AUDIO WAVEFORM

Waveforms should be cached.

Do not regenerate them on every frame.

---

# PART 67 — AUDIO DUCKING

Where implemented, duck music when speech is dominant.

The user should be able to understand which track is causing ducking.

---

# PART 68 — AUDIO LEVELS / LOUDNESS

Where practical, inspect:

- peak levels
- clipping
- loudness

Warn about severe clipping where useful.

Do not claim broadcast compliance unless the system actually measures and supports it.

---

# PART 69 — AUDIO NORMALIZATION

Where supported, normalization should be an actual measurable process.

Do not simply increase volume and label it normalization.

---

# PART 70 — CAPTIONS

Captions are timed visual text objects.

They need:

- timing
- text
- word data where available
- style
- animation
- position

---

# PART 71 — CAPTION MODES

Support where appropriate:

- sentence captions
- phrase captions
- word-level captions
- karaoke
- animated captions

---

# PART 72 — CAPTION SAFE AREAS

Captions should respect final canvas and social-safe areas.

For vertical video, the system should help avoid platform UI overlap.

---

# PART 73 — CAPTION STYLE

Styles should control:

- font
- weight
- size
- color
- highlight
- stroke
- shadow
- animation
- alignment

A caption's content should remain separate from styling.

---

# PART 74 — AI MOMENTS

AI moments are recommendations.

They are not automatically final clips.

The user should be able to:

- inspect
- accept
- reject
- edit
- create clip
- adjust boundaries

---

# PART 75 — HYBRID AI ANALYSIS

Moment detection may use:

### Audio

- energy
- speech activity
- laughter
- pauses
- intensity

### Visual

- scene changes
- movement
- reactions
- important visual events

### Transcript

- semantic meaning
- statements
- stories
- hooks
- conclusions

Transcript is optional.

---

# PART 76 — AI IS AN ASSISTANT

AI should recommend and automate.

The user remains able to modify the result.

Examples:

AI creates crop:

→ user can correct it.

AI detects moment:

→ user can alter boundaries.

AI generates captions:

→ user can edit text.

AI tracks subject:

→ user can correct keyframes.

Do not make AI decisions irreversible.

---

# PART 77 — SILENCE REMOVAL

Silence removal changes project time structure.

It should not destructively modify the source.

---

# PART 78 — EDITABLE SILENCE

The user should be able to:

- remove
- shorten
- restore
- keep

detected silence regions.

---

# PART 79 — SPEED + TIME MAPPING

This is important.

Speed changes also alter the relationship between source and project time.

The editor must correctly account for:

- captions
- keyframes
- effects
- markers
- audio synchronization

when speed changes.

---

# PART 80 — COMPOUND / NESTED CLIPS

Where useful, support a concept of grouping multiple elements into one editable container.

For example:

```text
Video
Caption
Graphics
Sound
```

could form a reusable group/compound clip.

Inside the compound clip, the individual components remain editable.

Do not implement nesting until the current timeline model can support it safely.

But design the architecture so this is possible later.

---

# PART 81 — PRECOMPOSED SECTIONS

A selected range may be converted into a compound sequence.

This allows users to treat a complex section as one item in the main timeline.

---

# PART 82 — ADJUSTMENT LAYERS

Where appropriate, an adjustment layer can apply visual effects to everything beneath it within its range.

Examples:

- color adjustment
- blur
- stylistic effect

Only implement if the renderer can correctly support it.

---

# PART 83 — PROJECT-LEVEL EFFECTS

A project-level effect applies globally.

It must be clearly distinguished from:

- clip effect
- track effect
- adjustment layer

---

# PART 84 — COLOR MANAGEMENT

The editor should preserve consistent color representation through:

- preview
- compositing
- render

Do not randomly convert color spaces.

Where advanced color management is unavailable, prioritize predictable results.

---

# PART 85 — STABILIZATION

If stabilization is supported:

The system should analyze camera motion and compensate.

Stabilization may require:

- cropping
- scaling

Therefore it must interact correctly with crop and framing.

Do not make stabilization accidentally overwrite manual framing.

---

# PART 86 — MOTION BLUR

Where supported, motion blur may be applied to animated transformations.

It should be consistent between preview and render where practical.

---

# PART 87 — BACKGROUND REMOVAL / SUBJECT ISOLATION

If the editor eventually supports:

- background removal
- segmentation
- subject isolation

those should create compositing information that can be layered with the normal timeline.

Do not treat subject isolation as a replacement for crop or camera movement.

---

# PART 88 — MEDIA REPLACEMENT

The user should be able to replace a source asset while keeping appropriate timeline properties.

Preserve when safe:

- position
- scale
- crop
- duration
- layer
- effects

Do not assume identical duration.

---

# PART 89 — MISSING MEDIA

If source media is missing:

Display:

**Media Missing**

Provide:

**Relink Media**

Never silently substitute another file.

---

# PART 90 — COPY / PASTE EDITING ATTRIBUTES

Where appropriate, allow copying selected attributes.

Example:

Copy:

- scale
- position
- crop

Paste onto another clip.

Do not overwrite unrelated properties unless the user chooses them.

---

# PART 91 — RESET

Provide targeted reset actions:

- reset transform
- reset crop
- reset audio
- reset effects
- reset keyframes

Also support:

**Reset All Clip Adjustments**

where appropriate.

Do not delete unrelated timeline placement.

---

# PART 92 — UNDO / REDO

Undo should cover meaningful editing actions.

Important:

Continuous dragging should be treated as one logical user action where appropriate.

Do not create hundreds of undo steps during one drag.

---

# PART 93 — AUTOSAVE

The editor should support reliable autosaving.

Autosave must not:

- write huge state objects every frame
- block playback
- freeze the UI

Use appropriate debouncing/transaction behavior.

---

# PART 94 — VERSION SAFETY

Where practical, retain enough project information to recover from:

- failed saves
- accidental edits
- crashes

Do not claim version history unless implemented.

---

# PART 95 — PROXIES / PERFORMANCE MEDIA

For large files, a professional editor may use lower-resolution proxy media for responsive editing.

If implemented:

```text
Original
   ↓
Proxy
   ↓
Editing
   ↓
Original used for Final Render
```

The final render should use the original/high-quality source unless the user explicitly chooses otherwise.

Do not accidentally export proxy quality.

---

# PART 96 — CACHE SYSTEM

Cache expensive derived information such as:

- thumbnails
- waveforms
- scene detection
- analysis data
- proxies
- AI analysis

The cache should be safely invalidated when the source changes.

Do not repeatedly recalculate expensive information unnecessarily.

---

# PART 97 — RENDER QUEUE

Long renders should be managed through a render queue.

Display:

- project
- resolution
- frame rate
- AI enhancement
- progress
- status

Allow:

- queue
- cancel
- retry
- inspect failure

---

# PART 98 — RENDER CANCELLATION

Canceling a render must:

- stop processing safely
- clean appropriate temporary data
- preserve the project
- leave the application usable

---

# PART 99 — DISK SPACE

Before large renders:

Check whether enough temporary/output disk space appears to be available.

If not:

Explain the problem.

Do not allow an avoidable mid-render failure.

---

# PART 100 — AI SUPER RESOLUTION

Normal scaling:

```text
720p
↓
resize
↓
4K
```

does not create guaranteed new source detail.

AI super-resolution uses a learned model to infer plausible higher-frequency detail.

It must be presented honestly.

---

# PART 101 — AI ENHANCEMENT CONTROLS

Support:

- Off
- Standard
- High

or equivalent real processing modes.

Do not expose fake quality settings.

---

# PART 102 — AI ENHANCEMENT + EDITING

AI enhancement must work with:

- crop
- reframing
- captions
- audio
- effects
- camera
- multi-track timeline
- final render

It cannot be a disconnected export button.

---

# PART 103 — PREVIEW VS FINAL AI QUALITY

Do not attempt expensive full-resolution AI processing continuously during normal playback.

Instead allow:

- short preview sample
- before/after comparison
- final high-quality render

---

# PART 104 — BEFORE / AFTER

Provide a useful way to compare:

Original

vs

AI Enhanced

using:

- side-by-side
- split slider
- before/after view

---

# PART 105 — RENDER PIPELINE

Conceptually:

```text
SOURCE
↓
SOURCE TRIM
↓
SPEED / TIME TRANSFORMATION
↓
TIMELINE ARRANGEMENT
↓
CROP / TRANSFORM
↓
CAMERA / KEYFRAMES
↓
EFFECTS
↓
TRANSITIONS
↓
VISUAL COMPOSITING
↓
CAPTIONS / GRAPHICS
↓
AUDIO MIX
↓
OPTIONAL QUALITY PROCESSING
↓
ENCODE
```

The exact implementation order must be verified against the actual renderer.

---

# PART 106 — FINAL RESOLUTION

Maintain correct output dimensions.

Examples:

16:9 1080p:

1920×1080

16:9 1440p:

2560×1440

16:9 2160p:

3840×2160

9:16 1080p:

1080×1920

9:16 2160p:

2160×3840

Square output should use the appropriate output dimension according to project settings.

---

# PART 107 — FRAME RATE

The final output should accurately reflect the selected frame rate.

Use FFprobe to verify actual files.

Do not trust UI labels alone.

---

# PART 108 — NON-DESTRUCTIVE PROJECT

The project should preserve edit instructions rather than modifying original source files.

---

# PART 109 — PROJECT PERSISTENCE

Save:

- project settings
- canvas/aspect ratio
- media assets
- timeline tracks
- clip placement
- source in/out
- crop
- transform
- speed
- keyframes
- effects
- captions
- silence edits
- markers
- moments
- audio properties
- render settings

Reopen the project and restore the same state.

---

# PART 110 — PREVIEW / RENDER PARITY

This is mandatory.

Preview and final renderer must share consistent interpretations of:

- timing
- crop
- scale
- position
- rotation
- keyframes
- speed
- effects
- transitions
- captions
- audio

Do not create separate mathematical rules for preview and export.

Where the preview must approximate something for performance, maintain the same logical result.

---

# PART 111 — CONTEXTUAL INSPECTOR

The inspector must be aware of selection.

Nothing selected:

```text
Select something to edit
```

Video selected:

Video properties.

Audio selected:

Audio properties.

Caption selected:

Caption properties.

Image selected:

Image properties.

Keyframe selected:

Keyframe properties.

Moment selected:

Moment properties.

This prevents the editor from becoming overloaded.

---

# PART 112 — MAIN TOOL NAVIGATION

Main editor categories may include:

- Media
- Audio
- Text
- Captions
- Effects
- Transitions
- AI / Moments
- Camera / Reframe

Only expose categories that actually exist.

Do not create decorative tools.

---

# PART 113 — UI INFORMATION HIERARCHY

The UI should prioritize:

1. Preview
2. Timeline
3. Main editing tools
4. Contextual properties
5. Secondary information

Technical information should not dominate the main workspace.

---

# PART 114 — EMPTY STATES

Every major panel should explain what to do next.

Example:

Media:

> Import or drag media here.

Inspector:

> Select a clip to edit it.

Moments:

> Analyze the video to find moments.

Audio:

> Import music, voice or sound effects.

Do not leave the application looking broken.

---

# PART 115 — TOOLTIP SYSTEM

Icon-only buttons should have tooltips.

Tooltips should explain:

- name
- function
- keyboard shortcut where useful

---

# PART 116 — ACCESSIBILITY

Interactive controls should have accessible names.

Keyboard navigation should remain possible for important controls where practical.

Do not rely purely on color to communicate state.

---

# PART 117 — DRAGGING FEEDBACK

When dragging assets:

Show:

- valid drop target
- target track
- insertion line
- snap indicator

Do not make users guess where an item will land.

---

# PART 118 — CONTEXT MENUS

Right-clicking an item should expose useful actions appropriate to that item.

Examples:

- split
- trim
- duplicate
- delete
- mute
- detach audio
- copy
- paste
- replace
- reset
- properties

Do not show irrelevant commands.

---

# PART 119 — KEYBOARD SHORTCUTS

Where appropriate:

Space:
Play/Pause

Delete:
Delete

Ctrl/Cmd + Z:
Undo

Ctrl/Cmd + Shift + Z:
Redo

S:
Split

I:
Set In

O:
Set Out

Arrow:
Step/seeking behavior where appropriate

J/K/L:
Playback navigation where supported

The exact shortcut scheme should be consistent.

---

# PART 120 — PROJECT SETTINGS VS CLIP SETTINGS

Do not confuse:

## Project settings

Examples:

- canvas
- aspect ratio
- resolution
- frame rate

with:

## Clip settings

Examples:

- crop
- transform
- speed
- volume

A project-wide change should not accidentally overwrite every clip-level property.

---

# PART 121 — CLIP SETTINGS VS TRACK SETTINGS

A track setting affects multiple clips on that track.

A clip setting affects one clip.

This distinction must be explicit.

---

# PART 122 — CLIP SETTINGS VS EFFECT SETTINGS

An effect may belong to a clip while a transform may belong to the clip's base composition.

Keep the underlying property model understandable.

---

# PART 123 — GLOBAL VS LOCAL

Every major feature should answer:

> Does this affect one object, one track, or the entire project?

This should be clear in both UI and code.

---

# PART 124 — TIME-BASED OPERATIONS

Anything that exists over time needs:

- start
- end/duration
- project-time relationship

Examples:

- clips
- captions
- audio
- transitions
- effects
- markers
- AI moments
- keyframes
- graphics

Avoid floating, disconnected timing systems.

---

# PART 125 — SOURCE-BASED OPERATIONS

Anything describing the original media should retain source information.

Examples:

- source in/out
- source frame
- source asset
- original duration

---

# PART 126 — PROJECT-BASED OPERATIONS

Anything describing the final edit belongs to project time.

Examples:

- clip position
- captions on timeline
- markers
- music placement
- transitions

---

# PART 127 — SPEED-BASED TIME MAPPING

If a clip is sped up or slowed down, source-to-project mapping is no longer one-to-one.

The system must correctly map:

source frame

→

project time

for:

- captions
- effects
- keyframes
- tracking
- overlays

where applicable.

This must be centralized rather than implemented independently by every feature.

---

# PART 128 — SILENCE REMOVAL MAPPING

Silence removal also changes project time.

Therefore it must use the same time-mapping infrastructure.

Do not write a separate timestamp conversion system for silence removal.

---

# PART 129 — NESTING / COMPOUND TIMELINE SUPPORT

If compound clips are implemented, nested project time becomes another mapping layer.

For example:

```text
Main Timeline
   ↓
Compound Clip
   ↓
Nested Timeline
   ↓
Source
```

Design the time system so nested sequences can eventually be supported safely.

---

# PART 130 — AI FEATURES SHOULD USE THE SAME TIME SYSTEM

AI moments, transcription, tracking and analysis must attach to the correct source/project timing.

Do not create AI-specific time formats that cannot map back to the project.

---

# PART 131 — AI TRANSCRIPTION

Transcription produces:

- text
- sentence boundaries
- word timing where available

These are analysis assets.

They should not automatically become hard-baked captions unless the user chooses to create captions.

---

# PART 132 — AI MOMENT DETECTION

AI analyzes evidence from:

- audio
- visual
- transcript where available

Then produces candidate moments.

The user decides what becomes an actual timeline edit.

---

# PART 133 — AI SUBJECT TRACKING

AI creates tracking information.

The editor converts tracking into editable framing/keyframes.

The user can modify it.

---

# PART 134 — AI SHOULD NEVER BECOME THE OWNER OF THE EDIT

AI can recommend.

AI can automate.

AI can analyze.

But the project remains user-editable.

---

# PART 135 — EXPORT PRESETS

Presets may include:

- 720p
- 1080p
- 1440p
- 2160p
- 30 FPS
- 60 FPS
- vertical
- landscape
- square

The UI must make it clear which values are actually being used.

---

# PART 136 — CUSTOM EXPORT

Allow custom settings where supported:

- width
- height
- frame rate
- bitrate/quality
- codec

Do not expose dangerous low-level options without validation.

---

# PART 137 — CODEC

The output codec should be selected deliberately.

If the application supports H.264, H.265/HEVC, AV1 or others, verify actual support before exposing them.

Do not show unsupported export options.

---

# PART 138 — QUALITY CONTROL

Export quality should be controlled by actual encoder settings.

Do not create a quality slider that doesn't map to real encoding parameters.

---

# PART 139 — FILE NAMING

Generated outputs should have sensible names and should avoid accidentally overwriting unrelated files.

---

# PART 140 — EXPORT VALIDATION

After export:

Run FFprobe where practical and verify:

- duration
- width
- height
- frame rate
- audio presence
- codec

Where the system can do it safely, compare expected project settings with actual file metadata.

---

# PART 141 — ERROR HANDLING

A failure should be localized.

Examples:

Transcription failed:

→ moments may still use hybrid fallback.

Render failed:

→ project remains intact.

Missing media:

→ relink.

Unsupported format:

→ explain why.

AI enhancement failed:

→ offer retry or normal export where appropriate.

---

# PART 142 — PERFORMANCE ARCHITECTURE

Normal playback should not perform expensive operations.

Avoid per-frame:

- React tree rerenders
- disk writes
- database writes
- AI inference
- FFmpeg commands
- waveform recalculation

Use:

- refs
- memoization
- caching
- efficient timeline rendering
- background processing

where appropriate to the actual framework.

---

# PART 143 — BACKGROUND PROCESSING

Expensive operations may run in the background:

- transcription
- moment analysis
- scene detection
- waveform generation
- thumbnail generation
- proxy generation
- AI enhancement
- rendering

The editor should remain usable when practical.

---

# PART 144 — PROCESS CANCELLATION

Background operations should be cancellable where safe.

Cancelling one analysis task should not corrupt the project.

---

# PART 145 — RENDER QUEUE

Long render jobs should be separated from interactive editing where possible.

The user can continue working while renders run if the architecture safely supports it.

---

# PART 146 — TESTING MUST BE SYSTEM-LEVEL

Do not test only individual controls.

Test complete editing workflows.

## Test A

Import video
→ crop
→ change aspect ratio
→ reframe
→ keyframes
→ captions
→ music
→ render

## Test B

Import video
→ AI moments
→ create moment
→ silence removal
→ captions
→ export

## Test C

Import video
→ add audio from File Explorer
→ place audio
→ trim
→ fade
→ render

## Test D

720p source
→ crop to 9:16
→ AI enhancement
→ 1080×1920 export

## Test E

Video speed changed
→ captions
→ keyframes
→ audio
→ render

## Test F

Several overlapping tracks
→ transitions
→ graphics
→ captions
→ audio mix
→ render

## Test G

Save
→ close
→ reopen
→ verify complete project

---

# PART 147 — PREVIEW / EXPORT TESTING

Never say:

> Preview works.

unless you also verify the exported result.

Test:

```text
Preview
        ↓
Render
        ↓
FFprobe
        ↓
Visual inspection
```

---

# PART 148 — QUALITY VERIFICATION

For AI-enhanced exports, inspect:

- detail
- edges
- faces
- motion
- textures
- text
- temporal consistency
- artifacts

For normal exports, inspect:

- correct crop
- correct timing
- correct audio
- correct captions
- correct effects

---

# PART 149 — FINAL EDITOR USER FLOW

A typical project may look like:

```text
CREATE PROJECT
      ↓
IMPORT MEDIA
      ↓
ORGANIZE MEDIA
      ↓
CHOOSE CANVAS
      ↓
BUILD TIMELINE
      ↓
TRIM / SPLIT / ARRANGE
      ↓
RIPPLE / ROLL / SLIP / SLIDE where needed
      ↓
CROP / SCALE / POSITION / ROTATE
      ↓
REFRAME / TRACK / KEYFRAME
      ↓
ADD MUSIC / VOICE / SFX
      ↓
REMOVE / ADJUST SILENCE
      ↓
ADD CAPTIONS
      ↓
ADD TEXT / GRAPHICS / IMAGES
      ↓
EFFECTS / TRANSITIONS
      ↓
AI MOMENTS / AI ASSISTANCE
      ↓
FINE-TUNE
      ↓
PREVIEW
      ↓
EXPORT SETTINGS
      ↓
OPTIONAL AI ENHANCEMENT
      ↓
RENDER
      ↓
VERIFY
```

Not every project requires every stage.

The system simply needs to make all of them compatible.

---

# PART 150 — THE CORE PRINCIPLE OF EDITING

Every edit should answer four questions:

### WHAT?

What media/object am I editing?

### WHEN?

Where does it occur in project time?

### WHERE?

Where does it appear in the composition?

### HOW?

How should it behave, look, sound, or change over time?

This should guide the data model and UI.

---

# PART 151 — THE CORE PRINCIPLE OF TIME

Every time-dependent feature should use the same underlying time model.

Do not create:

- one time model for captions
- another for moments
- another for silence removal
- another for camera
- another for rendering

They must be able to communicate.

---

# PART 152 — THE CORE PRINCIPLE OF SPACE

Every visual operation should have a defined coordinate space.

At minimum distinguish conceptually between:

- source coordinates
- clip coordinates
- composition/canvas coordinates
- output coordinates

Do not allow crop, transform and camera systems to use incompatible coordinate assumptions.

---

# PART 153 — THE CORE PRINCIPLE OF AUDIO

Audio exists on the timeline independently of video.

It may originate from:

- source video
- imported media
- generated voice
- music
- SFX

The final renderer mixes all applicable audio according to project state.

---

# PART 154 — THE CORE PRINCIPLE OF NON-DESTRUCTION

The editor should normally store:

> Instructions describing the edit.

It should not repeatedly modify the original source.

This allows:

- undo
- re-editing
- alternate exports
- changing aspect ratio
- changing crop
- changing resolution
- changing captions
- changing audio

without degrading the original source.

---

# PART 155 — THE CORE PRINCIPLE OF USER CONTROL

AI should help.

Automation should help.

Snapping should help.

Presets should help.

None of them should permanently remove manual control from the user unless explicitly intended.

---

# PART 156 — THE CORE PRINCIPLE OF PROFESSIONAL EDITING

The user should always understand:

- what is selected
- where the playhead is
- what time range is being edited
- which track is being modified
- which properties belong to the clip
- which properties belong to the project
- what will happen during export

---

# PART 157 — UI BEHAVIOR

The editor should use contextual panels.

Do not permanently display:

- all trim controls
- all caption controls
- all audio controls
- all camera controls
- all AI controls

Instead:

```text
SELECT OBJECT
     ↓
INSPECTOR UPDATES
     ↓
SHOW RELEVANT CONTROLS
```

---

# PART 158 — MAIN WORKSPACE

The desktop workspace should prioritize:

```text
LEFT
Tools / Media

CENTER
Preview

RIGHT
Inspector

BOTTOM
Timeline
```

Panels should be resizable where useful.

---

# PART 159 — TIMELINE VISIBILITY

The timeline must be large enough to actually edit.

It should visually show:

- video thumbnails
- audio waveforms
- captions
- keyframes
- clip boundaries
- playhead
- markers

---

# PART 160 — PREVIEW VISIBILITY

The preview should clearly represent:

- output aspect ratio
- visible crop
- camera framing
- overlays
- captions
- effects

---

# PART 161 — ADVANCED CONTROLS

Advanced settings may include:

- codec
- encoder options
- AI model
- tile size
- inference backend
- advanced color
- technical metadata

But these should not dominate normal editing.

---

# PART 162 — NEVER BUILD FAKE UI

Do not implement:

```text
button exists
but does nothing
```

or:

```text
slider changes visual number
but renderer ignores it
```

Every visible control must correspond to actual behavior.

If something is not yet implemented, do not pretend it is.

---

# PART 163 — INSPECT BEFORE REFACTORING

Before modifying the code:

1. map the current architecture
2. identify existing media model
3. identify timeline model
4. identify render pipeline
5. identify preview pipeline
6. identify time mapping
7. identify state management
8. identify duplication
9. identify performance bottlenecks
10. identify existing tests

Then decide what needs changing.

---

# PART 164 — DO NOT CREATE PARALLEL ENGINES

Avoid:

- second timeline engine
- second crop engine
- second keyframe engine
- second audio engine
- second renderer
- second project model

unless there is an unavoidable architectural reason.

Prefer shared infrastructure.

---

# PART 165 — TESTING AFTER EVERY MAJOR REFACTOR

After major changes:

- run the application
- test the changed feature
- test nearby dependent features
- inspect console logs
- inspect renderer logs
- verify persistence

Do not wait until the very end to discover that a foundational change broke the editor.

---

# PART 166 — FINAL VERIFICATION MATRIX

Before reporting completion, test:

### MEDIA
Import
Drag/drop
Preview
Metadata
Relink

### TIMELINE
Move
Trim
Split
Delete
Duplicate
Snap
Zoom
Scroll
Resize

### EDIT MODES
Select
Ripple
Roll
Slip
Slide
Blade where implemented

### VIDEO
Crop
Aspect ratio
Scale
Position
Rotation
Speed
Freeze frame
Reverse where implemented

### CAMERA
Tracking
Keyframes
Cut
Smooth
Hold
Easing where implemented

### AUDIO
Multiple tracks
Volume
Mute
Fade
Waveform
Detach
Link
Speed
Pitch/pan where implemented

### CAPTIONS
Timing
Word timing
Style
Animation
Position
Canvas changes

### AI
Transcription
Hybrid moments
Tracking
Enhancement

### EFFECTS
Clip effects
Transitions
Opacity
Masks where implemented
Blend modes where implemented

### PROJECT
Save
Autosave
Reopen
Missing media
Undo
Redo

### EXPORT
1080p
1440p
4K
Vertical
Landscape
Square
30 FPS
60 FPS
Normal export
AI-enhanced export

---

# PART 167 — ACTUAL VERIFICATION

Do not report:

> "Everything works."

unless it was actually tested.

Instead report:

```text
Feature
Test performed
Result
Notes
```

Example:

```text
9:16 crop
Horizontal source → 1080×1920
PASS
Verified visually + FFprobe
```

---

# PART 168 — FINAL ARCHITECTURAL GOAL

The final architecture should conceptually look like:

```text
                        PROJECT
                           │
        ┌──────────────────┼────────────────────┐
        ↓                  ↓                    ↓
      MEDIA             TIMELINE            SETTINGS
        │                  │                    │
        │          ┌───────┼───────┐            │
        │          ↓       ↓       ↓            │
        │        VIDEO    AUDIO   TEXT          │
        │          │       │       │            │
        │          └───────┼───────┘            │
        │                  │                    │
        │          EDITING ENGINE              │
        │                  │                    │
        │      ┌───────────┼────────────┐       │
        │      ↓           ↓            ↓       │
        │    CROP       CAMERA       EFFECTS     │
        │      │        KEYFRAMES        │       │
        │      └───────────┼────────────┘       │
        │                  │                    │
        │            COMPOSITION               │
        │                  │                    │
        │               PREVIEW                │
        │                  │                    │
        └──────────────→ RENDERER ←─────────────┘
                           │
                     AI PROCESSING
                           │
                      FINAL OUTPUT
```

The implementation does NOT need to literally use these exact modules or function names.

The important thing is that the responsibilities and relationships are clear.

---

# PART 169 — FINAL PRINCIPLE

Clipwright Studio is successful when all of these systems feel like parts of one editor:

**Media**
feeds the project.

**Timeline**
controls when things happen.

**Tracks**
control layering and organization.

**Trim/Split/Ripple/Roll/Slip/Slide**
control editing structure.

**Crop/Transform**
control spatial composition.

**Aspect Ratio**
controls the output canvas.

**Camera/Reframe/Tracking/Keyframes**
control animated framing.

**Audio**
controls the complete sound mix.

**Captions/Text**
control timed visual language.

**Effects/Transitions**
modify appearance and relationships.

**Silence Removal**
changes the timeline while preserving source media.

**AI Moments**
help identify meaningful content.

**AI Tracking**
helps automate framing.

**AI Super Resolution**
helps improve final visual reconstruction.

**Preview**
shows the current project.

**Renderer**
turns the project into the final media file.

**Project Persistence**
ensures the edit survives reopening.

Every one of them must understand the same:

**TIME**

**SPACE**

**PROJECT STATE**

and

**RENDERING RULES.**

---

# FINAL IMPLEMENTATION DIRECTIVE

Now inspect the existing Clipwright Studio project.

Do NOT immediately start changing UI.

First create a concise internal map of:

1. Current project model
2. Current asset model
3. Current timeline model
4. Current time representation
5. Current rendering pipeline
6. Current preview pipeline
7. Current crop/transform system
8. Current camera/keyframe system
9. Current audio system
10. Current caption system
11. Current silence-removal system
12. Current AI moment system
13. Current AI enhancement system
14. Current persistence system
15. Current render queue
16. Current error handling
17. Current performance bottlenecks
18. Duplicate/competing systems

Then compare that map to this document.

Identify:

- already implemented correctly
- partially implemented
- incorrectly implemented
- duplicated
- missing

Then make changes systematically.

Do not rebuild working systems merely for the sake of rewriting them.

Do not create placeholder functionality.

Do not create disconnected feature implementations.

Do not create fake controls.

Fix root architecture problems where necessary.

After major changes, test the complete workflows.

The final application must behave as **one coherent professional video editor**, not a collection of independent features.

# MOST IMPORTANT RULE

When adding or fixing any future editing feature, always ask:

> **What does this feature operate on?**
> 
> **Does it operate on source media, a timeline clip, a track, the composition, or the entire project?**
>
> **Which timeline does its time belong to?**
>
> **Which coordinate space does its position belong to?**
>
> **How will preview represent it?**
>
> **How will rendering reproduce it?**
>
> **What other systems depend on it?**
>
> **How will undo/redo and persistence store it?**

If those questions cannot be answered clearly, the feature is not architecturally ready to be implemented.

Build Clipwright Studio around this principle:

> **ONE PROJECT. ONE AUTHORITATIVE TIMELINE MODEL. ONE TIME SYSTEM. ONE COMPOSITION MODEL. MANY SPECIALIZED EDITING TOOLS WORKING TOGETHER.**

---

# SECTION B — CANONICAL ARCHITECTURE, DATA MODEL, STATE OWNERSHIP, AND IMPLEMENTATION ROADMAP

# PART 1 — NON-NEGOTIABLE ARCHITECTURAL PRINCIPLES

Before implementation, understand these rules.

## RULE 1 — ONE AUTHORITATIVE PROJECT MODEL

There must be one canonical representation of an editing project.

The following must derive from it:

- timeline
- preview
- inspector
- autosave
- project persistence
- render pipeline
- export settings
- AI editing operations
- undo/redo
- project validation

Do not create independent competing project representations.

---

## RULE 2 — ONE AUTHORITATIVE TIME MODEL

All time-based systems must use the same canonical time representation.

This includes:

- clips
- captions
- audio
- silence removal
- markers
- moments
- transitions
- keyframes
- effects
- speed changes
- tracking
- render ranges

Do not build separate timestamp systems for different features.

---

## RULE 3 — SOURCE TIME AND PROJECT TIME ARE DIFFERENT

A source file has its own timeline.

The edited project has another timeline.

Both must be represented.

Example:

```text
Source:
00:01:20.000 → 00:01:45.000

Project:
00:00:15.000 → 00:00:40.000
```

Never overwrite source timestamps with project timestamps.

---

## RULE 4 — ONE AUTHORITATIVE COMPOSITION MODEL

The application must have one consistent interpretation of:

- canvas
- aspect ratio
- crop
- transform
- rotation
- scale
- position
- layers
- masks
- opacity
- keyframes

Preview and renderer must use the same logical composition model.

---

## RULE 5 — NON-DESTRUCTIVE EDITING

Original source media must remain untouched during normal editing.

The project stores editing instructions.

---

## RULE 6 — AI IS ASSISTIVE

AI may:

- analyze
- recommend
- generate
- automate
- predict
- track

But the user remains able to:

- inspect
- change
- override
- delete
- restore

AI decisions must not become irreversible just because AI created them.

---

## RULE 7 — UI MUST REPRESENT REAL STATE

Do not create controls that only visually change something.

If a control exists, it must affect:

- project state
- preview
- and/or renderer

as appropriate.

---

# PART 2 — CANONICAL PROJECT DATA SCHEMA

The following is the **logical canonical schema**.

It is intentionally implementation-independent.

The current codebase may use different technologies, so adapt the types to the actual stack.

Do NOT create duplicate representations merely because another database or UI format requires one.

The application may use:

- TypeScript interfaces
- database rows
- JSON
- normalized tables
- serialized project files

internally.

However, all of those must map to the same logical model.

---

# PART 3 — PROJECT ROOT

Conceptually:

```ts
type Project = {
  schemaVersion: string;
  projectId: string;

  metadata: ProjectMetadata;

  canvas: CanvasSettings;

  settings: ProjectSettings;

  assets: Record<string, Asset>;

  sequences: Record<string, Sequence>;

  analysis: ProjectAnalysis;

  render: RenderSettings;

  appState?: PersistedEditorState;

  history?: HistoryMetadata;
};
```

The actual implementation may use arrays, maps, database records, or normalized entities.

The logical relationships must remain equivalent.

---

# PART 4 — PROJECT METADATA

```ts
type ProjectMetadata = {
  name: string;
  createdAt: string;
  updatedAt: string;

  description?: string;

  applicationVersion?: string;

  colorLabel?: string;

  tags?: string[];
};
```

Do not place transient UI state here.

---

# PART 5 — CANVAS SETTINGS

The canvas defines the project's output composition.

```ts
type CanvasSettings = {
  width: number;
  height: number;

  aspectRatio: {
    mode: "preset" | "custom";
    name?: string;
    numerator: number;
    denominator: number;
  };

  background: {
    type: "color" | "transparent" | "media" | "none";
    value?: string;
  };

  pixelAspectRatio?: {
    numerator: number;
    denominator: number;
  };
};
```

Examples:

16:9:

```text
1920 × 1080
```

9:16:

```text
1080 × 1920
```

1:1:

```text
1080 × 1080
```

4:5:

```text
1080 × 1350
```

The canvas is NOT the same thing as a clip crop.

---

# PART 6 — PROJECT SETTINGS

```ts
type ProjectSettings = {
  defaultFrameRate: RationalFrameRate;

  defaultPlaybackSpeed?: number;

  snapping: SnappingSettings;

  safeAreas: SafeAreaSettings;

  preview: PreviewSettings;

  audio: ProjectAudioSettings;

  editingMode?: EditingModeSettings;
};
```

---

# PART 7 — RATIONAL FRAME RATE

Do NOT store important frame-rate information only as floating-point numbers.

Use:

```ts
type RationalFrameRate = {
  numerator: number;
  denominator: number;
};
```

Examples:

30 FPS:

```json
{
  "numerator": 30,
  "denominator": 1
}
```

29.97 FPS:

```json
{
  "numerator": 30000,
  "denominator": 1001
}
```

59.94 FPS:

```json
{
  "numerator": 60000,
  "denominator": 1001
}
```

This avoids precision problems.

---

# PART 8 — CANONICAL TIME REPRESENTATION

Use a precise integer-based time representation internally.

Preferred conceptual model:

```ts
type Time = {
  ticks: bigint;
  timebase: Rational;
};
```

or an equivalent implementation that provides deterministic precision.

Do NOT rely on repeatedly adding floating-point seconds.

The application may display:

```text
00:01:23.450
```

but internal calculations must remain deterministic.

---

# PART 9 — DURATION

Represent duration using the same canonical time system.

Do not mix:

- milliseconds
- seconds
- frames
- microseconds

without explicit conversion.

A subsystem may use frames internally when necessary, but the conversion must be explicit and reversible.

---

# PART 10 — MEDIA ASSETS

Every imported source file becomes an Asset.

```ts
type Asset = {
  id: string;

  type: "video" | "audio" | "image" | "graphic" | "other";

  source: AssetSource;

  metadata: MediaMetadata;

  derived?: DerivedMediaData;

  analysis?: AssetAnalysis;

  status: AssetStatus;
};
```

---

# PART 11 — ASSET SOURCE

```ts
type AssetSource = {
  originalPath?: string;

  uri?: string;

  fileName: string;

  extension?: string;

  sourceHash?: string;

  sizeBytes?: number;
};
```

The system must not assume the original path will remain valid forever.

---

# PART 12 — MEDIA METADATA

```ts
type MediaMetadata = {
  duration?: Time;

  width?: number;
  height?: number;

  frameRate?: RationalFrameRate;

  videoCodec?: string;

  audioCodec?: string;

  audioChannels?: number;

  sampleRate?: number;

  bitrate?: number;

  hasVideo: boolean;
  hasAudio: boolean;
};
```

Only store information actually available.

---

# PART 13 — DERIVED MEDIA DATA

Derived information may include:

```ts
type DerivedMediaData = {
  thumbnailPath?: string;

  waveformPath?: string;

  proxyPath?: string;

  previewPath?: string;

  sceneAnalysisId?: string;

  transcriptionId?: string;
};
```

Derived files are caches/derivatives, not replacements for source media.

---

# PART 14 — ASSET STATUS

```ts
type AssetStatus =
  | "ready"
  | "importing"
  | "processing"
  | "missing"
  | "unsupported"
  | "error";
```

---

# PART 15 — SEQUENCES

A Sequence represents an editable timeline.

The main project should have a primary sequence.

Future nested/compound sequences can use the same model.

```ts
type Sequence = {
  id: string;

  name: string;

  duration?: Time;

  timebase: Rational;

  tracks: Track[];

  markers: Marker[];

  range?: TimeRange;

  transitions?: Transition[];

  nested?: boolean;
};
```

---

# PART 16 — TRACK

```ts
type Track = {
  id: string;

  name: string;

  type:
    | "video"
    | "audio"
    | "text"
    | "graphics"
    | "captions";

  order: number;

  muted?: boolean;
  solo?: boolean;
  visible?: boolean;
  locked?: boolean;

  blendMode?: string;

  clips: Clip[];
};
```

The exact track types may differ according to the implementation.

---

# PART 17 — CLIP

The Clip is the central timeline entity.

```ts
type Clip = {
  id: string;

  assetId?: string;

  type:
    | "video"
    | "audio"
    | "image"
    | "graphic"
    | "text"
    | "caption"
    | "compound";

  timeline: TimelinePlacement;

  source?: SourceRange;

  speed: SpeedSettings;

  transform?: TransformState;

  crop?: CropState;

  opacity?: number;

  audio?: ClipAudioState;

  effects?: EffectInstance[];

  keyframes?: KeyframeTrack[];

  captions?: CaptionData;

  tracking?: TrackingData;

  metadata?: ClipMetadata;
};
```

---

# PART 18 — TIMELINE PLACEMENT

```ts
type TimelinePlacement = {
  start: Time;

  duration: Time;

  end?: Time;
};
```

Do not store start + duration and independently editable end unless your implementation guarantees consistency.

Prefer one source of truth.

---

# PART 19 — SOURCE RANGE

```ts
type SourceRange = {
  start: Time;

  duration: Time;
};
```

For normal forward playback:

```text
source.start
+
source.duration
```

defines the used source section.

---

# PART 20 — SPEED SETTINGS

```ts
type SpeedSettings = {
  mode: "constant" | "curve";

  value?: number;

  curve?: SpeedKeyframe[];
};
```

Examples:

```text
1.0 = 100%
2.0 = 200%
0.5 = 50%
```

---

# PART 21 — TRANSFORM STATE

```ts
type TransformState = {
  position: {
    x: number;
    y: number;
  };

  scale: {
    x: number;
    y: number;
  };

  rotation: number;

  anchor?: {
    x: number;
    y: number;
  };
};
```

Coordinates must have a clearly documented coordinate space.

---

# PART 22 — CROP STATE

```ts
type CropState = {
  mode: "none" | "freeform" | "aspectLocked";

  aspectRatio?: {
    numerator: number;
    denominator: number;
  };

  rectangle: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};
```

The rectangle must have a defined coordinate space.

Do NOT mix source-pixel coordinates and normalized coordinates without explicitly declaring which is used.

---

# PART 23 — AUDIO STATE

```ts
type ClipAudioState = {
  enabled: boolean;

  volume: number;

  pan?: number;

  muted?: boolean;

  fadeIn?: Time;

  fadeOut?: Time;

  pitch?: number;
};
```

---

# PART 24 — EFFECT INSTANCE

```ts
type EffectInstance = {
  id: string;

  effectType: string;

  enabled: boolean;

  parameters: Record<string, unknown>;

  keyframes?: KeyframeTrack[];
};
```

Only use effect types supported by the renderer.

---

# PART 25 — KEYFRAME SYSTEM

Do not build a separate keyframe data structure for every feature.

Use a common conceptual system.

```ts
type KeyframeTrack = {
  property: string;

  keyframes: Keyframe[];
};
```

```ts
type Keyframe = {
  time: Time;

  value: unknown;

  interpolation:
    | "step"
    | "linear"
    | "easeIn"
    | "easeOut"
    | "easeInOut"
    | "custom";
};
```

---

# PART 26 — CAMERA KEYFRAMES

Camera/reframe should use the same keyframe architecture.

Possible properties:

```text
camera.position.x
camera.position.y
camera.scale
camera.rotation
camera.crop
```

Do NOT build a separate incompatible camera timeline.

---

# PART 27 — CUT / SMOOTH / HOLD

These behaviors may be represented by interpolation semantics or explicit transition metadata.

Conceptually:

### Cut
Step interpolation.

### Smooth
Interpolated transition.

### Hold
Maintain value until next relevant change.

The exact representation should be selected based on the existing architecture.

---

# PART 28 — TRACKING DATA

```ts
type TrackingData = {
  targetId?: string;

  status:
    | "none"
    | "processing"
    | "ready"
    | "failed";

  samples?: TrackingSample[];

  generatedKeyframes?: string[];
};
```

```ts
type TrackingSample = {
  time: Time;

  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  confidence?: number;
};
```

Tracking is analysis data.

Generated camera keyframes remain editable project data.

---

# PART 29 — CAPTION DATA

```ts
type CaptionData = {
  text: string;

  words?: CaptionWord[];

  styleId?: string;

  styleOverrides?: Record<string, unknown>;

  animation?: string;

  position?: {
    x: number;
    y: number;
  };
};
```

---

# PART 30 — CAPTION WORD

```ts
type CaptionWord = {
  text: string;

  start: Time;

  duration: Time;

  emphasis?: boolean;

  styleOverrides?: Record<string, unknown>;
};
```

---

# PART 31 — MARKERS

```ts
type Marker = {
  id: string;

  time: Time;

  duration?: Time;

  label?: string;

  category?: string;

  color?: string;

  note?: string;
};
```

Markers do not automatically affect rendering.

---

# PART 32 — TRANSITIONS

Transitions should be represented explicitly.

```ts
type Transition = {
  id: string;

  type: string;

  sequenceId: string;

  leftClipId: string;

  rightClipId: string;

  duration: Time;

  parameters?: Record<string, unknown>;
};
```

Only use transitions between compatible adjacent clips.

---

# PART 33 — PROJECT RANGE

```ts
type TimeRange = {
  start: Time;

  duration: Time;
};
```

Use this for:

- preview range
- render range
- analysis range
- selection range

Do not create separate incompatible range formats.

---

# PART 34 — AI ANALYSIS

Project analysis should be separate from core editing state.

Conceptually:

```ts
type ProjectAnalysis = {
  transcription?: TranscriptionAnalysis;

  audio?: AudioAnalysis;

  visual?: VisualAnalysis;

  scenes?: SceneAnalysis;

  moments?: MomentAnalysis;

  tracking?: Record<string, TrackingData>;
};
```

Analysis can produce recommendations/data.

The timeline/project remains authoritative.

---

# PART 35 — MOMENT

```ts
type Moment = {
  id: string;

  sourceAssetId?: string;

  sequenceId?: string;

  sourceRange: TimeRange;

  suggestedProjectRange?: TimeRange;

  title?: string;

  description?: string;

  type?: string;

  confidence?: number;

  scores?: {
    hook?: number;
    emotional?: number;
    content?: number;
    visual?: number;
    audio?: number;
    standalone?: number;
  };

  evidence?: {
    audio: boolean;
    visual: boolean;
    transcript: boolean;
  };

  status:
    | "candidate"
    | "accepted"
    | "rejected"
    | "converted";
};
```

A Moment is NOT automatically a timeline clip.

---

# PART 36 — TRANSCRIPTION

```ts
type TranscriptionAnalysis = {
  assetId: string;

  language?: string;

  segments: TranscriptSegment[];

  status:
    | "processing"
    | "ready"
    | "failed";
};
```

Transcription remains optional for hybrid moment analysis.

---

# PART 37 — AUDIO ANALYSIS

Audio analysis may contain:

```ts
type AudioAnalysis = {
  assetId: string;

  energyRegions?: AnalysisRegion[];

  silenceRegions?: TimeRange[];

  speechRegions?: TimeRange[];

  detectedEvents?: AnalysisEvent[];
};
```

---

# PART 38 — VISUAL ANALYSIS

```ts
type VisualAnalysis = {
  assetId: string;

  sceneChanges?: Time[];

  motionRegions?: AnalysisRegion[];

  detectedSubjects?: DetectedSubject[];

  visualEvents?: AnalysisEvent[];
};
```

---

# PART 39 — SILENCE REMOVAL

Silence removal must NOT destroy source media.

Represent edits as project-level timeline transformations or explicit edit decisions.

Conceptually:

```ts
type SilenceEdit = {
  sourceRange: TimeRange;

  action: "remove" | "keep" | "shorten";

  targetDuration?: Time;
};
```

The exact storage can differ, but the canonical model must retain enough information to reconstruct the edit.

---

# PART 40 — RENDER SETTINGS

```ts
type RenderSettings = {
  width: number;

  height: number;

  frameRate: RationalFrameRate;

  codec?: string;

  quality?: number;

  bitrate?: number;

  audio?: {
    codec?: string;
    bitrate?: number;
    sampleRate?: number;
  };

  aiEnhancement?: AIEnhancementSettings;
};
```

---

# PART 41 — AI ENHANCEMENT

```ts
type AIEnhancementSettings = {
  enabled: boolean;

  modelId?: string;

  quality?: "standard" | "high" | "maximum";

  backend?: string;

  options?: Record<string, unknown>;
};
```

Do not claim AI enhancement is active unless this flag is actually used by the renderer.

---

# PART 42 — EDITOR UI STATE VS PROJECT STATE

This is extremely important.

Not everything visible in the UI belongs in the project.

Example UI-only state:

```text
selectedClipId
activeTool
openPanel
timelineZoom
timelineScroll
panelWidth
hoveredClip
```

This should NOT be mixed into core editing data.

Persist these only if useful.

The project should primarily contain actual editing information.

---

# PART 43 — PERSISTED EDITOR STATE

If useful:

```ts
type PersistedEditorState = {
  activeSequenceId?: string;

  selectedClipId?: string;

  timelineZoom?: number;

  timelineScroll?: {
    x: number;
    y: number;
  };

  panelState?: Record<string, boolean>;

  panelSizes?: Record<string, number>;
};
```

This is separate from the canonical edit itself.

---

# PART 44 — SCHEMA VERSIONING

Every saved project must have:

```json
{
  "schemaVersion": "1.0.0"
}
```

or equivalent.

Whenever the schema changes:

- increment the schema
- provide migration logic
- preserve backwards compatibility where practical

Do NOT silently reinterpret old projects under a new schema.

---

# PART 45 — ENTITY IDs

Every major entity must have stable unique IDs.

Examples:

```text
projectId
assetId
sequenceId
trackId
clipId
markerId
momentId
transitionId
effectId
```

Never identify entities only by array index.

Array order can change.

IDs must remain stable.

---

# PART 46 — REFERENCES

Entities reference other entities by ID.

Example:

```text
clip.assetId
clip.trackId
moment.sourceAssetId
transition.leftClipId
```

Avoid duplicating full copies of another entity inside every reference.

---

# PART 47 — IMMUTABLE SOURCE IDENTIFICATION

Where possible, identify an imported source by:

- stable ID
- original path
- file hash

If the path changes, hash or metadata can help with relinking.

Do not use the filename alone as the identity.

---

# PART 48 — PROJECT VALIDATION

On project load, validate:

- referenced assets exist
- referenced tracks exist
- referenced clips exist
- times are valid
- durations are non-negative
- aspect ratios are valid
- frame rates are valid
- references are not broken

Repair recoverable issues.

Report unrecoverable issues.

Do not silently corrupt project state.

---

# PART 49 — CANONICAL SCHEMA EXAMPLE

A simplified project might look conceptually like:

```json
{
  "schemaVersion": "1.0.0",
  "projectId": "project-001",

  "metadata": {
    "name": "Podcast Clip",
    "createdAt": "...",
    "updatedAt": "..."
  },

  "canvas": {
    "width": 1080,
    "height": 1920,
    "aspectRatio": {
      "mode": "preset",
      "name": "9:16",
      "numerator": 9,
      "denominator": 16
    }
  },

  "settings": {
    "defaultFrameRate": {
      "numerator": 30,
      "denominator": 1
    }
  },

  "assets": {
    "video-001": {
      "id": "video-001",
      "type": "video",
      "source": {
        "fileName": "podcast.mp4"
      },
      "metadata": {
        "duration": "...",
        "width": 1920,
        "height": 1080,
        "hasVideo": true,
        "hasAudio": true
      },
      "status": "ready"
    }
  },

  "sequences": {
    "main": {
      "id": "main",
      "name": "Main",
      "timebase": {
        "numerator": 1,
        "denominator": 1000
      },
      "tracks": []
    }
  },

  "analysis": {
    "moments": {}
  },

  "render": {
    "width": 1080,
    "height": 1920,
    "frameRate": {
      "numerator": 30,
      "denominator": 1
    }
  }
}
```

This is an example only.

The final implementation must adapt the logical schema to the project's actual architecture.

---

# PART 50 — NORMALIZED VS SERIALIZED STORAGE

The runtime may use normalized database tables.

The exported project file may use nested JSON.

That is acceptable.

The important requirement is:

> Both representations must map to the same canonical logical model.

Do not allow database schema and runtime schema to evolve independently without migration/translation.

---

# PART 51 — TIME MAPPING ENGINE

Create a dedicated conceptual service for time mapping.

It should answer questions such as:

```text
source → project
project → source
source frame → project frame
project time → active clip
```

It must account for:

- trims
- moves
- splits
- speed changes
- silence removal
- nesting where applicable

Do not implement these conversions independently in captions, AI, camera, renderer, etc.

---

# PART 52 — COMPOSITION ENGINE

Create a shared composition interpretation.

Conceptually:

```text
Source Frame
↓
Source Crop
↓
Clip Transform
↓
Camera/Reframe
↓
Effects
↓
Layer Compositing
↓
Canvas
```

The exact technical order must be validated against the real renderer.

Preview and export must share the same mathematical definitions.

---

# PART 53 — AUDIO ENGINE

Similarly, audio needs one authoritative interpretation.

Conceptually:

```text
Source Audio
↓
Source Trim
↓
Speed
↓
Volume
↓
Fade
↓
Pan
↓
Track Mix
↓
Master Output
```

Again, adapt to the actual implementation.

---

# PART 54 — PHASED IMPLEMENTATION ROADMAP

Do NOT attempt to implement every missing feature simultaneously.

Use a phased rollout.

A phase is not complete simply because its code compiles.

A phase is complete when its acceptance tests pass.

---

# PHASE 0 — CODEBASE AND ARCHITECTURE AUDIT

## Objective

Understand the existing application before changing it.

Inspect:

- project structure
- frontend
- backend
- media handling
- timeline
- preview
- renderer
- AI integrations
- storage
- persistence
- import/export
- current tests

Create an architecture map.

Identify:

- what already works
- what is partial
- what is duplicated
- what is broken
- what is tightly coupled
- what must be migrated

## Acceptance Criteria

The agent must produce an actual architecture report.

No implementation changes are required unless necessary to establish the canonical model.

---

# PHASE 1 — CANONICAL PROJECT MODEL

## Objective

Create the central project data model.

Implement the equivalent of:

- Project
- Canvas
- Asset
- Sequence
- Track
- Clip
- Time
- Transform
- Crop
- Keyframes
- Audio state
- Effects
- Markers
- Render settings

## Goals

All existing editor features should begin referencing this canonical model.

## Acceptance Tests

- Create project.
- Import asset.
- Place clip.
- Save project.
- Reopen project.
- Verify identical editing state.

Nothing should depend on fragile array indexes.

---

# PHASE 2 — TIME AND COORDINATE SYSTEM

## Objective

Centralize:

- source time
- project time
- frame rate
- duration
- source-to-project mapping
- project-to-source mapping
- composition coordinates

## Acceptance Tests

Verify:

- trim
- split
- move
- speed
- captions
- keyframes
- silence mapping

all remain synchronized.

This phase is foundational.

Do not build advanced editing features on top of inconsistent timing.

---

# PHASE 3 — TIMELINE ENGINE

## Objective

Make the timeline structurally reliable.

Implement/refactor:

- tracks
- clips
- selection
- moving
- trimming
- splitting
- deleting
- duplicating
- snapping
- zoom
- scroll
- playhead
- markers

Then add advanced edit modes where appropriate:

- ripple
- roll
- slip
- slide
- blade

Do not implement advanced modes before the normal clip model is stable.

## Acceptance Tests

Perform real editing sessions involving multiple tracks and verify project persistence.

---

# PHASE 4 — MEDIA / ASSET SYSTEM

## Objective

Make importing and asset management reliable.

Implement:

- Media Library
- drag-and-drop
- Windows File Explorer drop
- thumbnails
- waveforms
- metadata
- asset reuse
- missing media
- relinking
- cache management

## Acceptance Tests

Import video, audio and image assets.

Restart application.

Verify references survive.

---

# PHASE 5 — CORE VIDEO EDITING

## Objective

Build reliable visual editing.

Implement/refactor:

- crop
- aspect ratio
- fit
- fill
- scale
- position
- rotation
- opacity
- image/video layers
- layer ordering

## Acceptance Tests

Test:

16:9 → 9:16

16:9 → 1:1

16:9 → 4:5

vertical → horizontal

Verify no distortion.

---

# PHASE 6 — CAMERA / REFRAME SYSTEM

## Objective

Build one unified animation system.

Implement:

- keyframes
- position
- scale
- rotation
- crop/framing
- cut
- smooth
- hold
- easing where supported
- subject tracking
- manual correction

## Acceptance Tests

5s:
subject left

10s:
subject right

15s:
zoom

Test Cut, Smooth and Hold.

Verify preview/render parity.

---

# PHASE 7 — AUDIO ENGINE

## Objective

Build proper multi-track audio.

Implement/refactor:

- audio tracks
- waveform
- volume
- mute
- fades
- trim
- split
- detach
- link/unlink
- speed
- pan where supported
- pitch where supported
- mixing

## Acceptance Tests

Mix:

- original audio
- music
- voiceover
- SFX

Verify exported mix.

---

# PHASE 8 — TEXT AND CAPTIONS

## Objective

Build captions as first-class timed objects.

Implement:

- captions
- word timing
- styles
- 50 caption presets
- animations
- per-word emphasis
- position
- safe areas

## Acceptance Tests

Change aspect ratio.

Verify captions remain correctly positioned.

Remove silence.

Verify caption synchronization.

---

# PHASE 9 — SILENCE / TIME EDITING

## Objective

Make silence removal part of the core time system.

Implement:

- automatic detection
- editable silence ranges
- remove
- restore
- shorten
- source/project mapping

## Acceptance Tests

Remove several silence sections.

Verify:

- captions
- audio
- moments
- camera keyframes
- markers

remain aligned.

---

# PHASE 10 — AI ANALYSIS / MOMENTS

## Objective

Integrate hybrid AI analysis without taking ownership of the timeline.

Implement:

- audio analysis
- visual analysis
- optional transcription
- candidate generation
- semantic analysis
- scoring
- boundary refinement
- explanations
- duplicate detection

## Acceptance Tests

Run:

### With transcript
Hybrid analysis.

### Without transcript
Audio + visual analysis.

### Transcript failure
Fallback succeeds.

A moment must never be a hidden destructive timeline edit.

---

# PHASE 11 — EFFECTS / TRANSITIONS / COMPOSITING

## Objective

Expand visual editing.

Implement reliable:

- effects
- adjustments
- transitions
- opacity
- masks where supported
- blend modes where supported
- graphics
- overlays
- adjustment layers where supported

## Acceptance Tests

Layer multiple visual elements and export.

Preview must match output.

---

# PHASE 12 — PERFORMANCE ARCHITECTURE

## Objective

Make the editor responsive.

Investigate:

- timeline rendering
- waveform caching
- thumbnail caching
- proxy media
- memoization
- background processing
- worker processes
- render queue

Measure performance instead of assuming improvement.

## Acceptance Criteria

Scrubbing and dragging should remain responsive on the target PC.

---

# PHASE 13 — AI SUPER RESOLUTION / QUALITY ENHANCEMENT

## Objective

Add optional AI video enhancement.

Implement:

- model management
- hardware detection
- local inference
- AI preview
- before/after comparison
- quality modes
- render integration
- cancellation
- disk-space handling

## Acceptance Tests

Compare:

720p → 1080p

720p → 1440p

720p → 4K

1080p → 4K

Verify actual visual output.

Do not confuse normal upscaling with AI enhancement.

---

# PHASE 14 — CANONICAL RENDERER

## Objective

Make export derive directly from canonical project state.

The renderer should understand:

- tracks
- clips
- source ranges
- crop
- transforms
- keyframes
- speed
- effects
- transitions
- captions
- audio
- silence edits
- AI enhancement
- canvas
- resolution
- frame rate

## Acceptance Criteria

Preview and render match.

Use FFprobe to verify actual outputs.

---

# PHASE 15 — PROJECT MIGRATION / RECOVERY

## Objective

Ensure old projects continue working.

Implement:

- schema migrations
- version validation
- recovery
- missing asset handling
- project backups where appropriate

Test projects created before the canonical schema change.

---

# PHASE 16 — PROFESSIONAL UI / UX

Only after the editing model is stable, polish the full editor interface.

The workspace should follow:

```text
LEFT
Tools / Media

CENTER
Preview

RIGHT
Contextual Inspector

BOTTOM
Large Timeline
```

Make panels:

- resizable
- contextual
- collapsible where appropriate

The timeline should be large enough for real editing.

---

# PHASE 17 — END-TO-END QUALITY PASS

Test the entire product as a user.

Perform workflows such as:

### Workflow A

Import
→ edit
→ crop
→ captions
→ audio
→ camera
→ export

### Workflow B

AI moment detection
→ create clip
→ silence removal
→ reframe
→ captions
→ export

### Workflow C

Windows drag/drop
→ music
→ SFX
→ image
→ multiple tracks
→ export

### Workflow D

720p source
→ heavy crop
→ AI enhancement
→ 4K export

### Workflow E

Save
→ close
→ reopen
→ continue editing

---

# PHASE 18 — FINAL HARDENING

Perform:

- crash testing
- missing-file testing
- unsupported-file testing
- render cancellation
- corrupted project recovery
- large-file testing
- memory testing
- long timeline testing
- repeated undo/redo testing

Fix actual issues found.

---

# PART 55 — PHASE DEPENDENCIES

Do not violate these dependencies.

```text
PHASE 0
   ↓
PHASE 1 — Canonical Project Model
   ↓
PHASE 2 — Time/Coordinate System
   ↓
PHASE 3 — Timeline
   ↓
PHASE 4 — Assets
   ↓
PHASE 5 — Core Video Editing
   ↓
PHASE 6 — Camera/Reframe
   ↓
PHASE 7 — Audio
   ↓
PHASE 8 — Captions
   ↓
PHASE 9 — Silence/Time Editing
   ↓
PHASE 10 — AI Moments
   ↓
PHASE 11 — Effects/Transitions
   ↓
PHASE 12 — Performance
   ↓
PHASE 13 — AI Enhancement
   ↓
PHASE 14 — Canonical Renderer
   ↓
PHASE 15 — Migration/Recovery
   ↓
PHASE 16 — UI/UX
   ↓
PHASE 17 — End-to-End Testing
   ↓
PHASE 18 — Hardening
```

Phases may overlap carefully when there is a legitimate reason.

However:

**Do not build advanced UI on top of broken project architecture.**

**Do not build complex AI editing on top of broken time mapping.**

**Do not build export features that bypass the canonical project model.**

---

# PART 56 — PHASE ACCEPTANCE RULE

A phase is COMPLETE only if:

1. Implementation exists.
2. Existing dependent functionality still works.
3. Actual tests were run.
4. Failures were corrected.
5. Project persistence was tested where relevant.
6. Preview behavior was checked.
7. Render behavior was checked where relevant.
8. Console/log errors were investigated.
9. No fake controls were introduced.

Do not simply report:

> "Phase complete."

Provide evidence.

---

# PART 57 — MIGRATION STRATEGY

Do not rewrite the entire existing project at once.

Use incremental migration.

For example:

```text
Existing timeline
      ↓
Adapter
      ↓
Canonical project model
      ↓
New components
```

As systems are migrated:

```text
Old system
→ compatibility layer
→ canonical system
→ remove old system after validation
```

Do not maintain two independent sources of truth indefinitely.

---

# PART 58 — BACKWARD COMPATIBILITY

When loading older projects:

```text
old schema
↓
migration
↓
canonical current schema
```

Never silently assume old data means the same thing if semantics changed.

---

# PART 59 — DATA INTEGRITY RULES

The project must enforce:

- no duplicate IDs where uniqueness is required
- no negative durations
- no invalid ranges
- no orphaned clips
- no missing referenced tracks
- no impossible frame rates
- no invalid aspect ratios
- no broken references
- no conflicting entities

Use validation before save and/or load.

---

# PART 60 — DELETION RULES

Deleting a timeline clip does NOT normally delete its asset.

Deleting an asset should check whether timeline clips still depend on it.

Deleting a track should handle its clips safely.

Deleting a project should not unexpectedly delete original source files.

---

# PART 61 — CACHE RULES

Cached files may be deleted and regenerated.

Canonical project data must not depend on disposable caches.

Examples of disposable data:

- thumbnails
- temporary waveforms
- preview renders
- proxy files
- AI intermediate files

The project should remain logically valid without them.

---

# PART 62 — TEMPORARY FILE RULES

Temporary processing files must:

- have identifiable ownership
- be isolated
- be cleaned after successful operations
- survive cancellation safely where needed
- not overwrite source media

---

# PART 63 — RENDER JOB MODEL

Where the application has a render queue, represent a job conceptually as:

```ts
type RenderJob = {
  id: string;

  projectId: string;

  sequenceId: string;

  settings: RenderSettings;

  range?: TimeRange;

  status:
    | "queued"
    | "processing"
    | "completed"
    | "failed"
    | "cancelled";

  progress?: number;

  outputPath?: string;

  error?: string;

  startedAt?: string;

  completedAt?: string;
};
```

Render jobs should reference the project state/version they are rendering.

---

# PART 64 — PROJECT VERSION DURING RENDER

A render should be tied to a defined project state.

If the user changes the project during a long render, do not accidentally mix old and new editing states.

Use an appropriate snapshot/versioning strategy.

The renderer should know exactly which project state it is rendering.

---

# PART 65 — UNDO/REDO ARCHITECTURE

Undo/redo should operate on project state changes, not arbitrary UI changes.

For example:

Valid undo:

> clip moved from 00:12 to 00:20

Not:

> mouse moved from pixel 418 to 419

Group continuous interaction into meaningful commands.

---

# PART 66 — COMMAND-BASED EDITING

Where practical, structure important edits as commands.

Examples:

```text
AddClip
MoveClip
TrimClip
SplitClip
DeleteClip
SetCrop
SetTransform
AddKeyframe
SetAudioVolume
AddCaption
DeleteCaption
SetCanvas
```

This can make:

- undo/redo
- persistence
- testing
- auditability

much more reliable.

Do not force this pattern if it conflicts with the existing architecture, but preserve the underlying principle of explicit editing operations.

---

# PART 67 — CANONICAL EDIT COMMANDS

Every command should have enough information to:

1. Apply itself.
2. Be undone.
3. Be serialized where necessary.
4. Be tested.
5. Update relevant project state.

---

# PART 68 — UI SHOULD NEVER DIRECTLY MODIFY RENDERER STATE

The UI should edit project state.

Then the preview/renderer consumes that state.

Avoid:

```text
UI button
→ directly mutate FFmpeg command
```

without updating canonical project state.

Instead:

```text
UI
↓
Project Command / State Update
↓
Canonical Project
↓
Preview / Renderer
```

---

# PART 69 — AI SHOULD MODIFY PROJECT THROUGH THE SAME SYSTEM

If AI creates:

- captions
- keyframes
- moments converted into clips
- tracked framing
- edits

it should use the same project model and command/update pathway.

Do not create an AI-only data path that the normal editor cannot understand.

---

# PART 70 — EXAMPLE AI ACTION

AI says:

> Focus person at 00:12.

It should create/edit canonical keyframe data.

The normal inspector should then be able to display and edit that keyframe.

The renderer should understand it.

Undo should understand it.

Save/reopen should preserve it.

---

# PART 71 — EXAMPLE AI MOMENT

AI identifies:

```text
00:42 → 01:08
```

The moment exists in analysis data.

When user clicks:

**Create Clip**

the application creates a canonical timeline clip.

That clip now behaves exactly like a manually created clip.

AI does not create a special "AI clip type" that the editor treats differently unless there is a genuine need.

---

# PART 72 — EXAMPLE AI CAPTIONS

AI transcription produces text/timing.

When user clicks:

**Generate Captions**

the application creates canonical caption objects.

Those captions must then behave like normal editable captions.

---

# PART 73 — EXAMPLE AI TRACKING

AI tracking generates analysis.

When user accepts:

Tracking
→ generated keyframes

Those keyframes become normal editable project data.

---

# PART 74 — EDITOR PROPERTY OWNERSHIP

For every property, document its ownership.

Examples:

### Canvas

Project.

### Volume

Clip or Track.

### Crop

Clip.

### Camera keyframe

Clip/composition animation.

### Caption styling

Caption.

### Resolution

Render/project output.

### AI model

Render settings.

### Timeline zoom

UI state.

This prevents accidental scope errors.

---

# PART 75 — PROPERTY SCOPE TABLE

Create and maintain an internal mapping equivalent to:

| Property | Scope |
|---|---|
| Canvas size | Project |
| Aspect ratio | Project |
| Frame rate | Project/Render |
| Clip position | Clip |
| Clip duration | Clip |
| Source in/out | Clip |
| Crop | Clip |
| Scale | Clip |
| Rotation | Clip |
| Opacity | Clip |
| Volume | Clip/Track |
| Mute | Track/Clip |
| Caption text | Caption |
| Caption style | Caption/Style |
| Camera keyframe | Clip |
| Marker | Sequence |
| AI moment | Analysis |
| Export codec | Render |
| Timeline zoom | UI |
| Open panel | UI |

The exact implementation can differ, but ownership must remain clear.

---

# PART 76 — DO NOT HARD-CODE ASSUMPTIONS

Before implementing:

- inspect existing data
- inspect existing renderer
- inspect current AI integration
- inspect actual file handling

Do not assume:

- FFmpeg is the only renderer
- React is the only UI architecture
- a particular database is used
- all media is local
- all AI is cloud-based

Use the actual project.

---

# PART 77 — PERFORMANCE PRIORITY

Performance priorities should generally be:

1. Playback responsiveness
2. Timeline interaction
3. Scrubbing
4. Basic editing
5. Background analysis
6. Heavy rendering

Do not allow expensive AI processing to make basic editing unusable.

---

# PART 78 — HARDWARE AWARENESS

The application should detect available hardware where relevant.

This matters for:

- AI analysis
- super-resolution
- decoding
- encoding
- rendering

The system should have sensible fallbacks.

---

# PART 79 — PROFESSIONAL EDITOR UI

The UI should communicate the system clearly.

Use:

```text
LEFT
Tools / Media

CENTER
Preview

RIGHT
Contextual Inspector

BOTTOM
Timeline
```

The timeline must have meaningful vertical space.

---

# PART 80 — CONTEXTUAL INSPECTOR

When nothing is selected:

> Select something to edit.

Video selected:

> Video controls.

Audio selected:

> Audio controls.

Caption selected:

> Caption controls.

Moment selected:

> Moment controls.

Keyframe selected:

> Keyframe controls.

Do not show every control simultaneously.

---

# PART 81 — PRIMARY VS ADVANCED CONTROLS

Primary:

- crop
- scale
- position
- volume
- speed
- text
- basic keyframes

Advanced:

- codec
- model backend
- tile size
- advanced color
- technical encoding options

Keep advanced functionality accessible without overwhelming the main editor.

---

# PART 82 — USER WORKFLOW PRINCIPLE

A normal user should be able to understand:

```text
Import
↓
Arrange
↓
Edit
↓
Style
↓
Preview
↓
Export
```

without understanding the technical implementation.

---

# PART 83 — ENGINEERING WORKFLOW

The coding agent should work in this order:

### Step 1
Inspect.

### Step 2
Document current architecture.

### Step 3
Identify canonical model gaps.

### Step 4
Plan migration.

### Step 5
Implement one foundational phase.

### Step 6
Test.

### Step 7
Fix.

### Step 8
Move to next phase.

Do not make dozens of unrelated edits simultaneously.

---

# PART 84 — AFTER EACH PHASE

Provide:

```text
PHASE:
What was implemented:
Files/components affected:
Migration required:
Tests performed:
Tests passed:
Tests failed:
Remaining issues:
```

Do not report success without testing.

---

# PART 85 — FINAL SYSTEM ACCEPTANCE TEST

The finished application must support a complete workflow such as:

```text
Import horizontal video
↓
Choose 9:16
↓
Crop manually
↓
Add subject tracking
↓
Correct camera keyframes
↓
Trim clips
↓
Remove some silence
↓
Add music
↓
Add SFX
↓
Generate captions
↓
Edit caption style
↓
Add B-roll
↓
Add logo
↓
Add transition
↓
Review AI moments
↓
Create a moment clip
↓
Apply effects
↓
Preview
↓
Choose 1080×1920 / 60 FPS
↓
Enable AI enhancement
↓
Render
↓
FFprobe verification
↓
Visual inspection
```

Every stage must cooperate.

---

# PART 86 — FINAL SUCCESS DEFINITION

Clipwright Studio is complete architecturally when:

### Data

There is one canonical project model.

### Time

There is one authoritative time system.

### Space

There is one coherent composition/coordinate system.

### Timeline

All clips/tracks follow the same editing model.

### AI

AI uses the same project structures as manual editing.

### Preview

Preview derives from project state.

### Renderer

Renderer derives from project state.

### Persistence

Saved projects reproduce project state.

### UI

UI exposes the right controls according to selection/context.

### Performance

Interactive editing remains responsive.

### Reliability

Failures do not destroy project data.

---

# FINAL DIRECTIVE TO THE CODING AGENT

Before implementation, do the following:

## 1. AUDIT

Inspect the existing application completely.

## 2. MAP

Create an internal architecture map against this specification.

## 3. COMPARE

Identify:

- implemented
- partial
- incorrect
- duplicated
- missing

## 4. MIGRATE

Move the application progressively toward the canonical project model.

## 5. IMPLEMENT BY PHASE

Follow the roadmap in dependency order.

## 6. TEST EACH PHASE

Do not stack untested phases.

## 7. VERIFY PREVIEW AND EXPORT

Anything visible in the preview must have a corresponding renderer interpretation.

## 8. VERIFY PERSISTENCE

Close/reopen and verify.

## 9. VERIFY END-TO-END WORKFLOWS

Test real editing sessions, not only buttons.

## 10. REPORT FACTUALLY

State exactly what passed, failed, remains incomplete, and why.

---

# FINAL ARCHITECTURAL PRINCIPLE

Everything in Clipwright Studio should ultimately fit into this model:

```text
                    PROJECT
                       │
       ┌───────────────┼────────────────┐
       ↓               ↓                ↓
     ASSETS          SEQUENCES       SETTINGS
                        │
                      TRACKS
                        │
                      CLIPS
                        │
        ┌───────────────┼─────────────────┐
        ↓               ↓                 ↓
     VIDEO            AUDIO             TEXT
        │               │                 │
   TRANSFORM        MIXING          CAPTIONS
   CROP             VOLUME          ANIMATION
   CAMERA           FADE            STYLE
   KEYFRAMES        EFFECTS
        │               │
        └───────────────┼─────────────────┘
                        ↓
                  COMPOSITION
                        ↓
                     PREVIEW
                        ↓
                    RENDERER
                        ↓
               OPTIONAL AI QUALITY
                        ↓
                  FINAL OUTPUT
```

And the project model must be the common language connecting all of these.

The final editor should not behave as:

> "the caption system knows one timeline, the camera system knows another, the renderer knows a third, and the UI has a fourth."

It must behave as:

> **ONE PROJECT → ONE TIMELINE MODEL → ONE TIME SYSTEM → ONE COMPOSITION MODEL → MANY TOOLS.**

That is the canonical architecture for the editing system.

---

# SECTION C — ADDITIONAL CROSS-SYSTEM GUARDRAILS AND CANONICAL WORKFLOWS

# PART 42 — CAPTIONS

Captions are not simply subtitles printed on top of the video.

In Clipwright they are editable timed visual objects.

Each caption should have:

- text
- start time
- end time
- words
- word timing where available
- style
- animation
- position
- emphasis

---

# PART 43 — CAPTION TIMING

Captions must be attached to project time.

When the timeline changes, caption timing should remain aligned to the intended speech.

This is especially important when:

- clips are moved
- silence is removed
- moments are edited
- source/project mapping changes

---

# PART 44 — WORD-LEVEL CAPTIONS

If the application has word timing:

Each word can have:

- start
- end
- emphasis state
- style override
- animation

This enables:

- karaoke
- word highlighting
- pop animations
- keyword emphasis

---

# PART 45 — CAPTION STYLE

A caption style defines appearance.

It may contain:

- font
- size
- weight
- color
- highlight
- stroke
- shadow
- animation
- alignment
- line spacing

Style is separate from the actual caption text.

---

# PART 46 — CAPTION + OUTPUT CANVAS

Caption positioning should be based on the final project canvas.

If the project changes from:

16:9

to:

9:16

the caption system should adapt to the new composition.

Do not leave captions positioned according to the old canvas.

---

# PART 47 — SILENCE REMOVAL

Silence removal changes the project's time structure.

It should be treated as an editing operation, not destructive modification of the original recording.

Example:

Original:

```text
A ─── silence ─── B ─── silence ─── C
```

Edited:

```text
A ─── B ─── C
```

The source remains unchanged.

The project timeline now has a different relationship to source time.

---

# PART 48 — USER-CONTROLLABLE SILENCE REMOVAL

The user should be able to inspect detected silence.

They should be able to:

- keep some silence
- remove some silence
- shorten silence
- restore removed sections

The AI's decision is editable.

---

# PART 49 — SILENCE REMOVAL + CAPTIONS

When silence is removed:

Captions must move with the corresponding speech.

Example:

Original:

```text
speech 1
silence
speech 2
```

After removal:

```text
speech 1
speech 2
```

Caption timing should follow the project transformation.

---

# PART 50 — SILENCE REMOVAL + CAMERA KEYFRAMES

Camera keyframes must remain associated with the correct content.

If source time 00:30 becomes project time 00:24:

the system must know this mapping.

Never simply leave the camera at the old project timestamp without checking the source relationship.

---

# PART 51 — AI MOMENTS

AI moments are recommendations about useful sections of the source/project.

They should not be confused with final clips.

A moment contains information such as:

- source/project boundaries
- title
- description
- reason
- score/confidence
- evidence sources
- type

The user can turn a moment into an editable clip.

---

# PART 52 — HYBRID AI MOMENT DETECTION

The AI moment system uses:

## Audio

Signals such as:

- speech energy
- silence
- laughter
- intensity
- transitions

## Visual

Signals such as:

- scene changes
- motion
- reactions
- visual events

## Transcript, when available

Signals such as:

- strong statements
- stories
- explanations
- jokes
- hooks
- conclusions

Transcription is optional.

The AI should combine whatever evidence exists.

---

# PART 53 — AI MOMENT BOUNDARIES

AI should determine:

> Where should this moment start?

and:

> Where should it end?

Do not automatically cut only around the detected event.

Preserve enough context for the clip to make sense.

The user must be able to adjust the result manually.

---

# PART 54 — MOMENTS VS TIMELINE

A generated moment is an analysis result.

The timeline is the actual edit.

This distinction must remain clear.

Example:

```text
AI Moment
00:42 → 01:05

User chooses:
Create Clip

↓

Timeline clip
placed at:
00:00 → 00:23
```

The source content remains associated with its original source time.

---

# PART 66 — EXPORT DOES NOT CHANGE PROJECT LOGIC

Rendering should not destroy or permanently modify the editing project.

The project remains editable after export.

---

# PART 76 — PROJECT STATE

A project should contain enough information to recreate the edit.

Conceptually:

```text
Project
├── settings
├── canvas
├── assets
├── tracks
├── clips
├── captions
├── moments
├── keyframes
├── silence edits
├── effects
└── render settings
```

Adapt this to the actual codebase.

Do not duplicate the same data unnecessarily across multiple incompatible state systems.

---

# PART 77 — RENDER STATE VS EDIT STATE

The renderer should consume project state.

The UI should not independently invent its own version of the project.

There should be one authoritative representation of editing data.

This prevents:

- preview/render mismatch
- lost changes
- broken persistence
- timestamp inconsistencies

---

# PART 78 — PERFORMANCE RULE

Playback should be fast.

Do not perform:

- AI inference every frame
- FFmpeg operations every frame
- database writes every frame
- waveform generation every frame
- full React/UI tree rebuilds every frame

Use efficient state management and rendering.

---

# PART 79 — PREVIEW QUALITY VS FINAL QUALITY

The editor preview can use lower-cost rendering where necessary for responsiveness.

The final render can use:

- higher quality
- AI super-resolution
- full effects
- final audio mix

This is normal.

But the result should remain visually consistent.

---

# PART 80 — SAVE BEHAVIOR

The application should save the project state safely.

Avoid saving every mouse movement as a giant database operation.

Use:

- debouncing
- transactions
- appropriate state snapshots

Autosave should not make the editor lag.

---

# PART 81 — ERROR HANDLING

One failed operation should not destroy the project.

Examples:

AI transcription failed:
→ continue without transcript.

AI moments failed:
→ preserve existing project.

Render failed:
→ preserve project.

Missing media:
→ show Media Missing and allow relinking.

Unsupported file:
→ explain the problem.

---

# PART 82 — MEDIA MISSING

If an imported source file is moved or renamed:

The project should recognize:

```text
MEDIA MISSING
```

and offer:

**Relink**

The user chooses the new file.

Do not silently substitute another file.

---

# PART 84 — THE COMPLETE EDITING FLOW

A normal Clipwright workflow should conceptually look like this:

```text
1. Create/open project
        ↓
2. Import media
        ↓
3. Analyze source
        ↓
4. Add media to timeline
        ↓
5. Choose canvas/aspect ratio
        ↓
6. Trim/split/rearrange
        ↓
7. Crop/reframe
        ↓
8. Add camera/keyframes if needed
        ↓
9. Add audio/music/SFX
        ↓
10. Remove/modify silence if desired
        ↓
11. Generate/edit captions
        ↓
12. Add graphics/images
        ↓
13. Apply effects/transitions
        ↓
14. Review AI moments
        ↓
15. Fine-tune timeline
        ↓
16. Preview complete project
        ↓
17. Choose resolution/FPS
        ↓
18. Optional AI enhancement
        ↓
19. Render
        ↓
20. Verify output
```

Not every project uses every step.

The system simply needs to support them without the components fighting each other.

---

# PART 85 — EXAMPLE: HORIZONTAL VIDEO TO SHORT-FORM VIDEO

Suppose the source is:

```text
1920×1080
16:9
```

The user wants:

```text
1080×1920
9:16
```

The correct process is:

### Step 1
Choose 9:16 canvas.

### Step 2
Scale the original proportionally.

### Step 3
Choose the crop/framing.

### Step 4
Position the visible region.

### Step 5
Optionally track a person.

### Step 6
Correct tracking with keyframes.

### Step 7
Add captions.

### Step 8
Add music/SFX.

### Step 9
Preview.

### Step 10
Render at 1080×1920.

The original source remains 1920×1080.

---

# PART 86 — EXAMPLE: PODCAST

Source:

```text
60-minute podcast
```

The user may:

1. Import video.
2. Run hybrid AI analysis.
3. Generate moments.
4. Choose one moment.
5. Create a timeline clip.
6. Remove dead silence.
7. Change aspect ratio to 9:16.
8. Reframe the speaker.
9. Add camera keyframes.
10. Add captions.
11. Add background music.
12. Adjust audio.
13. Render 1080×1920.
14. Optionally enable AI enhancement.

Every system must cooperate.

---

# PART 87 — EXAMPLE: MANUAL MUSIC EDIT

User imports:

```text
main video
beat.mp3
sfx.wav
logo.png
```

They can:

1. Put video on Video 1.
2. Put beat on Music.
3. Put SFX on SFX.
4. Put logo on Graphics.
5. Adjust each independently.
6. Preview all simultaneously.
7. Render all layers together.

---

# PART 88 — EXAMPLE: CAMERA MOVEMENT

User has a horizontal interview.

They want:

```text
00:00–00:05
speaker left

00:05–00:10
speaker right

00:10–00:15
zoom in
```

They should:

1. Select video.
2. Choose 9:16.
3. Enter framing/camera mode.
4. Add keyframe at 00:00.
5. Add keyframe at 00:05.
6. Add keyframe at 00:10.
7. Choose Cut/Smooth/Hold per transition.
8. Preview.
9. Export.

No separate incompatible camera engine should be required.

---

# PART 89 — THE RENDER PIPELINE

The final render should conceptually combine:

```text
SOURCE ASSETS
      ↓
SOURCE TRIM
      ↓
TIMELINE ARRANGEMENT
      ↓
SILENCE/TIME MAPPING
      ↓
CROP / TRANSFORM / CAMERA
      ↓
EFFECTS / TRANSITIONS
      ↓
VISUAL COMPOSITING
      ↓
CAPTIONS / GRAPHICS
      ↓
AUDIO MIX
      ↓
OPTIONAL AI QUALITY PROCESSING
      ↓
FINAL ENCODE
```

The actual implementation may reorder stages where technically necessary.

But every step needs a defined place in the pipeline.

---

# PART 90 — THE SINGLE SOURCE OF TRUTH

This is one of the most important engineering requirements.

Do not let:

- preview state
- timeline state
- render state
- inspector state
- AI state

become five unrelated versions of the project.

There should be an authoritative project representation.

The UI reads and edits that representation.

The preview derives from it.

The renderer derives from it.

The saved project derives from it.

This prevents the editor from becoming inconsistent.

---

# PART 91 — WHAT SHOULD NEVER HAPPEN

Never allow:

### Crop changes aspect ratio accidentally.

### Scaling stretches people.

### Moving an audio clip changes unrelated video.

### Caption timing drifts after silence removal.

### Camera keyframes point to the wrong content.

### Preview shows one crop while export uses another.

### AI enhancement is claimed when only normal scaling occurred.

### Export removes an imported audio track.

### Closing and reopening destroys edits.

### Moving a timeline clip changes the source file.

### Dragging a clip randomly jumps it to another position.

### A feature creates fake UI controls that don't actually work.

---

# PART 92 — USER EXPERIENCE PRINCIPLE

The editor should feel like this:

> I know what I am editing.

> I know where I am in time.

> I know what is selected.

> I can see what will appear in the final video.

> I can change it immediately.

> Advanced options appear when I need them.

> My edits do not destroy my source files.

> Every part of the editor stays synchronized.

That is the goal.

---

# PART 93 — IMPORTANT IMPLEMENTATION RULE

Before writing new code:

1. Inspect the current application.
2. Identify existing systems.
3. Identify duplicate systems.
4. Identify where state is stored.
5. Identify timestamp handling.
6. Identify preview/render differences.
7. Identify feature dependencies.
8. Identify broken assumptions.

Then implement the architecture carefully.

Do not create a new timeline engine because one feature is difficult.

Do not create a separate crop engine because camera controls are inconvenient.

Do not create separate timestamp systems for captions, moments and keyframes.

Prefer a unified editing architecture.

---

# PART 94 — FINAL MENTAL MODEL

Think of Clipwright Studio as a document describing a video.

The source files are the raw materials.

The timeline is the arrangement.

The composition is the visual result.

The audio mix is the sound result.

The keyframes describe movement over time.

The captions describe timed text.

The AI systems provide recommendations and automation.

The renderer turns the description into a real video.

The editor is therefore essentially:

```text
PROJECT
   │
   ├── MEDIA
   │
   ├── TIMELINE
   │
   ├── COMPOSITION
   │
   ├── AUDIO
   │
   ├── TEXT/CAPTIONS
   │
   ├── KEYFRAMES
   │
   ├── AI ANALYSIS
   │
   ├── EFFECTS
   │
   └── EXPORT SETTINGS
             ↓
          RENDERER
             ↓
        FINAL VIDEO
```

Every subsystem must communicate through the same underlying project model.

---

# PART 95 — IMPLEMENTATION DIRECTIVE

Now inspect the current Clipwright Studio project and compare it against this document.

Create an internal architecture map showing:

- what already exists
- what partially exists
- what is broken
- what is duplicated
- what needs refactoring
- what needs to be added

Then improve the application systematically.

Do not rebuild everything blindly.

Do not remove working functionality.

Do not create placeholder controls.

Do not create fake implementations.

Do not claim something works until you test it.

Whenever possible, fix the underlying architecture instead of applying a visual patch.

---

# PART 96 — TEST AS ONE SYSTEM

Do not test only individual buttons.

Test complete workflows.

For example:

## WORKFLOW A

Import video
→ choose 9:16
→ crop
→ add camera keyframes
→ add captions
→ add music
→ remove silence
→ preview
→ render
→ compare output

## WORKFLOW B

Import video
→ AI moment detection
→ create moment
→ edit boundaries
→ reframe
→ captions
→ export

## WORKFLOW C

Import video
→ drag audio from Windows Explorer
→ place audio at specific timeline position
→ trim
→ fade
→ add SFX
→ render

## WORKFLOW D

Import low-resolution video
→ crop heavily
→ enable AI Super Resolution
→ export 4K
→ inspect quality

The purpose of these tests is to verify that the systems cooperate, not merely that each feature works alone.

---

# FINAL SUCCESS DEFINITION

Clipwright Studio should behave like one coherent video editor.

Not:

> a collection of AI tools beside a video player.

It should feel like:

> **a timeline-based professional editing application with AI built into the workflow.**

When a user performs an edit, every dependent system should understand that change.

When the user changes the canvas:

→ framing understands it.

When the user changes framing:

→ camera/keyframes understand it.

When the user changes timing:

→ captions understand it.

When silence is removed:

→ timing mappings understand it.

When audio is added:

→ the final mixer understands it.

When the user presses Render:

→ the renderer understands the complete project.

When the project is reopened:

→ everything returns exactly as it was.

The most important engineering principle is:

**One project. One timeline model. One authoritative time system. One composition model. Many specialized tools operating on that same project.**

Build the editor around that principle.
