# Chapter 26: Glossary and Reference Tables

**Draft v1, 25 October 2026.** Definitions are **[GENERAL]**. Where a term is used differently by vendors, the book's usage is stated.

---

## 26.1 Glossary

| Term | Definition |
|---|---|
| Alpha channel | Per-pixel opacity value stored beside color; 0 transparent, 1 opaque. Straight vs premultiplied conventions exist |
| Audio synchronization | Keeping audio and video aligned in time during playback and in exports |
| Autosave | Periodic saving of recoverable state to a recovery location, separate from the user's saved project |
| Background worker | Thread or process that performs work off the UI thread (probing, thumbnails, export) |
| Bitrate | Data per second of a stream (bits/s); higher usually means higher quality and larger files |
| Cache | Rebuildable derived data stored for speed (thumbnails, peaks, frames, proxies) |
| Clip | A timeline item referencing a range of source media (or generated content) with placement and properties |
| Codec | Algorithm pair that compresses and decompresses audio or video (H.264, HEVC, AV1, AAC) |
| Color space | Definition of how numeric values map to colors: primaries, white point, transfer function |
| Compositing | Combining multiple image layers into one frame using alpha and blend modes |
| Container | File format holding streams and metadata (MP4, MOV, MKV) |
| Decoding | Turning compressed data into raw frames or audio samples |
| Effect | Processing that changes the appearance of a clip or layer (blur, glow, distortion) |
| Encoding | Compressing raw frames or samples into a codec bitstream |
| Filter | In this book: a look/color preset or filtering operation; vendors use "filter" and "effect" loosely |
| Frame rate | Frames per second; stored as a rational number (e.g., 30000/1001) |
| GPU | Graphics processing unit; parallel processor used for rendering and sometimes codecs |
| Hardware acceleration | Using dedicated silicon (GPU, video engine) for decoding, encoding, or processing |
| Interpolation | Computing values between keyframes (linear, ease, Bezier, hold) |
| Keyframe (animation) | A stored property value at a time, used to animate that property |
| Keyframe (codec) | A self-contained compressed frame (I-frame) from which decoding can start |
| LUT | Lookup table mapping input colors to output colors (1D or 3D) |
| Media relinking | Reconnecting project assets to files that moved or were renamed |
| Muxing | Interleaving encoded streams into a container (demuxing is the reverse) |
| Non-linear editing (NLE) | Editing by arranging references to source media on a multi-track timeline, non-destructively |
| Playhead | Current time indicator on the timeline; defines the previewed frame |
| Project serialization | Converting in-memory project data to a stored file format and back |
| Proxy | Lower-cost stand-in copy of media used for smoother preview; export uses originals |
| Render graph | Directed graph of processing nodes (sources, effects, composites, outputs) evaluated to produce frames |
| Rendering | Producing final pixels (and audio) from project data, for preview or export |
| Source media | Original imported files; never modified by editing |
| Thumbnail | Small preview image of a frame, cached for UI |
| Timecode | Label for a frame position: hours:minutes:seconds:frames (drop-frame variants exist) |
| Timeline | The time-based arrangement of tracks and clips |
| Track | Horizontal lane of the timeline holding clips of a kind (video, audio, text, subtitle) |
| Transition | Change from one clip to the next over a duration (dissolve, wipe, slide) |
| Undo stack | Session history of commands that can be reverted and reapplied |
| Variable frame rate (VFR) | Video whose frame spacing varies; common in screen recordings and phone video |
| Waveform | Visual summary of audio amplitude over time, derived from sample peaks |

## 26.2 Important distinctions

| Pair | Distinction |
|---|---|
| Codec vs container | The codec compresses the data; the container packages streams and metadata. A container can hold several codecs |
| Project file vs exported video | The project stores edit instructions and references; the export is a rendered, flattened result with no editing information |
| Source-media time vs timeline time | Source time is a position in the original file; timeline time is a position on the project timeline. A clip maps one to the other via `source_in`, `timeline_start`, and speed |
| Preview rendering vs final rendering | Preview prioritizes speed (reduced quality, proxies, dropped frames); final render prioritizes exactness and completeness from original media |
| Effect vs transition | An effect modifies one layer's appearance; a transition blends two clips across a cut |
| Keyframe animation vs encoded-video keyframes | Animation keyframes are user-defined property values in the project; codec keyframes are decoding entry points inside a compressed stream |
| Temporary cache vs permanent media | Caches are disposable and rebuildable; source media and project files are the user's data |
| GUI framework vs media engine | The framework builds windows and widgets; the media engine decodes, composites, encodes, and plays. Neither replaces the other |
| Local processing vs cloud processing | Local runs on the user's machine (private, offline, hardware-limited); cloud runs on remote servers (needs network, account, may cost, data leaves the device) |
| Undo history vs saved project data | Undo history is session-only command records; saved project data is the persistent document state |

## 26.3 Evidence-label reference

| Label | Meaning |
|---|---|
| OFFICIAL | Stated on a CapCut-owned page |
| SECONDARY | Third-party description, unconfirmed |
| OBSERVED | Seen in a cited demonstration |
| GENERAL | Established general knowledge |
| PROPOSED | Suggested design for an original editor |
| UNKNOWN | Not verified |

## 26.4 Common unit conversions used in this book

| Quantity | Value |
|---|---|
| 1 byte | 8 bits |
| Uncompressed 1080p 8-bit RGBA frame | about 8.3 MB |
| Uncompressed 4K 8-bit RGBA frame | about 33 MB |
| -6 dB | about 0.5 linear gain |
| 30000/1001 fps | about 29.97 fps |
| Export size estimate | `(video + audio bitrate) * seconds / 8` bytes |

## What a Future Coding Agent Must Understand

- Use the distinctions table to keep identifiers and code names separate (for example, never call codec keyframes and animation keyframes by one name).
- Vendor terminology is loose; define internal terms by data shape.
- **Related:** all chapters.
