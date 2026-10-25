# Chapter 6: Video Editing Fundamentals

**Draft v1, 25 October 2026.** Mostly **[GENERAL]** knowledge. The only fetched citation so far is FFmpeg's library overview (https://ffmpeg.org/doxygen/0.10/index.html, FFmpeg project, accessed 25 Oct 2026). Standards-body citations (ITU-R BT.709, ISO/IEC 14496, etc.) are still to be added. Nothing here is a claim about CapCut's internals.

Each concept: simple explanation, engineering explanation, example, relevance to an editor.

---

## 6.1 Frames and frame rates

- **Simple:** video is a rapid sequence of still pictures. Frame rate is how many appear per second (fps).
- **Engineering:** common rates are 24, 25, 30, 50, 60 and the NTSC-derived fractional rates 24000/1001, 30000/1001, 60000/1001. Fractional rates must be stored as **rational numbers**, never as floats, or timing drifts.
- **Example:** 30000/1001 is about 29.97 fps. Over one hour, treating it as exactly 30 produces a drift of about 3.6 seconds.
- **Editor relevance:** the project has one frame rate; clips may have others. Every conversion rule (drop, duplicate, blend) must be explicit.

## 6.2 Timecodes and frame-based timing

- **Simple:** timecode labels a frame as hours:minutes:seconds:frames.
- **Engineering:** internal time should be an exact rational or integer count (for example, ticks of 1/90000 s or frame index plus rate), not floating-point seconds. Display timecode is derived. Drop-frame timecode (29.97) skips frame *numbers* (not frames) to keep the label close to wall-clock time.
- **Example:** frame 1800 at 30 fps displays 00:01:00:00. At 29.97 non-drop it would be about 1 minute 0.06 seconds of real time.
- **Editor relevance:** edits must land on frame boundaries; see Chapter 8.

## 6.3 Resolution, aspect ratio, pixel aspect ratio, orientation

- **Simple:** resolution is pixel width by height. Aspect ratio is width divided by height (16:9, 9:16, 1:1).
- **Engineering:** *Pixel aspect ratio* (PAR) says whether pixels are square. Anamorphic sources have non-square pixels, so display width = stored width multiplied by PAR. Phones often store frames unrotated plus a **rotation flag** in metadata.
- **Example:** a portrait phone clip may be stored as 1920x1080 with a 90-degree rotation tag and displays as 1080x1920.
- **Editor relevance:** probing must read rotation and PAR, or clips appear sideways or stretched.

## 6.4 Progressive vs interlaced

- **Simple:** progressive stores whole frames; interlaced stores two half-height *fields* captured at different instants.
- **Engineering:** interlaced material needs deinterlacing before scaling or compositing, or combing artifacts appear.
- **Editor relevance:** flag the field order on import; offer deinterlace. Low priority for a first version.

## 6.5 Containers vs codecs

- **Simple:** the container is the box; the codec is how the contents are compressed.
- **Engineering:** a container (MP4, MOV, MKV) holds multiple streams plus timing and metadata. A codec (H.264, HEVC, AV1, AAC) defines the compressed bitstream. FFmpeg separates these roles: libavformat handles I/O and muxing/demuxing, libavcodec handles encoding/decoding [OFFICIAL FFmpeg docs, URL above].
- **Example:** `.mp4` with H.264 video and AAC audio is the most widely compatible combination. `.mkv` can hold nearly anything but is poorly supported by some players.
- **Editor relevance:** import errors can come from either layer (container unreadable vs codec unsupported); report them differently.

## 6.6 Compression, bitrate, quality

- **Simple:** compression discards data the eye is least likely to miss.
- **Engineering:** *Intra* frames (I) are standalone; *predicted* frames (P, B) store differences. Bitrate (bits/second) controls size. Rate control modes: constant bitrate (CBR), variable (VBR), constant quality (CRF/QP style).
- **Example:** 10 Mbit/s for 60 s is about 75 MB of video.
- **Editor relevance:** export UI should offer a quality preset and a target-size mode; see Chapter 15.

## 6.7 Constant vs variable frame rate

- **Simple:** CFR delivers frames at fixed intervals; VFR varies interval by frame.
- **Engineering:** screen recordings and many phone videos are VFR. Treating VFR as CFR causes audio drift. Editors typically either remap to CFR at import (on the fly or via conversion) or schedule frames using per-frame timestamps.
- **Editor relevance:** a top source of "audio out of sync" bug reports. Test with VFR media (Chapter 21).

## 6.8 Codec keyframes vs animation keyframes

| | Codec keyframe (I-frame / IDR) | Animation keyframe |
|---|---|---|
| Lives in | Compressed video stream | Project file |
| Purpose | Random-access and decoding start point | A property value at a time |
| Created by | Encoder | User |
| Effect on editing | Seeking must decode from the previous one | Interpolated to animate |

Never use one word for both in code.

## 6.9 Long-GOP and seeking

- **Engineering:** in long-GOP codecs (H.264/HEVC typical), exact seeking means jumping to the previous I-frame then decoding forward. Frame-exact scrubbing costs CPU time proportional to the GOP distance.
- **Editor relevance:** motivates frame caches and proxy/intra-only media (Chapters 7 and 9).

## 6.10 Audio basics

- **Sample rate:** commonly 44,100 or 48,000 Hz. Video work standardizes on 48 kHz.
- **Bit depth:** 16, 24, or 32-bit float. Mixing should use float to avoid internal clipping.
- **Channels:** mono, stereo, 5.1.
- **Synchronization:** audio is typically the master clock during playback; video frames are chosen to match the audio position (Chapter 9).
- **Resampling:** libswresample handles resampling, format conversion, and mixing in FFmpeg [OFFICIAL FFmpeg docs index].

## 6.11 Color spaces, primaries, range

- **Simple:** how numeric pixel values map to colors.
- **Engineering:** YCbCr (luma plus chroma) is used by video codecs, often with **chroma subsampling** (4:2:0 halves chroma resolution in each direction). RGB is used for compositing. Conversion needs the right *matrix* (BT.601 vs BT.709), *range* (limited 16-235 vs full 0-255), and *transfer function*. Wrong choices cause washed-out or crushed images.
- **Editor relevance:** libswscale does color conversion and scaling in FFmpeg [OFFICIAL FFmpeg docs index]. A first version can assume BT.709 SDR and document the assumption; HDR is a separate project.

## 6.12 Alpha, images, sequences

- **Alpha:** per-pixel opacity. Straight (unassociated) vs premultiplied alpha behave differently under blending; pick one internal convention.
- **Still images:** have no inherent duration; the editor assigns one.
- **Image sequences:** numbered files treated as frames at a user-chosen rate.

## 6.13 Metadata

Probe: duration, stream list, per-stream codec, resolution, frame rate (average and real), rotation, color tags, audio rate and channels, creation time. Keep both **container duration** and **stream duration**; they can differ.

## 6.14 Common formats

| Format | Role | Notes |
|---|---|---|
| MP4 / MOV | Containers | MOV is Apple-origin; both ISO-BMFF family |
| MKV | Container | Flexible, less universal playback |
| H.264/AVC | Video codec | Widest decoding support |
| H.265/HEVC | Video codec | Better compression; hardware support and licensing vary |
| AV1 | Video codec | Royalty-free; decode cost high without hardware support |
| AAC | Audio codec | Typical in MP4 |
| WAV | Audio container, usually PCM | Uncompressed; good for editing |

Codec support in the OS and GPU varies by installed drivers and Windows components; verify per machine (Chapter 20).

## 6.15 Communicating incompatibility

A professional editor should tell users: which stream failed, why (container, codec, DRM, corruption), and what to do (convert, install a codec, relink). Avoid a generic "import failed".

## What a Future Coding Agent Must Understand

- Time must be exact (rational/integer), never float seconds.
- Probe rotation, PAR, VFR, color tags, and audio layout at import.
- Codec keyframes and animation keyframes are unrelated; name them differently.
- Seeking cost in long-GOP media drives the cache and proxy design.
- Decide an internal pixel format and alpha convention early.
- **Verified:** only FFmpeg's library division of labor. Standards citations still outstanding.
- **Read next:** Chapters 7, 8, 9, 15.
