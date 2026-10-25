# Handoff brief — REA session, 2026-10-25

> **Update, same day:** REA was reinstalled in a restricted sandbox (egress limited to
> GitHub + npm + PyPI). It runs on system Node 22.22.3 with no Ghidra and no Chromium.
> `setup.sh` now reflects that, and `env.sh` activates it. What was verified instead:
> a full static analysis of this repo's own Electron app — 130 files, 124 parsed, 0
> parse failures, 197,413 AST nodes, IPC graph that matches the source exactly.
> Read **REA_INSTALL.md** first; the toolchain paths below (`/var/tmp/rt/node24`,
> JDK 21, Ghidra) still apply only on a host with open egress.

Paste this into a new chat to continue. It is self-contained.

## What we established

REA (Reverse Engineer Anything, `morluto/rea`, npm `rea-agents`, MIT) was installed in the
workspace and **verified working**, not just discussed. Version 6.8.0.

Verified by actual runs, not claims:

| Capability | Result |
|---|---|
| Go binaries (no engine needed) | Recovered Go 1.25.1, module graph, 21 deps, VCS commit, ldflags from a real `yq` v4.47.2 binary |
| Native Linux ELF decompilation (Ghidra 12.1.4 + JDK 21) | 20 functions decompiled from a stripped `-O2` binary in ~16 s |
| Key-recovery test | Wrote a stripped crackme with a randomly generated sealed key; REA returned the validator pseudocode; inverted it from REA's output alone and produced a key the binary accepted (matched on all 11 compared positions) |
| Website analysis (Chromium + CDP) | react.dev: 15/15 scripts analysed, 262,192 AST nodes, routes extracted with source locations, 0 parse failures |
| .NET assemblies | Newtonsoft.Json.dll: 496 types, 4,185 methods, 18,846 call edges, no execution |

## Standing limitations (do not re-litigate, they are confirmed)

- **No original source from compiled binaries.** Pseudocode only. The rebuild is new code.
- **Websites are the exception:** HTML/CSS/JS genuinely are the shipped front end. `--fetch-source-maps`
  can recover original unminified files when a site left maps published.
- **Hopper is macOS-only** — impossible on this Linux box. IDA needs the user's own licence.
- **Android APK** needs a caller-supplied `jadx-headless-mcp` JAR — untested.
- **Windows C/C++ .exe** — Ghidra path, flagged experimental/read-only upstream.
- **No logins, no paywalled/private pages, no bot-protected sites, no running untrusted malware.**

## Toolchain state

Installed to `/var/tmp/rt` (NOT `/tmp` — that is a 992 MB tmpfs and fills instantly).
**This does not survive a new session.** Rebuild with `rea-lab/setup.sh` (~5 min).

Environment needed:

```
export PATH=/var/tmp/rt/node24/bin:$PATH
export JAVA_HOME=/var/tmp/rt/jdk21
export GHIDRA_INSTALL_DIR=/var/tmp/rt/ghidra_12.1.4_PUBLIC
export PLAYWRIGHT_BROWSERS_PATH=/var/tmp/rt/pw
```

Note: `setup.sh` currently covers Node + JDK + Ghidra + REA. It does **not** yet install
Chromium; add `npx playwright install chromium` plus `sudo npx playwright install-deps chromium`
to restore the website path. Sandbox `sudo` works (`sudo -n whoami` → root).

Chromium launch used:

```
/var/tmp/rt/pw/chromium-1248/chrome-linux64/chrome --headless=new --no-sandbox \
  --disable-gpu --disable-dev-shm-usage --remote-debugging-port=9222 \
  --user-data-dir=/var/tmp/rt/chrome-profile about:blank
```

REA browser workflow: `curl -X PUT "http://127.0.0.1:9222/json/new?<URL>"` → take `id` →
`rea list-browser-targets http://127.0.0.1:9222` → `rea analyze-web-bundle http://127.0.0.1:9222 <id>`.

## Agreed framing on "clone"

Four distinct jobs, established in conversation:

1. **Static copy** — looks identical, nothing works behind it.
2. **Working rebuild** — same behaviour, new code, user's stack. (Recommended default.)
3. **Design extraction** — layout/styling/components as a starting point.
4. **API map** — endpoints, payloads, data flows, for building or integrating.

Front end can be a genuine reconstruction; back end is always rebuild-from-observation.

## Boundaries confirmed and accepted

- Will help: user's own site/app, legacy software being migrated, client work, security review of
  their own product, legitimate integration with services they pay for, rebuilding a feature they
  don't want to keep paying for.
- Will not help: cloning someone else's product as their own, bypassing paywalls, DRM, licence
  checks, forging subscription entitlements, harvesting paid API keys to dodge billing.

## Open question — what to do next

The user was asked for a target and had not yet supplied one. Restart from:

> "Send me the URL or the file, pick one of the four clone modes, and confirm it's yours."

## Workspace files

```
rea-lab/
├── README.md      full technical report with real outputs
├── setup.sh       rebuilds Node + JDK 21 + Ghidra + REA
├── HANDOFF.md     this file
└── artifacts/
    ├── crackme-source.c                   the stripped test target
    ├── license3-validator-pseudocode.c    REA/Ghidra output (the money shot)
    ├── license3-validator-decompile.json  same as canonical Evidence
    ├── decompile-index.json               20-function export manifest
    ├── yq-go-buildinfo-evidence.json      engine-free Go evidence
    └── yq-elf-notes-evidence.json         ELF note parsing evidence
```
