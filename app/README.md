# Clipwright Studio

**Version v0.0.4** — a local-first AI video clipping & content repurposing studio.

Clipwright Studio turns long-form video (podcasts, interviews, lectures,
webinars, talking-head recordings) into polished short-form vertical clips —
with transcription, AI-assisted clip discovery, performance audit estimates,
captioning, local speaker diarization, non-destructive audio restoration, a
clip editor, and local FFmpeg rendering.

- **Local-first**: your media stays on your machine. Nothing is uploaded
  unless you explicitly configure and choose an external AI provider. Cloud
  transcription sends the audio it needs; cloud analysis sends transcript text.
  The source video is not uploaded automatically.
- **Modular providers**: transcription (local faster-whisper, OpenAI-compatible
  cloud, SRT/VTT/JSON import) and analysis (any OpenAI-compatible endpoint,
  Anthropic, or a built-in offline heuristic analyzer) are pluggable.
- **You stay in control**: the AI recommends moments and explains why; every
  clip, caption, crop and metadata field remains editable. Transcript speaker
  groups can be renamed/corrected, and voice cleanup has non-destructive
  presets with a before/after audio sample.
- **Low-data URL clipping**: on a project's Source tab, either download a
  selected time range or choose **Download audio only**. Transcribe that audio
  locally, discover timestamped moments, then fetch only a selected video's
  section. The fetched section becomes a child project with local timestamps,
  preview, editing, and rendering. Audio still transfers; URL/range support
  varies, some sources need keyframe padding, and a range may fail. These modes
  never silently fall back to a full-video download; the explicit full-video
  option remains available.

## Install on Windows (end-user installer)

A Windows 10/11 x64 installer is built by the repository's **Windows installer** GitHub Actions workflow whenever the source archive changes. From the latest successful workflow run, download the `Clipwright-Studio-Windows-x64-unsigned` artifact, extract it, and double-click the included `Clipwright Studio-<version>-setup-x64.exe`. The installer includes the Electron runtime, app dependencies, FFmpeg/FFprobe, caption fonts, and helper scripts; end users do **not** need Node.js, npm, or terminal commands to install or run the desktop app.

Download the installer from the latest successful **Windows installer** run in the repository's Actions tab. GitHub Actions retains each artifact for 30 days.

The installer is unsigned because no code-signing certificate is configured. Windows may show an unknown-publisher or SmartScreen warning. Only install a build downloaded from the trusted project repository. Uninstalling the app leaves the workspace and project data intact.

### Automatic updates

Packaged Windows builds check for updates from GitHub Releases after startup.
When a newer version is available, Clipwright asks before downloading, shows
progress, then offers **Restart and install** or **Later**. Development builds,
other platforms, and the browser preview do not check for updates. The existing
v0.0.1 installer does not contain updater code, so it must be manually replaced
with an updater-enabled v0.0.2 (or later) build; later releases can update in-app.

A release is published by pushing a tag matching the package version (for
example, `v0.0.4`). The **Publish Windows release** workflow builds the NSIS
installer and uploads its `latest.yml` and blockmap alongside it. Unsigned
updates remain subject to Windows' unknown-publisher/SmartScreen warnings.

The [v0.0.4 GitHub Release](https://github.com/yetiwrld/Clip/releases/tag/v0.0.4)
contains this low-data feature plus the installer and update metadata. Launch an
updater-enabled v0.0.2 or v0.0.3 Windows install while online and approve the
v0.0.4 prompt. Existing v0.0.1 installs still need one manual install of an
updater-enabled build first. Actions artifacts are for manual installation,
not the in-app feed. The download/restart/install cycle has not yet been
verified on a Windows machine.

Local faster-whisper transcription is optional and requires Python plus the `faster-whisper` package; transcript import and cloud transcription do not need that setup. Optional local speaker grouping requires Python plus `resemblyzer` (`python -m pip install resemblyzer`). Its model weights may download once on first use; afterward speaker analysis stays on-device. The app never sends audio to a cloud service for speaker grouping.

On first launch, a short welcome screen covers the workflow (import a video, find
the moments, edit and render) and offers the ways in that actually exist: start a
new project, import a video, open an existing project, or take an optional guided
tour. **Skip intro** and **Start creating** both go straight into the app; no
setup step is required. The FFmpeg/FFprobe setup check lives behind **Check
setup** on that screen, in **Settings → Advanced**, and on the **Help** screen,
which also has getting started, the shortcut list, common questions,
troubleshooting and the app version. The tour can be replayed from Help or from
the command palette (`Ctrl/⌘ K` → “Take the guided tour”).

Interface effects — the slow backdrop wash, the live status pulse and the job
activity graph — can be turned off in **Settings → Advanced → Ambient visual
effects**. Progress bars, spinners and status text are not affected, and the
operating system's reduce-motion setting always wins.

## Run on Windows (development version)

The repository ZIP contains the **source code**, not the installer. Developers can run the app on Windows 10/11 x64 with these steps.

1. Install **Node.js 22 LTS** from [nodejs.org](https://nodejs.org/). Node.js 20+
   is supported; Node 22 is the tested/recommended version. The installer also
   installs npm and adds both commands to `PATH`.
2. Download `AIClipping-code-for-AI.zip` from the repository and use File
   Explorer's **Extract All…** option. Extract it to a normal writable folder,
   for example `C:\ClipwrightStudio` (not inside `Program Files`).
3. Open PowerShell in that extracted folder. Confirm that `package.json` is in
   the current directory, then run:

   ```powershell
   node --version
   npm --version
   npm ci
   npm run dev
   ```

   `npm ci` installs the locked dependencies, including Electron and the
   FFmpeg/FFprobe packages. The first install needs an internet connection.
   Electron 44 downloads its platform binary separately; `npm run dev` runs
   that download automatically before opening Clipwright Studio. If the first
   launch reports `Electron uninstall`, run `npm exec -- install-electron`
   once, then retry `npm run dev`.
4. In the app, create a project and import a video. The built-in heuristic
   analyzer works offline; transcription can be imported from SRT/VTT/JSON.
   Cloud AI providers and local Whisper are optional.

No separate FFmpeg installation is normally needed. For local Whisper
transcription, install Python and faster-whisper separately; the model is
obtained on first use. Your projects and settings are saved locally in the
Clipwright Studio workspace.

## Build a Windows installer (optional)

From the same PowerShell window and project folder, run:

```powershell
npm run dist:win
```

The expected output is `dist\Clipwright Studio-0.0.4-setup-x64.exe`. The script acquires Electron's platform runtime before building. This
command builds the unsigned installer from source; the repository ZIP itself
is not an installer. The Windows Actions workflow builds the same package
from the source archive and uploads it as a downloadable artifact.

## Tests and other development commands

Generated test media is intentionally not included in the source ZIP. To run
the full tests, generate the fixtures first:

```powershell
npm run fixtures
npm test              # 451 tests across 48 files (unit + integration)
npm run typecheck
npm run build
npm run test:visual   # component markup + CSS contract baseline
```

Other useful commands:

```powershell
npm run preview:web   # optional browser preview at http://localhost:8787
npm run test:unit
npm run test:integration
npm run test:visual:update   # approve an intended visual change
npm run verify        # typecheck, then the whole suite
```

The browser preview is for development; `npm run dev` is the normal way to
open the desktop app.

## Status and documentation

See `docs/DEVELOPMENT_PLAN.md`, `docs/TASKS.md`, `docs/CHANGELOG.md`,
`docs/QA_REPORT.md`, and `docs/RELEASE_CHECKLIST.md` for implementation status,
verification, and known manual checks.

## License

MIT. Bundled Inter, IBM Plex Sans Condensed, and Source Serif 4 fonts are
licensed under the SIL Open Font License; see `resources/fonts/OFL.txt` and
`docs/FONT_LICENSES.md`.
