#!/usr/bin/env bash
set -euo pipefail

RELEASE_TAG="${1:-}"
if [[ ! "$RELEASE_TAG" =~ ^v[0-9]+([.][0-9]+)?$ && ! "$RELEASE_TAG" =~ ^plasma-v[0-9]+$ ]]; then
    printf 'Usage: %s v<gnome-version>[.<patch>] | plasma-v<plasma-version>\n' "$0" >&2
    exit 2
fi

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$PROJECT_ROOT/dist"
mkdir -p "$DIST_DIR"

if ! command -v zip >/dev/null 2>&1; then
    printf 'The zip utility is required to build release archives.\n' >&2
    exit 1
fi

if [[ "$RELEASE_TAG" =~ ^v([0-9]+([.][0-9]+)?)$ ]]; then
    VERSION="${BASH_REMATCH[1]}"
    GNOME_VERSION_NAME="$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1])).get("version-name", ""))' "$PROJECT_ROOT/extension/metadata.json")"
    if [[ "$GNOME_VERSION_NAME" != "v$VERSION" ]]; then
        printf 'Release %s does not match GNOME version %s.\n' "$RELEASE_TAG" "$GNOME_VERSION_NAME" >&2
        exit 1
    fi

    SCHEMA_DIR="$PROJECT_ROOT/extension/schemas"
    if [[ -f "$SCHEMA_DIR/org.gnome.shell.extensions.perdana-island.gschema.xml" ]]; then
        if ! command -v glib-compile-schemas >/dev/null 2>&1; then
            printf 'glib-compile-schemas is required to package the GNOME settings schema.\n' >&2
            exit 1
        fi
        glib-compile-schemas --strict "$SCHEMA_DIR"
    fi

    GNOME_ARCHIVE="$DIST_DIR/Perdana-Island-GNOME-${RELEASE_TAG}.shell-extension.zip"
    rm -f "$GNOME_ARCHIVE"
    (cd "$PROJECT_ROOT/extension" && zip -qr "$GNOME_ARCHIVE" .)
    (cd "$PROJECT_ROOT" && zip -q "$GNOME_ARCHIVE" LICENSE)
    printf 'Created GNOME archive:\n%s\n' "$GNOME_ARCHIVE"
else
    VERSION="${RELEASE_TAG#plasma-v}"
    PLASMA_VERSION="$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["KPlugin"]["Version"])' "$PROJECT_ROOT/plasma-widget/metadata.json")"
    if [[ "$PLASMA_VERSION" != "$VERSION" ]]; then
        printf 'Release %s does not match KDE Plasma version %s.\n' "$RELEASE_TAG" "$PLASMA_VERSION" >&2
        exit 1
    fi

    PLASMA_ARCHIVE="$DIST_DIR/Perdana-Island-KDE-Plasma-v${VERSION}.zip"
    rm -f "$PLASMA_ARCHIVE"
    (cd "$PROJECT_ROOT/plasma-widget" && zip -qr "$PLASMA_ARCHIVE" .)
    printf 'Created KDE Plasma archive:\n%s\n' "$PLASMA_ARCHIVE"
fi
