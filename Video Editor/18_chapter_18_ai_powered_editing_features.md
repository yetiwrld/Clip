# Chapter 18: AI-Powered Editing Features

**Draft v1, 25 October 2026.** Sources:

- **[S8]** CapCut, "How to Use CapCut on PC & Mac", https://www.capcut.com/resource/how-to-use-capcut-on-pc , dated 10 Oct 2026, accessed 25 Oct 2026 **[OFFICIAL]**. Lists AI features and steps.
- **[A]** CapCut Help, "Why Aren't Auto Captions Working in CapCut?", https://www.capcut.com/help/auto-captions , accessed 25 Oct 2026 **[OFFICIAL]**. States that auto captions rely on speech recognition and cloud processing, that a slow or unstable connection can interrupt caption generation, and that silent/missing audio prevents captions.
- **[P]** CapCut Help, "Is CapCut AI Safe to Use?", https://www.capcut.com/help/is-capcut-ai-safe-to-use , accessed 25 Oct 2026 **[OFFICIAL]**. Says AI tools may process text, images, video, or audio depending on the feature; users should review uploaded/processed/saved/shared handling, and avoid uploading sensitive or confidential content unless comfortable. Gives no per-feature processing location.
- **[T]** Third-party commentary on CapCut's terms (podcastle.ai, async.com), accessed 25 Oct 2026 **[SECONDARY, competitors with commercial interest]**: claims that content uploaded to CapCut cloud services is covered by a broad license while offline drafts never synced are not. **Unverified; read CapCut's Terms of Service and Privacy Policy directly before relying on it.**

I could not read CapCut's Terms or Privacy Policy. The page at opencut.app that appeared in search is a **different product** and is not used here.

---

## 18.1 Feature inventory (what official pages name)

| Feature | Where named | What S8 says | Local or remote |
|---|---|---|---|
| Auto captions | Captions > Auto captions; choose language; Generate | Creates synced captions | **Remote/cloud processing [OFFICIAL, A]** |
| Speech recognition / transcription | Tool pages in site navigation (no desktop steps read) | Named as a product tool | UNKNOWN |
| Text to speech | Text > Add text > Text to speech > voice style > Generate speech | AI narration | UNKNOWN (voice generation commonly server-side) |
| AI writer | Text area | Generates scripts | UNKNOWN |
| Voice changer / filters | Audio > Voice changer > Voice filters (Micro, Low, High, Sweet, Flashback) | Alters voice | UNKNOWN |
| Reduce noise / Enhance voice | Site navigation lists these tools | Named only | UNKNOWN |
| Auto cutout (background removal), chroma key | Feature list | One-click removal | UNKNOWN |
| Auto reframe | Video > Basic > Auto reframe; pick aspect ratios | Keeps main content centered | UNKNOWN |
| AI video (text to video, image to video) | AI media > AI video; choose model (examples named: Seedance 1.0, Runway), duration, aspect ratio, Generate | Generates video from prompt or image | Generation by named models; execution location UNKNOWN but model-based generation is typically remote |
| AI video maker (Instant AI video) | Start screen; style, aspect ratio, script, voice style, duration, Create | Builds a video from a script; editor with Scenes, Media, Voiceover, Elements, Music | UNKNOWN |
| AI design, upscale, remove background (images) | Start screen AI design | Image generation/editing | UNKNOWN |
| AI-model branding | S8 text names several third-party and in-house model names for AI video and image features | | Do not treat as verified specifics; names change rapidly |
| Motion tracking, stabilization, smart search | Mentioned by third parties only | | UNKNOWN |

Pricing/plan: S8 says upgrading to Pro+ unlocks more advanced features; which AI features are gated or credit-limited is UNKNOWN here.

## 18.2 Per-feature template (filled where evidence exists)

### Auto captions
1. **Problem:** typing subtitles manually.
2. **Interface/flow [OFFICIAL, S8]:** Captions > Auto captions > select the video's language > Generate; styled caption templates available.
3. **Inputs:** timeline audio (must not be silent [A]), language selection.
4. **Outputs:** synced caption items on the timeline.
5. **Dependencies [OFFICIAL, A]:** cloud processing; needs a stable connection; account/subscription requirements UNKNOWN.
6. **Privacy/cost:** audio is processed remotely, so audio content leaves the device; exact retention UNKNOWN; consult the Privacy Policy [P].
7. **Failure cases [A]:** no audio, wrong language selected, network problems, old app versions.
8. **General mechanism:** Chapter 12, 12.7.
9. **Local alternatives:** open speech-recognition models run through a local inference runtime; accuracy, model size, and language coverage vary (not benchmarked here).
10. **Hardware:** on the target PC (Chapter 20) local recognition would use CPU or iGPU; throughput unmeasured.

### Text to speech, voice changer, noise reduction
Inputs: text or audio; outputs: audio clips. Mechanisms: neural TTS, voice conversion, DSP or model denoising (Chapter 13, 13.10). Location UNKNOWN. Local alternatives exist but quality/voice licensing varies.

### Background removal, auto reframe, tracking
Mechanisms: per-frame segmentation with temporal smoothing; subject detection plus smoothed crop path (keyframes); feature tracking (Chapters 10, 11). Location UNKNOWN. These can run locally on GPU/CPU at reduced speed; segmentation at 1080p on an integrated GPU should be tested, not assumed.

### Generative video/image and AI video maker
Mechanism: large generative models; compute-heavy; commonly cloud-hosted; may consume credits and carry usage terms and content policies. Execution location for CapCut is UNKNOWN from the pages read, but running such models locally on the target hardware would be impractical for current large video models (qualitative judgment, not a measurement). Treat as service integrations.

## 18.3 Rules for an original editor [PROPOSED]

- Never imply a feature is local because it appears in a local window. Surface a visible "processed online" notice and a network/data-use disclosure.
- Put each AI feature behind a provider interface: `run(input, options) -> job`, with local and remote implementations, capability detection, progress, cancellation, retry, and error mapping.
- Store results as ordinary editable data (captions, keyframes, masks, audio clips, generated media assets) plus provenance (feature, version, parameters), so projects remain usable offline.
- Offline mode: AI controls disabled with a reason, not hidden.
- Consent: ask before the first upload; allow per-feature opt-out; avoid uploading more than needed (extract mono audio, not the whole video).
- Cost and quota: show credits or limits before running.
- Safety/IP: generated media can have usage restrictions; record provenance.
- Failure handling: network loss mid-job should resume or fail cleanly without changing the project.

## 18.4 Verified vs unverified summary

| Claim | Status |
|---|---|
| Auto captions use cloud processing | **Official (A)** |
| Other AI features' processing location | **Unknown** |
| Specific model/server architecture | **Unknown; do not invent** |
| Terms licensing details | **Unverified third-party claims (T)** |
| Feature plan gating | **Unknown** |

## What a Future Coding Agent Must Understand

- Official evidence shows at least one headline AI feature (auto captions) depends on cloud processing; assume AI features may be online until shown otherwise.
- Architect AI as optional, replaceable providers producing normal editable data.
- Privacy, consent, and cost are product requirements, not afterthoughts.
- Do not rely on named third-party models; they change.
- **Verified:** caption cloud dependence; feature names and flows at label level. **Related:** Chapters 12, 13, 14, 19, 20, 22.
