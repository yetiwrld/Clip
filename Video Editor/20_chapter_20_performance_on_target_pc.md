# Chapter 20: Performance and Resource Management on the Target PC

**Draft v1, 25 October 2026.** **[GENERAL]** and **[PROPOSED]**, applied to your stated hardware. No benchmark was run; **no performance numbers for your PC are claimed**.

## 20.1 Target machine

| Item | Value | Source |
|---|---|---|
| OS | Windows 11 Pro 64-bit | [stated by user] |
| CPU | AMD Ryzen 5 4600U | [stated by user] |
| CPU details | Zen 2 "Renoir", 6 cores / 12 threads, 2.1 GHz base, up to 4 GHz turbo, 7 nm, TDP 15 W default and vendor-configurable 10-25 W | [SECONDARY: notebookcheck.net, https://www.notebookcheck.net/AMD-Ryzen-5-4600U-Laptop-Processor-Benchmarks-and-Specs.449977.0.html, accessed 25 Oct 2026] |
| Integrated GPU | Radeon Graphics; secondary sources identify it as Radeon RX Vega 6 with 6 compute units, up to about 1500 MHz | [SECONDARY: same page] |
| Memory controller | Dual-channel DDR4-3200 or LPDDR4-4266 supported by the chip; the memory actually installed in your laptop is **[UNKNOWN]** | [SECONDARY: same page] |
| Memory bandwidth | One aggregator lists about 51 GB/s; depends on installed memory and configuration | [SECONDARY: cpu-monkey.com, https://www.cpu-monkey.com/en/cpu-amd_ryzen_5_4600u, accessed 25 Oct 2026] |
| RAM | 16 GB | [stated by user] |
| Storage | about 1.14 TB; SSD vs HDD **[UNKNOWN]** | [stated by user] |

Important consequences:

- This is a **15 W-class thin-and-light laptop chip**. Sustained loads (export) may reduce clocks as the chip reaches thermal and power limits; results depend on the laptop's cooling and power profile (battery vs plugged in).
- The GPU **shares system RAM** with the CPU. There is no separate video memory; GPU work competes for the same memory bandwidth as decoding and caches.
- Hardware video decode/encode support on this GPU generation for specific codecs, profiles, and bit depths is **[UNKNOWN]**: not verified from AMD documentation yet. Check AMD's official specification and test with real files before designing around it. For example, whether AV1 or 10-bit HEVC decodes in hardware must be tested.

## 20.2 What is likely CPU-bound vs GPU-bound

| Operation | Likely limiter | Notes |
|---|---|---|
| Software H.264/HEVC decode | CPU | 4K HEVC can be demanding |
| Hardware decode (if available) | Fixed-function block + memory bandwidth | Fast, low CPU |
| Seeking in long-GOP | CPU + disk | Decodes from previous I-frame |
| Compositing with effects | GPU (if implemented on GPU) or CPU | Memory bandwidth on shared memory |
| Large blur, scaling | GPU/CPU | Bandwidth-heavy |
| Software encoding (x264/x265-class) | CPU, scales with cores | Heat and clock limits |
| Hardware encoding (if available) | Fixed-function block | Usually lower efficiency per bit |
| Thumbnail/waveform generation | CPU + disk | Background priority |
| AI features run locally | CPU/GPU, large memory | Model size matters |
| Project save/load | Disk, serialization | Usually small |

## 20.3 Memory budget

16 GB total, shared with Windows (several GB), other apps, browser tabs, and the iGPU. Planning figure: reserve a modest application budget, for example a few GB for caches, adjustable by the user, and measure real use.

Frame sizes (Chapter 9): 1080p 8-bit RGBA about 8.3 MB; 4K 8-bit RGBA about 33 MB; 16-bit float doubles that.

| Cache | Example sizing idea |
|---|---|
| Decoded-frame cache | A few hundred MB at preview resolution; bound by bytes |
| Thumbnail cache | Small images; disk-backed with memory LRU |
| Waveform peaks | Tiny relative to audio data |
| Render/preview cache | Disk-backed, size-capped, LRU |

All caches: size limit, eviction policy, clear command, and no unbounded growth over long sessions.

## 20.4 Storage

- Source media on SSD allows fast seeking; on an HDD, concurrent decodes of several clips cause seek thrashing.
- Caches and proxies belong on the fastest local drive; give the user a setting for cache location.
- Estimate temporary disk use: proxies (small), render cache (large), export temp (one output size).
- External or network drives: slow and possibly absent; treat accordingly (Chapter 7).

## 20.5 Techniques to reduce load

| Technique | Benefit | Compromise | User control |
|---|---|---|---|
| Preview at 1/2 or 1/4 resolution | Big CPU/GPU/memory saving | Softer preview | Preview quality setting |
| Proxy media | Smooth 4K/long-GOP editing | Disk use, generation time, slightly different look | Toggle, build on demand |
| Optimized (intra-frame) media | Faster seeking | Large files | Per-asset option |
| Frame/render cache | Smoother repeat playback | Memory/disk, invalidation complexity | Cache size, clear |
| Skip heavy effects during playback | Keeps frame rate | Preview less faithful | "Effects quality" toggle |
| Limit worker concurrency | UI stays responsive | Slower background jobs | Performance setting |
| Lower priority for background jobs | Playback prioritized | Jobs finish later | Automatic |
| Hardware decode/encode | Lower CPU and heat | Compatibility, sometimes lower quality/bit | On/off toggle |
| Pause background work during playback/export | Frees resources | Delays | Automatic with indicator |
| Adaptive frame dropping | Keeps audio in sync | Visible stutter | Automatic |
| Process isolation for export | Memory returned on exit | IPC complexity | None |

## 20.6 Responsiveness while rendering

- Run export off the UI thread/process; update progress at a limited rate (a few times per second).
- Offer "pause" and "cancel".
- Warn about export on battery; consider a lower-power option.
- Detect thermal throttling indirectly (frame time rises) and report honestly rather than guess.

## 20.7 Resource hygiene

- Memory leaks: track allocation per subsystem in debug builds; long-session soak tests (Chapter 21).
- Release decoder, GPU, and file handles promptly when assets leave use; closing a project must free everything.
- Cancel outstanding jobs on project close.
- GPU resource lifetime: free textures/buffers when no longer referenced; handle device-lost.

## 20.8 Measurement plan (to be run later by the implementer)

Measure on the actual PC, plugged in and on battery:

| Test | Metric |
|---|---|
| Play 1080p H.264 single clip | Dropped frames, CPU%, GPU%, RAM |
| Play 4K H.264 and 4K HEVC (software and hardware decode) | Same |
| Scrub a 4K long-GOP clip | Time to exact frame |
| 3-layer composite with blur | Preview FPS at each preview scale |
| Timeline with 500 clips | UI frame time while zooming/scrolling |
| Export 5 min 1080p (software vs hardware encode) | Wall-clock time, temperature behavior, file size |
| Idle after 2-hour session | Memory growth |
| Import 1000 files | Time to usable UI, memory |

Do not use any figure from outside the PC as a prediction for it.

## 20.9 Realistic design stance

On a 6-core, 15 W, shared-memory machine, an early editor should: favor preview scaling and proxies by default for large media, keep effects light and optional, make hardware acceleration opt-in with fallbacks, bound caches by bytes, and show progress for everything that takes time. Whether specific 4K workloads are comfortable is **[UNKNOWN]** until measured.

## What a Future Coding Agent Must Understand

- The hardware is a modest laptop-class APU: thermal limits and shared memory shape every performance decision.
- Hardware codec support on this GPU is unverified: detect at runtime; keep software fallbacks.
- Budget memory and disk by bytes; offer user controls; never grow caches unbounded.
- Proxies, preview scaling, and effect-quality toggles are first-class features, not extras.
- Measure on the real machine with the plan above before fixing any target.
- **Verified:** CPU/iGPU description from secondary hardware sites only. No codec-support or performance data verified.
- **Related:** Chapters 7, 9, 11, 15, 19, 21.
