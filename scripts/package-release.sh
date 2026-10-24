#!/usr/bin/env bash
set -euo pipefail

RELEASE_TAG="${1:-}"
if [[ ! "$RELEASE_TAG" =~ ^v[0-9]+$ ]]; then
    printf 'Usage: %s v<version>\n' "$0" >&2
    exit 2
fi

VERSION="${RELEASE_TAG#v}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GNOME_VERSION="$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["version"])' "$PROJECT_ROOT/extension/metadata.json")"
PLASMA_VERSION="$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["KPlugin"]["Version"])' "$PROJECT_ROOT/plasma-widget/metadata.json")"

if [[ "$GNOME_VERSION" != "$VERSION" || "$PLASMA_VERSION" != "$VERSION" ]]; then
    printf 'Release %s does not match package versions (GNOME %s, Plasma %s).\n' \
        "$RELEASE_TAG" "$GNOME_VERSION" "$PLASMA_VERSION" >&2
    exit 1
fi

if ! command -v zip >/dev/null 2>&1; then
    printf 'The zip utility is required to build the release archives.\n' >&2
    exit 1
fi

DIST_DIR="$PROJECT_ROOT/dist"
GNOME_ARCHIVE="$DIST_DIR/Perdana-Island-GNOME-${RELEASE_TAG}.shell-extension.zip"
PLASMA_ARCHIVE="$DIST_DIR/Perdana-Island-KDE-Plasma-${RELEASE_TAG}.zip"
mkdir -p "$DIST_DIR"
rm -f "$GNOME_ARCHIVE" "$PLASMA_ARCHIVE"

(cd "$PROJECT_ROOT/extension" && zip -qr "$GNOME_ARCHIVE" .)
(cd "$PROJECT_ROOT/plasma-widget" && zip -qr "$PLASMA_ARCHIVE" .)

printf 'Created release archives:\n%s\n%s\n' "$GNOME_ARCHIVE" "$PLASMA_ARCHIVE"
