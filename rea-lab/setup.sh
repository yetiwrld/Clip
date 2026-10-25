#!/usr/bin/env bash
# Rebuild a working REA install in this sandbox.
#
# Reality check (2026-10-25): this sandbox's egress allowlist is github.com,
# codeload.github.com, api.github.com, registry.npmjs.org, pypi.org,
# files.pythonhosted.org. nodejs.org, api.adoptium.net and the GitHub *release
# asset* host (release-assets.githubusercontent.com) are all blocked, so the
# original download-only version of this script cannot run here. This version:
#   * installs REA from npm into /var/tmp/rt/rea (pristine, isolated prefix)
#   * runs it on the system Node, warning about the engine mismatch instead of
#     downloading a newer Node
#   * offers Node/JDK/Ghidra/Chromium behind --with-* flags for hosts where
#     those downloads are actually reachable
#
# Usage:  bash setup.sh                # REA only (works offline-ish, ~20 s)
#         bash setup.sh --with-ghidra  # + JDK 21 + Ghidra (needs open egress)
#         bash setup.sh --with-browser # + Playwright Chromium (needs open egress)
set -euo pipefail

RT=/var/tmp/rt
PREFIX="$RT/rea"
REA_HOME="$RT/home"
WITH_NODE=1
WITH_GHIDRA=0
WITH_BROWSER=0

for arg in "$@"; do
  case "$arg" in
    --with-ghidra)  WITH_GHIDRA=1 ;;
    --with-browser) WITH_BROWSER=1 ;;
    --no-node)      WITH_NODE=0 ;;
    -h|--help)      sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

mkdir -p "$RT" "$PREFIX" "$REA_HOME"

# ---------- 1. Node ----------
# REA 6.8.0 declares ^22.23.4 || ^24.22.1 || >=26.12.1. It runs fine on older
# 22.x for everything in this lab; npm only warns (EBADENGINE), it does not
# refuse. Node 24 can be fetched from the GitHub actions/node-versions releases
# when github.com release assets are reachable:
#   https://github.com/actions/node-versions/releases/download/24.22.1-39619001896/node-24.22.1-linux-x64.tar.gz
if [ "$WITH_NODE" = 1 ] && [ ! -x "$RT/node24/bin/node" ]; then
  if curl -fsSL --connect-timeout 8 -o /dev/null -r 0-0 \
       "https://github.com/actions/node-versions/releases/download/24.22.1-39619001896/node-24.22.1-linux-x64.tar.gz" 2>/dev/null; then
    echo "==> Node 24.22.1 (from actions/node-versions)"
    curl -fsSL -o "$RT/node.tar.gz" \
      "https://github.com/actions/node-versions/releases/download/24.22.1-39619001896/node-24.22.1-linux-x64.tar.gz"
    tar -xf "$RT/node.tar.gz" -C "$RT" && mv "$RT/node-v24.22.1-linux-x64" "$RT/node24"
    rm -f "$RT/node.tar.gz"
  else
    echo "==> Node 24 unreachable (release assets blocked); using system node $(node -v 2>/dev/null || echo MISSING)"
  fi
fi
export PATH="$RT/node24/bin:$PATH"

# ---------- 2. Optional: JDK 21 + Ghidra ----------
if [ "$WITH_GHIDRA" = 1 ]; then
  if [ ! -x "$RT/jdk21/bin/java" ]; then
    echo "==> Temurin JDK 21"
    JDK_URL="https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.13%2B9/OpenJDK21U-jdk_x64_linux_hotspot_21.0.13_9.tar.gz"
    curl -fsSL -o "$RT/jdk21.tar.gz" "$JDK_URL"
    mkdir -p "$RT/jdk21"
    tar -xzf "$RT/jdk21.tar.gz" -C "$RT/jdk21" --strip-components=1
    rm -f "$RT/jdk21.tar.gz"
  fi
  export JAVA_HOME="$RT/jdk21"

  if [ ! -d "$RT/ghidra_12.1.4_PUBLIC" ]; then
    echo "==> Ghidra 12.1.4 (~570 MB download, ~876 MB extracted)"
    curl -fsSL -o "$RT/ghidra.zip" \
      "https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_12.1.4_build/ghidra_12.1.4_PUBLIC_20260921.zip"
    ( cd "$RT" && unzip -q ghidra.zip && rm ghidra.zip )
  fi
  export GHIDRA_INSTALL_DIR="$RT/ghidra_12.1.4_PUBLIC"
fi

# ---------- 3. Optional: Chromium for the website path ----------
if [ "$WITH_BROWSER" = 1 ]; then
  export PLAYWRIGHT_BROWSERS_PATH="$RT/pw"
  if [ ! -d "$RT/pw" ]; then
    echo "==> Playwright Chromium"
    npx --yes playwright@latest install chromium || echo "   (chromium install failed; website path unavailable)"
    sudo -n env PATH="$PATH" npx --yes playwright@latest install-deps chromium || \
      echo "   (install-deps failed; you may need libnss3/libnspr4)"
  fi
fi

# ---------- 4. REA ----------
echo "==> rea-agents@6.8.0 pinned (npm -> $PREFIX)"
# Pinned deliberately: an unpinned install pulled 6.7.0, which lacks --source-paths-json.
npm_config_prefix="$PREFIX" npm install -g rea-agents@6.8.0 --no-fund --no-audit

# ---------- 5. Verify ----------
export PATH="$PREFIX/bin:$PATH"
export HOME="$REA_HOME"
echo
echo "==> rea --version"
rea --version
echo
echo "==> rea doctor (node/analysis-engine lines only)"
rea doctor | grep -E "^  - name:|healthy:|node$|ghidra|hopper" | head -20 || true

cat <<EOF

Ready.

  Activate in any shell:   source $(cd "$(dirname "$0")" && pwd)/env.sh

  rea --version                     # 6.8.0
  rea doctor                        # provider/health report
  rea capabilities                  # engine + provider matrix
  rea analyze <dir-or-binary> --format json

Engine-free operations that work here with zero extra setup:
  inspect-elf-notes, inspect-native-exports, inspect-go-binary,
  inspect-keyed-archive, analyze-javascript-application / analyze (JS+Electron)

Not available in this sandbox (needs open egress or a licensed engine):
  Ghidra/JDK 21 downloads (release assets blocked), Playwright Chromium,
  Hopper (macOS-only), IDA (own licence), JADX (bring your own JAR).
EOF
