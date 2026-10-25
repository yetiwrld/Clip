# Optional command-line media tools

No third-party executable is bundled in this directory by default. The app can
use `yt-dlp` from the user's `PATH`; an approved, platform-matching binary can
also be placed here before packaging when a release needs to ship one. Keep
binaries out of source control unless their provenance, license, and update
process have been reviewed. See `docs/SECURITY.md` and `docs/ENVIRONMENT_AUDIT.md`.
