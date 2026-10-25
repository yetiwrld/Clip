# Bundled caption font licenses

The application bundles the exact static TrueType faces used by caption preview and FFmpeg/libass export. All font software is distributed under the SIL Open Font License 1.1 (OFL-1.1); the corresponding license text ships beside each family. The files are the full faces (not CSS/web subsets), so script coverage and glyph fallback are consistent across preview and export.

| Family | Included files | License text | Upstream |
|---|---|---|---|
| Inter | `Inter_400Regular.ttf`, `Inter_600SemiBold.ttf`, `Inter_700Bold.ttf`, `Inter_800ExtraBold.ttf`, `Inter_900Black.ttf` | `resources/fonts/OFL.txt` | [Google Fonts Inter](https://github.com/google/fonts/tree/main/ofl/inter) |
| IBM Plex Sans Condensed | `IBMPlexSansCondensed-Regular.ttf`, `IBMPlexSansCondensed-Medium.ttf`, `IBMPlexSansCondensed-SemiBold.ttf`, `IBMPlexSansCondensed-Bold.ttf` | `resources/fonts/IBM-Plex-OFL.txt` | [Google Fonts IBM Plex Sans Condensed](https://github.com/google/fonts/tree/main/ofl/ibmplexsanscondensed) |
| Source Serif 4 | `SourceSerif4_400Regular.ttf`, `SourceSerif4_600SemiBold.ttf`, `SourceSerif4_700Bold.ttf` | `resources/fonts/Source-Serif-OFL.txt` | [Google Fonts Source Serif 4](https://github.com/google/fonts/tree/main/ofl/sourceserif4) |

Each listed weight is a separate static TTF and is registered from the shared face manifest in `src/shared/constants/index.ts`. `electron-builder.yml` copies `resources/fonts/` into packaged app resources. The Electron media protocol and browser-preview stream permit only `.ttf` files inside this directory outside the user workspace; arbitrary filesystem paths remain blocked.
