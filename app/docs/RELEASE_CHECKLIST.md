# Release Checklist — Clipwright Studio

Run before every release. The current code/version is v0.0.4 (2026-10-02).
The v0.0.4 GitHub Release and update assets are published; the real Windows
install/update acceptance steps below remain required.

## 1. Automated gates

- [x] `npm ci` — clean, 0 vulnerabilities *(this QA)*
- [x] `npm run typecheck` — clean *(this QA)*
- [x] `npm run fixtures` — generates test media *(this QA)*
- [x] `npm test` — 291/291 (194 unit + 97 integration) *(this QA)*
- [x] `npm run build` — clean *(this QA)*

## 2. Packaging (Windows runner/machine required)

Windows Actions run [37000108649](https://github.com/yetiwrld/Clip/actions/runs/37000108649) successfully built and uploaded the unsigned v0.0.4 artifact (ID 11223801205, 159,315,104 bytes). The workflow artifact is `Clipwright-Studio-Windows-x64-unsigned`, containing `Clipwright Studio-0.0.4-setup-x64.exe`. A clean Windows install/launch still needs a manual check.

- [ ] Installer installs and launches on a clean Windows 11 x64 machine without Node/npm
- [ ] Confirm the expected unsigned-publisher/SmartScreen behavior; no signing certificate is configured
- [ ] First-run welcome guide appears with three workflow steps; optional setup check shows bundled FFmpeg/FFprobe OK
- [ ] Bundled caption fonts render in preview and output
- [ ] Uninstaller removes the app (user data kept by design)

## 3. Automatic update release path

- [x] Packaged Windows app checks GitHub Releases and prompts before downloading
- [x] Download progress and a restart/install prompt are wired in the renderer
- [x] Tag-driven workflow builds NSIS and publishes installer, `latest.yml`, and blockmap assets
- [x] Publish matching v0.0.4 release and confirm installer, `latest.yml`, and blockmap (release workflow verified)
- [ ] On Windows, install an older updater-enabled build, approve a newer version, watch progress, and verify restart/install
- [ ] Confirm the workspace and user settings remain intact after updating

The v0.0.1 app does not contain updater code; install an updater-enabled v0.0.2
build manually once. The v0.0.4 GitHub Release is published; install v0.0.3,
then approve the v0.0.4 download in the app to test updating.

## 4. Smoke test on the packaged app (Windows)

- [ ] Create project → import a real long video → plays in preview
- [ ] Transcript import (SRT) or local Whisper transcription
- [ ] Run local speaker grouping after transcript import; verify progress,
      rename a group, correct a segment, then confirm the assignments persist
- [ ] With network disabled after model setup, rerun local speaker grouping
      and confirm audio is not sent to a remote provider
- [ ] Heuristic analysis works offline (network off)
- [ ] Provider configured → Test connection → success with latency
- [ ] AI analysis → moments with audit scores → create clip
- [ ] Open an existing clip in the editor; stage loads without blanking,
      including while switching between clips and after a failed load
- [ ] Editor: trim/captions/crop/metadata changes persist after app restart
- [ ] Select each audio-restoration preset, play before/after samples, render,
      and confirm the source/original media remains unchanged
- [ ] UI pass: preview is prominent at desktop/narrow widths; timeline fit/zoom,
      snap, drag/trim, split, duplicate, delete, locks and track menu respond
- [ ] Add a timed image/video overlay; verify preview and exported position,
      opacity, start, and end match
- [ ] Verify preview/export audio parity for source + timeline audio,
      speed, item/track mute, volume, and fade-in/fade-out
- [ ] Render 9:16 → output plays, correct aspect; render 4:5 → 1080×1350
- [ ] Export produces mp4 + metadata files; Reveal folder opens Explorer
- [ ] Settings → Storage & privacy lists preview caches; remove a proxy/cache and confirm it can regenerate
- [ ] Confirm cleanup leaves original/imported media, transcripts, completed renders, exports and diagnostic JSON intact
- [ ] Cancel a running render; retry a failed one; interrupted tasks resume
      only with explicit user action
- [ ] Delete a project (with confirmation) while its import runs → app survives
- [ ] API key never visible in UI/logs/diagnostics export

## 5. GonkaRouter / provider acceptance (with a real key)

- [ ] Base URL `https://api.gonkarouter.io/v1`, key pasted in Settings → AI
- [ ] Test connection → "Connection successful — model responded correctly"
- [ ] Model ID with `/` accepted verbatim (e.g. `zai-org/GLM-5.3-Flash`)
- [ ] If gateway rejects `response_format`: analysis still succeeds (auto
      fallback), or JSON mode disabled manually
- [ ] If 401 with Bearer: switch **API key header** to `x-api-key` → success
- [ ] Full AI workflow: analyze → audit scores → clip → generate metadata

## 6. Release hygiene

- [x] Version bumped in `package.json` and lockfile to v0.0.4
- [x] `docs/CHANGELOG.md` updated
- [x] `docs/TEST_RESULTS.md` updated with the v0.0.4 build and test results
- [x] Tagged-release workflow validates the tag/version and publishes update metadata
- [ ] No secrets/keys in the repo (`git grep -E "sk-[A-Za-z0-9]|gk-"` clean)
- [x] No generated fixtures or compiled build output included in the source archive
- [x] Tag/release v0.0.4 (published; update workflow assets verified)
