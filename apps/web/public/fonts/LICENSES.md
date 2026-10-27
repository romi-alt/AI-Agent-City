# Font licences

Self-hosted so the build needs no network (loaded with `next/font/local` in `app/layout.tsx`). Latin subset WOFF2
files, taken unmodified from the Fontsource npm packages (which repackage the upstream releases).

| File | Family | Upstream | Package | Licence | SHA-256 |
|---|---|---|---|---|---|
| `instrument-serif-latin-400-normal.woff2` | Instrument Serif Regular | https://github.com/Instrument/instrument-serif | `@fontsource/instrument-serif@5.3.0` | SIL Open Font License 1.1 (`OFL-instrument-serif.txt`) | `5eb09b5ac0e28b67c2f041c8ba6d244604ca0c0980d65912ab2d47fed84ddc31` |
| `instrument-serif-latin-400-italic.woff2` | Instrument Serif Italic | same | same | same | `5a51946dfffa82972bc98745359c46761515641fda557c25116459a9f83da4a7` |
| `instrument-sans-latin-wght-normal.woff2` | Instrument Sans (variable weight 400–700) | https://github.com/Instrument/instrument-sans | `@fontsource-variable/instrument-sans@5.3.0` | SIL Open Font License 1.1 (`OFL-instrument-sans.txt`) | `2ee17598a98d8a59e4df8152d015bec9ab8e4d5672cc0ab42bef806b568e3971` |

The OFL allows use, bundling and redistribution with software, provided the licence travels with the fonts and the
fonts are not sold on their own. The full licence texts are next to the files.

`next/font/google` was not used: it downloads fonts at build time, which fails without network access.
