# Font licences

Self-hosted so the build needs no network (loaded with `next/font/local` in `app/layout.tsx`). Geist is taken
unmodified from the `geist` npm package, which publishes the upstream release. JetBrains Mono and Inter (the Office
view's labels and body text) are the upstream files as packaged by Debian; no WOFF2 converter was available offline,
so they ship as TTF/OTF.

| File | Family | Upstream | Package | Licence | SHA-256 |
|---|---|---|---|---|---|
| `JetBrainsMono-Medium.ttf`, `JetBrainsMono-Bold.ttf` | JetBrains Mono 2.304 (500, 700) | https://github.com/JetBrains/JetBrainsMono | Debian `fonts-jetbrains-mono` 2.304+ds-4 (unmodified upstream files) | SIL Open Font License 1.1 upstream (`OFL-jetbrains-mono.txt`). Debian's packaging metadata lists Apache-2.0 for this release; both allow bundling | Medium `712b76d2f7cabaa50799d5775b8de657b8ca07dd3abb95bd793effb71b754c8d`, Bold `587fe1c01c3c1a8c579edd0d213476b3db625269bd5f43a7ec4ead6826f64557` |
| `Inter-Regular.otf`, `Inter-SemiBold.otf` | Inter 4.0 (400, 600) | https://github.com/rsms/inter | Debian `fonts-inter` 4.0+ds-1 (unmodified upstream files) | SIL Open Font License 1.1 (`OFL-inter.txt`, Copyright 2016 The Inter Project Authors) | Regular `be6d709dcb730ddaf050cbdae6fe89bd56d5d14dc66885639bbf6f06bd03521b`, SemiBold `bd68706b7bf8b3c580ae57685a2116bb1704b3a9998309ccfec7cd486f8a593e` |
| `Geist-Variable.woff2` | Geist Sans (variable weight 100–900) | https://github.com/vercel/geist-font | `geist@1.3.1` | SIL Open Font License 1.1 (`OFL-geist.txt`, Copyright 2023 Vercel, in collaboration with basement.studio) | `28258d0621216948416a859d32487ab6ad1c9effa0d08795698e70be3c917630` |

The OFL allows use, bundling and redistribution with software, provided the licence travels with the font and the
font is not sold on its own. The full licence text is next to the file.

`next/font/google` was not used: it downloads fonts at build time, which fails without network access.

## Front page fonts (`fonts/asc/`)

The AutoSalesCity front page (`components/asc/asc.css`) loads three variable fonts with plain `@font-face`, latin subset
only, unmodified from the upstream releases as published by the `@fontsource-variable/*` npm packages (5.3.0):

| File | Family | Upstream | Licence |
|---|---|---|---|
| `fonts/asc/space-grotesk-latin-wght-normal.woff2` | Space Grotesk (300–700) | https://github.com/floriankarsten/space-grotesk | SIL Open Font License 1.1 |
| `fonts/asc/inter-latin-wght-normal.woff2` | Inter (100–900) | https://github.com/rsms/inter | SIL Open Font License 1.1 (`OFL-inter.txt`) |
| `fonts/asc/jetbrains-mono-latin-wght-normal.woff2` | JetBrains Mono (100–800) | https://github.com/JetBrains/JetBrainsMono | SIL Open Font License 1.1 (`OFL-jetbrains-mono.txt`) |
