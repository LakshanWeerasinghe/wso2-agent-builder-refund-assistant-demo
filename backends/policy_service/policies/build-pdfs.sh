#!/usr/bin/env bash
# Renders the policy documents in source/ to PDF with headless Chrome.
#   source/*.html             -> pdf/*.pdf          (the policy register)
#   source/demo-upload/*.html -> demo-upload/*.pdf  (uploaded live during the demo)
# Usage: ./build-pdfs.sh [DOCUMENT-ID ...]   (no arguments renders everything)
# Set CHROME to the Chrome or Chromium binary if it is not in the default macOS location.
set -euo pipefail

cd "$(dirname "$0")"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
mkdir -p pdf demo-upload

render() {
  local src="$1" out="$2"
  "$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --log-level=3 \
    --print-to-pdf="$out" "file://$PWD/$src" >/dev/null 2>&1
  echo "Rendered $out"
}

wanted() {
  [[ $# -eq 1 ]] && return 0
  local id="$1"; shift
  for w in "$@"; do [[ "$w" == "$id" ]] && return 0; done
  return 1
}

for src in source/*.html; do
  id="$(basename "$src" .html)"
  if wanted "$id" "$@"; then render "$src" "pdf/$id.pdf"; fi
done
for src in source/demo-upload/*.html; do
  [[ -e "$src" ]] || continue
  id="$(basename "$src" .html)"
  if wanted "$id" "$@"; then render "$src" "demo-upload/$id.pdf"; fi
done
