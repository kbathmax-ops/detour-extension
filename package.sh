#!/usr/bin/env bash
# Builds the Chrome Web Store upload zip.
#
# An allowlist, not an ignore list. The repo carries design sources and tests
# that must not ship, and an ignore list silently starts shipping anything
# added later that nobody remembered to exclude.
set -euo pipefail
cd "$(dirname "$0")"

node test/detect.test.mjs > /dev/null || { echo "tests failed — not packaging"; exit 1; }

VERSION=$(node -p "require('./manifest.json').version")
OUT="dist/detour-${VERSION}.zip"
rm -rf dist && mkdir -p dist

zip -q -r "$OUT" \
  manifest.json \
  popup.html popup.js \
  src/us-airports.js src/core.js src/sites.js src/content.js src/detour.css \
  icons/icon16.png icons/icon32.png icons/icon48.png icons/icon128.png \
  icons/wordmark-512.png

echo "$OUT"
unzip -Z1 "$OUT" | sed "s/^/  /"
