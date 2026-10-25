# REA installed in this workspace — 2026-10-25

REA (**Reverse Engineer Anything**, `morluto/rea`, npm package `rea-agents`, MIT) is
installed and running in this sandbox. Version **6.8.0**.

This file is the "installed in *this* workspace" record. Background on what REA can
and cannot do is in [README.md](README.md); the resumable brief is in
[HANDOFF.md](HANDOFF.md).

---

## TL;DR

```bash
source rea-lab/env.sh          # -> rea 6.8.0 ready
rea --version                  # 6.8.0
rea doctor                     # health + provider report
```

If `rea` is missing (a new sandbox wipes `/var/tmp`), rebuild in ~20 s:

```bash
bash rea-lab/setup.sh
```

---

## What got installed

| Piece | Where | Notes |
|---|---|---|
| `rea-agents@6.8.0` | `/var/tmp/rt/rea` (isolated npm prefix) | 150 packages, ~15 s, from registry.npmjs.org. **Pinned** — an unpinned reinstall silently resolved 6.7.0, which lacks `--source-paths-json`. |
| `rea` + `rea-agents` binaries | `/var/tmp/rt/rea/bin` | symlinks into `lib/node_modules/rea-agents` |
| Runtime | system Node **v22.22.3** | REA declares `^22.23.4 \|\| ^24.22.1 \|\| >=26.12.1` |

**About the engine warning.** npm prints `EBADENGINE` because the sandbox Node is
22.22.3, three patch versions under REA's floor. Every operation used in this lab
runs correctly on it; npm only warns and installs. A proper Node 24 was *not*
installed because this sandbox's egress allowlist blocks the places it lives
(`nodejs.org`, `api.adoptium.net`, and GitHub **release-asset** downloads at
`release-assets.githubusercontent.com`). Only `github.com`, `codeload.github.com`,
`api.github.com`, `registry.npmjs.org`, `pypi.org` and `files.pythonhosted.org`
are reachable.

**Security note on provenance.** Before installing I checked the package against
the registry metadata: maintainer `morluto`, repository `github.com/morluto/rea`,
MIT, npm provenance attestation present, and the docs' own warning about
trojanized lookalikes. It was installed from the registry directly, pinned to
`@6.8.0`.

---

## What actually works here — verified by running it, not by reading docs

### 1. A stripped ELF, no engine required

```bash
gcc -O2 -s -o /var/tmp/rt/targets/license3 rea-lab/artifacts/crackme-source.c
rea inspect-elf-notes ./license3 --format json
```

Returned a real `evidence_id` (`ev_ad3d24…96c6b`), the artifact SHA-256, and the
parsed `.note.gnu.property`, `.note.gnu.build-id`
(`80d7dcb9602b34dde41b590866854ac203b5d350`) and `.note.ABI-tag` entries with
byte offsets into the file. `inspect-native-exports` works too.

### 2. This repo's own Electron app — the interesting one

```bash
unzip AIClipping-code-for-AI.zip -d /var/tmp/rt/targets/AIClipping
rea analyze /var/tmp/rt/targets/AIClipping --format json > clip-analysis.json
```

~51 s, producing an 87 MB Evidence bundle. Condensed results are checked in as
[`artifacts/clipwright-app-analysis-summary.json`](artifacts/clipwright-app-analysis-summary.json):

| Measure | Result |
|---|---|
| Files inventoried / JS parsed | 130 / 124 |
| Parse failures | **0** |
| AST nodes visited | 197,413 |
| Static findings | 2,254 |
| Graph nodes | 1,494 |
| Integrity contradictions | 0 |
| BrowserWindow declarations | 1 (with 5 `webPreferences`) |
| `contextBridge` API surfaces | 1 |
| IPC literal channels | 6 |
| `ipcMain` handlers | 4 |
| Renderer transmissions | 4 (all paired to a handler, 0 ambiguous) |

I checked the IPC numbers against the source by hand — `grep -c "ipcMain.handle('"` in
`src/` gives exactly **4**: `api:invoke`, `app:update:check`, `app:update:download`,
`app:update:install`, and every renderer `ipcRenderer.invoke` call pairs with one of
them. REA's IPC reconstruction is **exactly right on this app**, with no false
positives.

### 3. Where it is honest instead of confident

- `src/main/index.ts:378` sets `preload: path.join(__dirname, '../preload/index.js')`.
  REA recorded that web preference as `status: "dynamic"` with the raw expression,
  and reported `preload_entrypoints: 0` — because that path is **build output**,
  which does not exist in the source tree. It refused to guess rather than inventing
  an edge to `src/preload/index.ts`.
- 143 entries in `limitations[]` are individually attributed — mostly "the parent
  reserved remaining result capacity for static observations; semantic analysis of
  *X* was not started" for the larger renderer files. Every result is marked
  `coverage` + explicit unknowns, never silently truncated.
- Asking for a native analysis with no engine returns a clean fail-closed error:
  `code: provider_unavailable`, `retryable: true`, per-provider remediation — not a
  half-answer. Confirmed with `rea analyze ./license3`.

---

## What does not work here, and why

| Capability | Status | Reason |
|---|---|---|
| Ghidra decompilation | ✗ | Needs JDK 21 + Ghidra (~1.4 GB); both download from blocked hosts. Installable on a normal host with `bash rea-lab/setup.sh --with-ghidra`. |
| Website capture (Chromium/CDP) | ✗ | No Chrome family installed and Playwright's browser CDN is not on the allowlist. `--with-browser` on a normal host. |
| Hopper provider | ✗ | macOS-only by design. |
| IDA provider | ✗ | Requires your own licence + MCP registration. |
| JADX (Android) | ✗ | REA deliberately does not ship it; needs a caller-supplied JAR. |
| MCP attach into Claude Code / Codex / Cursor | n/a | No such agent lives inside this sandbox. The CLI exposes the same tool surface. |

---

## Cheat sheet for using it on this repo

```bash
source rea-lab/env.sh   # once per shell

# Whole app: windows, preload, contextBridge, IPC graph, AST-level facts
rea analyze . --format json > /var/tmp/app.json

# Only the files you care about (exact inventoried paths)
rea analyze . --source-path src/main/index.ts --source-path src/preload/index.ts --format json

# Compact reading instead of a huge JSON
rea analyze . --format md --token-limit 8000
rea analyze . --format md --filter-output summary,statistics,route_inventory

# What can this box actually do, and with what side effects?
rea capabilities
rea doctor

# Any ELF you point it at (no engine needed)
rea inspect-elf-notes ./some-binary --format json
rea inspect-native-exports ./some-binary --format json
rea inspect-go-binary ./some-go-binary --format json
```

Handy for the size problem: the full `--format json` bundle for this app is 87 MB.
Use `--token-limit`, `--filter-output`, or `--format md` when reading it in a chat
context, and save the JSON to a file when you want to query it precisely.

---

## Keep out of git

`/var/tmp/rt` (install) and the extracted targets are scratch space and are **not**
in the repo. Anything worth keeping belongs in `rea-lab/artifacts/` — keep those
small and evidence-shaped, not raw 87 MB dumps.
