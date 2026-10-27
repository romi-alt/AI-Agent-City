# Font licences

Self-hosted so the build needs no network (loaded with `next/font/local` in `app/layout.tsx`). The file is taken
unmodified from the `geist` npm package, which publishes the upstream release.

| File | Family | Upstream | Package | Licence | SHA-256 |
|---|---|---|---|---|---|
| `Geist-Variable.woff2` | Geist Sans (variable weight 100–900) | https://github.com/vercel/geist-font | `geist@1.3.1` | SIL Open Font License 1.1 (`OFL-geist.txt`, Copyright 2023 Vercel, in collaboration with basement.studio) | `28258d0621216948416a859d32487ab6ad1c9effa0d08795698e70be3c917630` |

The OFL allows use, bundling and redistribution with software, provided the licence travels with the font and the
font is not sold on its own. The full licence text is next to the file.

`next/font/google` was not used: it downloads fonts at build time, which fails without network access.
