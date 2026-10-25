# Chapter 25: Diagrams and System Relationships

**Draft v1, 25 October 2026.** All diagrams are **[PROPOSED]** engineering models in Mermaid. None shows CapCut's internal architecture, which is **[UNKNOWN]**. Each diagram is followed by a prose explanation.

---

## 25.1 Major editor subsystems

```mermaid
flowchart TD
    UI[UI layer] --> CMD[Command and selection layer]
    CMD --> MODEL[Project model]
    CMD --> UNDO[Undo history]
    MODEL --> SAVE[Persistence: save, autosave, recovery]
    MODEL --> EVAL[Evaluation: active clips, properties]
    EVAL --> REND[Renderer: compositor, effects, text]
    EVAL --> MIX[Audio mixer]
    REND --> PREV[Preview output]
    MIX --> AUD[Audio device]
    REND --> EXP[Export: encoder, muxer]
    MIX --> EXP
    ASSET[Asset registry and probing] --> MODEL
    JOBS[Job system] --> ASSET
    JOBS --> CACHE[Caches: thumbnails, peaks, proxies, frames]
    CACHE --> REND
```

The model is the center. The UI only issues commands. Evaluation turns the model into per-time instructions for the renderer and mixer, and the same evaluation feeds preview and export. The job system builds disposable caches off the UI thread.

## 25.2 User-interface regions and conceptual relationships

```mermaid
flowchart LR
    LIB[Media library panel] -- drag or add --> TL[Timeline]
    TL -- playhead time --> PV[Preview monitor]
    TL -- selection --> INS[Inspector / property panel]
    INS -- property changes --> TL
    TB[Toolbar and menus] -- commands --> TL
    PV -- on-canvas handles --> INS
    EXPD[Export dialog] -. snapshot .-> TL
```

Regions are conceptual, not CapCut's exact layout (verification pending in Chapter 2). Selection in the timeline determines inspector content; on-canvas edits and inspector edits write the same properties through commands.

## 25.3 Media import and asset management

```mermaid
flowchart TD
    A[File / folder / drop] --> B[Validate path and access]
    B --> C[Probe container and streams]
    C -->|error| E[Typed error in import report]
    C -->|ok| D[Create asset record + fingerprint]
    D --> F{Duplicate?}
    F -->|yes| G[Ask: reuse or add]
    F -->|no| H[Register asset]
    G --> H
    H --> I[Enqueue thumbnails and waveform]
    H --> J[Optional: proxy job]
    I --> K[Cache store]
    J --> K
```

Registration is fast; heavy work is queued. Failures are reported per file without aborting a batch.

## 25.4 Timeline data relationships

```mermaid
classDiagram
    class Timeline { tracks }
    class Track { kind; order; locked; hidden; muted }
    class Clip { start; sourceIn; sourceOut; speed; linkGroup }
    class Asset { id; paths; fingerprint; streams }
    class Effect { type; params; order }
    class Transition { type; duration; alignment }
    class Keyframe { time; value; interp }
    Timeline "1" --> "*" Track
    Track "1" --> "*" Clip
    Clip "*" --> "0..1" Asset : references
    Clip "1" --> "*" Effect
    Clip "1" --> "0..2" Transition
    Clip "1" --> "*" Keyframe
```

Clips point at assets by id and carry only ranges and parameters, which keeps editing non-destructive.

## 25.5 Preview-rendering flow

```mermaid
sequenceDiagram
    participant Clock as Playback clock (audio)
    participant Sched as Frame scheduler
    participant Dec as Decoder workers
    participant Cache as Frame cache
    participant Rend as Renderer
    participant UI as Preview surface
    Clock->>Sched: current time t
    Sched->>Cache: frame for t?
    alt hit
        Cache-->>Rend: decoded sources
    else miss
        Sched->>Dec: request decode (t, lookahead)
        Dec-->>Cache: frames
        Cache-->>Rend: decoded sources
    end
    Rend->>Rend: transform, effects, composite (preview quality)
    Rend-->>UI: present frame
    Note over Sched,UI: late frames are dropped; audio is never stalled
```

The audio clock leads; video adapts. Lookahead keeps decoders ahead of the clock.

## 25.6 Final-export flow

```mermaid
flowchart TD
    A[Start export] --> B[Snapshot project]
    B --> C[Validate settings vs encoder capability and disk space]
    C --> D[Loop frames 0..N-1]
    D --> E[render_frame at full quality]
    E --> F[Convert pixel format]
    F --> G[Video encoder]
    D --> H[Audio mix block]
    H --> I[Audio encoder]
    G --> J[Muxer]
    I --> J
    J --> K{More frames?}
    K -->|yes| D
    K -->|no| L[Flush, finalize container, verify]
    L --> M[Rename temp to final]
    D -. cancel .-> X[Cleanup temp]
```

Cancellation is checked in the loop; success is reported only after verification and rename.

## 25.7 Project save and recovery

```mermaid
flowchart TD
    A[Edit commands] --> B[Dirty]
    B -->|timer| C[Autosave to recovery location]
    B -->|user save| D[Serialize snapshot]
    D --> E[Write temp, flush, validate]
    E -->|ok| F[Backup old, atomic replace]
    E -->|fail| G[Keep original, show error]
    H[App start] --> I{Clean-shutdown marker?}
    I -->|no and recovery newer| J[Offer recover / discard]
    I -->|yes| K[Open normally]
    L[Open project] --> M{Parse ok?}
    M -->|no| N[Try backup, then autosave]
    M -->|yes| O[Migrate, validate, resolve assets]
```

The user's file is never overwritten by autosave, and a failed save never destroys the previous version.

## 25.8 Undo and redo

```mermaid
stateDiagram-v2
    [*] --> Clean
    Clean --> Dirty: execute command
    Dirty --> Dirty: execute / undo / redo
    Dirty --> Clean: save (saved_index = index)
    Dirty --> Clean: undo or redo returns index to saved_index
    note right of Dirty: new command after undo truncates redo tail
```

History is session data; the dirty flag compares the current history index with the index at the last save.

## 25.9 Background task execution

```mermaid
stateDiagram-v2
    [*] --> Queued
    Queued --> Running: worker available
    Running --> Succeeded
    Running --> Failed: error
    Running --> Cancelled: token set
    Queued --> Cancelled: no longer needed
    Failed --> Queued: retry (limited)
    Succeeded --> [*]
    Cancelled --> [*]
    Failed --> [*]
```

Priority orders the queue; visible-on-screen work runs first; cancelled jobs clean up and report state to the UI.

## 25.10 Typical edit session

```mermaid
flowchart LR
    A[Create project] --> B[Import media]
    B --> C[Add to timeline]
    C --> D[Trim, split, arrange]
    D --> E[Text, audio, effects, keyframes]
    E --> F[Preview]
    F -->|adjust| D
    F --> G[Save]
    G --> H[Export]
    H --> I[Verify output]
```

The loop between editing and preview dominates; save is continuous (autosave) and export is a terminal, snapshot-based step.

## 25.11 Source media, project data, preview output, caches, rendered output

```mermaid
flowchart LR
    SRC[(Source media: read only)] --> PROBE[Probe]
    PROBE --> PROJ[(Project file: references and edits)]
    SRC --> DEC[Decode]
    DEC --> FC[(Frame cache)]
    SRC --> DER[(Derived: thumbs, peaks, proxies)]
    PROJ --> EVAL[Evaluate]
    FC --> EVAL
    DER --> EVAL
    EVAL --> PREV[Preview pixels and audio: transient]
    EVAL --> EXPORT[Export render]
    SRC --> EXPORT
    EXPORT --> OUT[(Exported video)]
```

Only the project file and exported video are user-facing artifacts besides the sources. Caches and preview output are rebuildable. Export reads original sources, not proxies.

## 25.12 Layered compositing pipeline example

```mermaid
flowchart TD
    BG[Background color] --> L1
    V1[Track 1 clip: decode, effects, transform] --> L1[Blend layer 1]
    L1 --> L2[Blend layer 2]
    V2[Track 2 clip: decode, effects, transform, opacity 0.8] --> L2
    L2 --> L3[Blend layer 3]
    V3[Track 3 overlay: PNG with alpha, multiply] --> L3
    L3 --> L4[Blend text layer]
    T[Text render] --> L4
    L4 --> ADJ[Adjustment layer: color grade over everything below]
    ADJ --> OUT[Output frame]
```

Layers composite bottom to top; an adjustment layer applies its effect to the accumulated image. Each node is evaluated at the frame's time with exact time arithmetic.

## What a Future Coding Agent Must Understand

- Diagrams express dependencies: model at the center, one evaluation path for preview and export, disposable caches, snapshot-based export and save.
- State machines (jobs, history, save) prevent impossible states.
- These are design models, not CapCut internals.
- **Related:** Chapters 5, 7, 8, 9, 15, 16, 22-24.
