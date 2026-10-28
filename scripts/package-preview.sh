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
cp -a "$WEB/.next/standalone/." "$STAGE/"
cp -a "$WEB/.next/static" "$STAGE/apps/web/.next/static"
cp -a "$WEB/public" "$STAGE/apps/web/public"
# Next copies the native image resizer even with images.unoptimized; nothing in the preview loads it (~37 MB).
rm -rf "$STAGE"/node_modules/.pnpm/@img+sharp* "$STAGE"/node_modules/.pnpm/sharp@*
find "$STAGE" -name '*.map' -delete
# pnpm's layout is symlinks into node_modules/.pnpm, which zip archives and host-side extractors do not keep. Flatten
# it into one plain node_modules at the root (Node resolves upward from apps/web), one copy of each package.
python3 - "$STAGE" <<'PY'
import os, shutil, sys
stage = sys.argv[1]
root_nm = os.path.join(stage, 'node_modules')
store = os.path.join(root_nm, '.pnpm')
flat = os.path.join(stage, 'flat_node_modules')
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
shutil.rmtree(root_nm)
os.rename(flat, root_nm)
web_nm = os.path.join(stage, 'apps', 'web', 'node_modules')
if os.path.lexists(web_nm):
    shutil.rmtree(web_nm)
PY
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
  "dependencies": { "next": "16.4.3", "react": "19.3.1", "react-dom": "19.3.1" },
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
