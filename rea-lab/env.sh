# Source this to put REA on PATH:   source rea-lab/env.sh
#
# Installed by rea-lab/setup.sh into /var/tmp/rt (NOT /tmp, which is a small
# tmpfs here). /var/tmp does not survive a new sandbox, so re-run setup.sh when
# `rea` goes missing.
#
# This deliberately does NOT touch HOME. REA runs fine against the real home
# directory and leaves nothing behind there.

RT=/var/tmp/rt

case ":$PATH:" in
  *":$RT/rea/bin:"*) ;;
  *) export PATH="$RT/rea/bin:$RT/node24/bin:$PATH" ;;
esac

# Ghidra-backed native analysis, when it has been installed:
if [ -d "$RT/ghidra_12.1.4_PUBLIC" ] && [ -x "$RT/jdk21/bin/java" ]; then
  export GHIDRA_INSTALL_DIR="$RT/ghidra_12.1.4_PUBLIC"
  export JAVA_HOME="$RT/jdk21"
fi

# Playwright browser cache for the website path:
if [ -d "$RT/pw" ]; then
  export PLAYWRIGHT_BROWSERS_PATH="$RT/pw"
fi

if command -v rea >/dev/null 2>&1; then
  echo "rea $(rea --version) ready${GHIDRA_INSTALL_DIR:+ — ghidra: $GHIDRA_INSTALL_DIR}"
else
  echo "rea not found — run: bash rea-lab/setup.sh" >&2
fi
