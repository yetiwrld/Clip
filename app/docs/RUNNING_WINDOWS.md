# Running Clipwright Studio

Exact commands, verified in this repository (see `docs/QA_REPORT.md` for what
was executed and what remains to be verified on a real Windows machine).

## Install without development tools (end users)

Use the `Clipwright-Studio-Windows-x64-unsigned` artifact from the latest successful **Windows installer** run in the repository's Actions tab. Extract the artifact ZIP and double-click `Clipwright Studio-<version>-setup-x64.exe`; the installer contains the desktop runtime and bundled resources. **Node.js, npm, and terminal commands are not required** for normal installation or use.

This build is unsigned because no signing certificate is configured, so Windows may display an unknown-publisher or SmartScreen warning. Install only a build obtained from the trusted project repository. Uninstalling the app leaves project/workspace data in place. Optional local faster-whisper still requires Python and the `faster-whisper` package; core editing, transcript import, and cloud transcription do not.

## Prerequisites (developers building from source)

| Requirement | Notes |
| --- | --- |
| **Node.js 20+** | Node 22 is the tested/recommended release; `npm` comes with it. |
| **npm 10+** | Package manager used by the repository (`package-lock.json` present). |
| **Windows 10/11 x64** | Primary target for the packaged app. macOS/Linux work for development. |

That's all — FFmpeg and FFprobe are npm dependencies (`@ffmpeg-installer` /
`@ffprobe-installer`) and ship inside the app. Caption fonts are bundled in
`resources/fonts`. No Python is required unless you enable local Whisper
transcription (the helper script is bundled; the Whisper model downloads on
first use).

## Install

```text
npm ci
```

Verified: completes with `0 vulnerabilities` (Node 22, npm 10).

Electron 44 provides a separate `install-electron` command for its platform
binary. The project's `predev` and `prestart` scripts run it automatically
before launching the desktop app. If launch reports `Electron uninstall`, run
`npm exec -- install-electron` once, then retry `npm run dev`. The download
requires internet access; corporate proxies that intercept TLS may need
`NODE_EXTRA_CA_CERTS` configured.

## Test fixtures (optional, needed for `npm test`)

```text
npm run fixtures
```

Generates `tests/fixtures/media/sample.mp4` (60s, 1280×720),
`tests/fixtures/media/silence.mp4` (8.5s tone → 2.5s silence → tone),
`tests/fixtures/media/incompatible.avi` (MPEG-4 video + MP3 audio, for proxy
playback coverage), and `tests/fixtures/transcript.json` with real FFmpeg. The
files are gitignored — run this once after checkout, or the integration suites
will skip/fail with "Test fixtures are missing".

## Type checking

```text
npm run typecheck
```

Verified: clean for both the Node (main/preload) and Web (renderer) projects.

## Tests

```text
npm test
```

Verified on 2026-10-02 (v0.0.4): **291/291 passing** (194 unit + 97 integration
across 34 files), including low-data URL import, speaker-persistence, and
restoration-preview/render coverage. The optional Resemblyzer model was not downloaded in this sandbox.
Also available separately:

```text
npm run test:unit
npm run test:integration
```

## Local speaker grouping and audio restoration

For speaker grouping, first import a transcript (or complete transcription),
then choose **Identify speakers** in the Transcript tab. Python and the optional
`resemblyzer` package are required; the pretrained voice model may need to be
downloaded on first use. Progress is shown, and the resulting speaker groups
are editable: rename speakers or correct individual transcript assignments.
These are voice-turn labels, not real-world identity recognition. After model
setup, diarization runs locally.

In the clip editor, choose an audio-restoration preset and play the before/after
samples. The original source audio is not modified; the selected filter is
included only in the render, and returning to **Off** keeps the unfiltered
sound.

## Development (desktop app)

```text
npm run dev
```

This is the standard command for this repository (`electron-vite dev`): starts
the Vite dev server with hot reload and launches the Electron app.

> Not executable inside this QA sandbox (headless Linux, no display, blocked
> Electron binary CDN) — run it on your Windows machine. The production build,
> full automated suite, and preview backend API are verified here; visual
> interaction in a browser has not been automated.

## Browser preview (no Electron, same backend)

```text
npm run preview:web
```

Verified: serves the built renderer at `http://localhost:8787` with the real
backend services (SQLite + FFmpeg) behind an HTTP bridge. Preview API and
upload-origin safeguards were smoke-tested; file picking, folder reveal and
clipboard fall back to browser alternatives. Open a clip manually to confirm
the stage renders correctly.

## Production build (compile only)

```text
npm run build
```

Verified on 2026-10-02 (v0.0.4): clean — main 395.55 kB, preload 1.15 kB,
renderer 1,235.28 kB JS + 84.18 kB CSS. The supplied Clipwright Studio logo
is copied to the production renderer assets.

## Windows installer / portable build

```text
npm run dist:win
```

Produces (per `electron-builder.yml`):

```text
dist/Clipwright Studio-0.0.4-setup-x64.exe    NSIS installer
dist/win-unpacked/                            unpacked app directory
```

> Packaging status: the unsigned v0.0.4 installer is available on the [GitHub
> Release](https://github.com/yetiwrld/Clip/releases/tag/v0.0.4); the previous
> updater-enabled v0.0.2 build is available from [Actions run
> 36994716385](https://github.com/yetiwrld/Clip/actions/runs/36994716385) for a
> manual update test. No clean-machine Windows installation/update has been
> run. The installer is unsigned and may show SmartScreen warnings.

## First run

On first launch, Clipwright shows a short welcome guide: import a long video,
review suggested moments, then edit and export shareable clips. **Check setup**
is available from the welcome screen for FFmpeg/FFprobe status; AI providers
are optional and the local heuristic analyzer works offline (see
`docs/API_SETUP.md`).

## Where your data lives

Workspace root (configurable, default under the OS user-data directory as
`ClipwrightStudio`): per-project folders (`source/`, `renders/`, `thumbnails/`,
`analysis/`), `exports/`, `logs/`, `secrets.json` (API keys, mode 0600, OS
keychain-encrypted where available). Settings → Storage & privacy can review
and clear playback proxies, filmstrip/waveform caches, extracted transcription
audio, stale partial files, and logs older than 30 days. It never includes
original/imported media, project edits or transcripts, completed renders, or
exports; projects with active jobs are left untouched. Nothing is uploaded
anywhere unless you configure an AI provider (transcript text only — never
video files).
