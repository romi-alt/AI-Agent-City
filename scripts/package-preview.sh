#!/usr/bin/env bash
# Builds the public preview (landing page and 3D city, no backend) as a self-contained Next.js server and zips it
# for upload to a Node.js host. Usage: scripts/package-preview.sh <public origin> <output zip>
# The zip holds a prebuilt server: the host only runs `npm start`, it never installs the workspace.
set -euo pipefail

ORIGIN="${1:?public origin, e.g. https://example.com}"
OUT="${2:?output zip path}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="$ROOT/apps/web"

rm -rf "$WEB/.next"
(cd "$WEB" && NEXT_PUBLIC_PUBLIC_PREVIEW=true PUBLIC_ORIGIN="$ORIGIN" NEXT_TELEMETRY_DISABLED=1 npx next build)

STAGE="$(mktemp -d)"
# pnpm's layout is symlinks into node_modules/.pnpm, which zip archives and host-side extractors do not keep. Copy the
# standalone server without its node_modules, then flatten the store into one plain node_modules at the root (Node
# resolves upward from apps/web), one copy of each package. Python reads through the links, so this also works in Git
# Bash on Windows, where `cp -a` cannot recreate them.
python3 - "$WEB/.next/standalone" "$STAGE" <<'PY'
import os, shutil, sys
standalone, stage = sys.argv[1], sys.argv[2]
skip = {os.path.join(standalone, 'node_modules'), os.path.join(standalone, 'apps', 'web', 'node_modules')}
shutil.copytree(standalone, stage, symlinks=False, ignore_dangling_symlinks=True, dirs_exist_ok=True,
                ignore=lambda d, names: [n for n in names if os.path.join(d, n) in skip])
store = os.path.join(standalone, 'node_modules', '.pnpm')
flat = os.path.join(stage, 'node_modules')
os.makedirs(flat)
for entry in sorted(os.listdir(store)):
    nm = os.path.join(store, entry, 'node_modules')
    if not os.path.isdir(nm):
        continue
    for name in os.listdir(nm):
        names = [f'{name}/{s}' for s in os.listdir(os.path.join(nm, name))] if name.startswith('@') else [name]
        for pkg in names:
            src = os.path.realpath(os.path.join(nm, pkg))
            dst = os.path.join(flat, pkg)
            if os.path.isdir(src) and not os.path.exists(dst):
                shutil.copytree(src, dst, symlinks=False)
PY
cp -r "$WEB/.next/static" "$STAGE/apps/web/.next/static"
cp -r "$WEB/public" "$STAGE/apps/web/public"
# Next copies the native image resizer even with images.unoptimized; nothing in the preview loads it (~37 MB).
rm -rf "$STAGE"/node_modules/@img/sharp* "$STAGE"/node_modules/sharp
find "$STAGE" -name '*.map' -delete
if find "$STAGE" -type l | grep -q .; then
  echo "refusing to package: symlinks remain after flattening" >&2
  exit 1
fi
# The standalone package.json is the workspace's; the host only needs a start command.
cat > "$STAGE/package.json" <<'JSON'
{
  "name": "agentcity-public-preview",
  "private": true,
  "description": "Prebuilt Next.js standalone server for the AgentCity public preview (landing page and 3D city, no backend).",
  "engines": { "node": ">=22 <23" },
  "dependencies": { "next": "16.4.3", "react": "19.3.1", "react-dom": "19.3.1", "mysql2": "3.14.1" },
  "scripts": {
    "build": "echo prebuilt",
    "start": "NODE_ENV=production node apps/web/server.js"
  }
}
JSON
# The host runs `npm install` before starting. The exact versions above are already in node_modules, so npm keeps
# them; skipping optional packages stops it fetching native extras (image resizer, compiler) the server never loads.
printf 'omit=optional\nfund=false\naudit=false\n' > "$STAGE/.npmrc"
if grep -rqs "local-dev-only" "$STAGE"; then
  echo "refusing to package: a local development secret is in the build" >&2
  exit 1
fi
rm -f "$OUT"
(cd "$STAGE" && zip -qr -9 "$OUT" .)
rm -rf "$STAGE"
ls -la "$OUT"
