# REA in this sandbox — what actually works

> **Re-installed 2026-10-25 in a locked-down sandbox.** The toolchain from the
> session below did not survive, and this sandbox cannot reach the same download
> hosts, so it was rebuilt differently: REA 6.8.0 from npm, running on the system
> Node 22.22.3, with **no** Ghidra path (blocked egress) and **no** Chromium path.
> Verified against this repo's own Electron app instead. See
> **[REA_INSTALL.md](REA_INSTALL.md)** for the current state, the exact commands,
> and the verified numbers. Everything below is the original, richer-host report —
> still accurate about REA's behaviour, but its install section no longer applies
> here; `setup.sh` has been rewritten to match reality.

**Verdict: yes, REA runs here.** I installed it (v6.8.0) and got both an engine-free analysis path and the full Ghidra-backed path working. Below is exactly what I did, what worked, what didn't, and the artifacts.

Date of test: 2026-10-25 · Sandbox: Debian 13 (trixie), x86_64, non-root user `user`, 20 GB disk on `/`, 992 MB tmpfs on `/tmp`.

---

## 1. TL;DR

| Capability | Status here | Notes |
|---|---|---|
| Install `rea-agents` from npm | ✅ | 176 packages, ~18 s, MIT, npm provenance attestation present |
| `rea` CLI (139-ish tools) | ✅ | `rea --help`, `rea doctor`, `rea capabilities` all run |
| Go binary analysis (`inspect-go-binary`) | ✅ | Needs **no** external engine. Recovered Go 1.25.1, module graph, VCS commit, build flags |
| ELF static inspection (`inspect-elf-notes`, `inspect-native-exports`) | ✅ | Pure parsing, no engine |
| Ghidra-backed decompilation | ✅ after setup | Needed JDK **21** + Ghidra **12.1.4** (~1.4 GB of downloads) |
| Hopper provider | ❌ impossible | **macOS only** — the launcher check fails on Linux by design |
| IDA provider | ❌ | Requires your own IDA licence + upstream IDA MCP registration |
| JADX (Android APK) provider | ❌ | REA deliberately does not ship it |
| Website / Electron / browser capture | ❌ here | No Chrome-family browser installed; Playwright capture would need one |
| MCP-into-an-agent use (the actual pitch) | ⚠️ not applicable | This sandbox has no Claude Code / Codex / Cursor to attach the MCP server to. I drove the same tools through the CLI, which exposes the identical engine |

## 2. Environment hurdles worth knowing

1. **Node version.** The sandbox ships Node v20.20.2, but `rea-agents` declares `^22.23.4 || ^24.22.1 || >=26.12.1`. I installed Node 24.22.1 into `/var/tmp`.
2. **`/tmp` is a 992 MB tmpfs.** Ghidra alone is 570 MB zipped / 876 MB extracted — my first attempt died with `No space left on device`. Everything heavy went to `/var/tmp` (on the 25 GB root disk) instead.
3. **Java.** System Java is OpenJDK **11**; Ghidra 12.1.x needs **21**. Downloaded Temurin JDK 21.
4. **Ephemerality.** Node, JDK, and Ghidra live outside `/home/user`, so they will **not** survive into a later session. `setup.sh` rebuilds the whole thing in a few minutes.

## 3. What I actually ran

### Engine-free: a real Go binary
Target: `yq` v4.47.2 (11 MB, stripped, static).

```
rea inspect-go-binary /tmp/target/yq --format json
```

Recovered, with an `evidence_id` attached to every result:

- Go toolchain **go1.25.1**
- main module `github.com/mikefarah/yq/v4` @ `v4.47.2`
- **21** dependencies with `h1:` hashes
- build settings: `CGO_ENABLED=0`, `GOOS=linux`, `GOARCH=amd64`, `-ldflags="-s -w"`
- VCS provenance: `vcs.revision=6251e95af8df3505def48c71f3119836701495d6`, `vcs.time=2025-09-08T10:05:05Z`

Artifact: `artifacts/yq-go-buildinfo-evidence.json` (plus `yq-elf-notes-evidence.json`).

### Ghidra-backed: full decompile → invert → key recovery

I wrote a small stripped `-O2` "crackme" (`artifacts/crackme-source.c`) whose check compares a scrambled 12-byte key against two constant tables. The key was generated randomly and written to a file I did **not** read, so the test was blind.

```
rea decompile-all license3 --output out3        # 20 functions, ~16 s
```

REA located the validator (`FUN_001011c0`) and returned Ghidra pseudocode
(`artifacts/license3-validator-pseudocode.c`):

```c
*(byte *)((long)&local_18 + lVar3) =
     ((char)uVar4 - ((char)(uVar4 / 0xb) + (char)(uVar4 / 0xb) * '\n')) +
     (param_1[lVar3] ^ 0x5aU);
...
if ((local_18 == 0x190d1835) && (local_14 == '>')) {
  if ((local_12 != 0x351a2822) || (uVar1 = 0, local_e != 0x3412)) { ... }
```

I parsed the constants out of **that output only**, inverted `buf[i] = (key[i] ^ 0x5a) + (7i mod 11)` byte-wise, and produced:

```
recovered key : oKPUb!CyCwTn
binary verdict: ACCEPTED
```

Cross-check against the sealed key (`oKPUbRCyCwTn`): identical on all **11** positions the check actually compares, differing only at index 5 — a stack padding byte that the comparison never touches. So the analysis was complete and the derived key is behaviourally equivalent. (94 sibling keys exist for exactly that reason.)

Honest caveat: I authored the target, so this shows REA's *mechanics*, not its performance on a hardened real-world protector. On the earlier accidental version of my own toy, REA's pseudocode was actually **better than my source intent** — it faithfully showed me that the binary was unsatisfiable, which is how I found my bug.

## 4. How it behaves (design notes)

- **Evidence contract.** Every result carries `evidence_id`, the provider + version, an `analysis_profile` digest, and explicit `limitations`. Failures are fail-closed with a `code`, `category`, `retryable`, and a `remediation` action — e.g. asking for native analysis with no engine returns `provider_unavailable` with per-provider rejection diagnostics instead of pretending.
- **Read-only on the target.** Ghidra analysis runs through an *ephemeral-source-immutable* import; the original bytes are never written, and annotations live in session metadata only.
- **It really is just glue.** REA does not contain a decompiler. All the deep native work is Ghidra/Hopper/IDA you supply — exactly as the project's own docs say.
- **Token-aware CLI.** `--format md|json|yaml|toon|jsonl`, `--token-limit`, `--token-count`, `--filter-output`, and `--llms-full` manifests — clearly built to be driven by an LLM.

## 5. Practical advice if you want this for real

- For **Go/Rust-ish binaries and ELF inspection**, REA is useful with zero extra setup.
- For **native disassembly/decompilation on Linux**, budget the Ghidra + JDK 21 install (or use IDA if you own it). Hopper is macOS-only, full stop.
- On a **Mac** the Hopper path is the low-friction one; on **Windows** native support goes through Ghidra and is flagged experimental/read-only.
- Run `rea doctor` first, always. It reports exactly which provider is missing and what to set.
- Install only from `github.com/morluto/rea`, `rea.tools`, or the `rea-agents` npm package — trojanized lookalikes of this project have been circulating.

## 6. Files

```
rea-lab/
├── REA_INSTALL.md                         current install + verified results (2026-10-25)
├── APP_ARCHITECTURE.md                    how the app in app/ is actually built (verified)
├── CAPCUT_STYLE_ANALYSIS.md               what CapCut's style is vs what this app has
├── CAPCUT_REFERENCE_1022_1013.md          analysis of the two real CapCut projects  <-- start here
├── CAPCUT_EXPORT_1022.md                  measured breakdown of the finished 1022 video
├── CAPCUT_RESEARCH_PACKAGE_REVIEW.md      review of the 'Video Editor/' research folder (on main)
├── CAPCUT_IMPLEMENTATION_PLAN.md          how to build it, workstreams and risks
├── reference/                             the two real drafts (JSON + covers), trimmed
├── tools/capcut-digest.py                 turn any CapCut draft into a style report
├── README.md                              this report
├── HANDOFF.md                             resumable brief
├── setup.sh                               rebuild the install (sandbox-aware)
├── env.sh                                 source to put rea on PATH
└── artifacts/
    ├── crackme-source.c                   the stripped target I wrote
    ├── license3-validator-pseudocode.c    REA/Ghidra output for FUN_001011c0
    ├── license3-validator-decompile.json  same, as canonical Evidence
    ├── decompile-index.json               export manifest (20 functions)
    ├── yq-go-buildinfo-evidence.json      engine-free Go evidence
    ├── yq-elf-notes-evidence.json         ELF note parsing evidence
    └── clipwright-app-analysis-summary.json  condensed REA analysis of this repo's app
```
