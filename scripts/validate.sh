#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

fail() {
    printf 'validate: %s\n' "$1" >&2
    exit 1
}

command -v node >/dev/null 2>&1 || fail 'node is required'
command -v python3 >/dev/null 2>&1 || fail 'python3 is required'
command -v glib-compile-schemas >/dev/null 2>&1 || fail 'glib-compile-schemas is required'

for file in extension/*.js; do
    node --check "$file"
done

python3 scripts/check-gi-imports.py

for file in package.json extension/metadata.json plasma-widget/metadata.json; do
    python3 -m json.tool "$file" >/dev/null || fail "invalid JSON: $file"
done

glib-compile-schemas --strict extension/schemas
npm test

GNOME_VERSION_NAME="$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1])).get("version-name", ""))' extension/metadata.json)"
GNOME_VERSION="${GNOME_VERSION_NAME#v}"
PLASMA_VERSION="$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["KPlugin"]["Version"])' plasma-widget/metadata.json)"

[[ "$GNOME_VERSION_NAME" =~ ^v[0-9]+([.][0-9]+)?$ ]] || fail "GNOME version-name must look like v<number>[.<patch>], got '$GNOME_VERSION_NAME'"
[[ "$PLASMA_VERSION" =~ ^[0-9]+$ ]] || fail "KDE version must be numeric, got '$PLASMA_VERSION'"

./scripts/package-release.sh "v$GNOME_VERSION"
./scripts/package-release.sh "plasma-v$PLASMA_VERSION"

python3 - "dist/Perdana-Island-GNOME-v${GNOME_VERSION}.shell-extension.zip" \
    "dist/Perdana-Island-KDE-Plasma-v${PLASMA_VERSION}.zip" <<'PY'
import sys
import zipfile

gnome_required = {
    'metadata.json',
    'extension.js',
    'clipboard-utils.js',
    'music-classifier.js',
    'progress-utils.js',
    'quick-capture.js',
    'backup-utils.js',
    'stylesheet.css',
    'LICENSE',
    'assets/google-chat.png',
    'assets/browsers/browser-edge.svg',
    'schemas/org.gnome.shell.extensions.perdana-island.gschema.xml',
    'schemas/gschemas.compiled',
}
kde_required = {'metadata.json', 'contents/ui/main.qml'}

for archive, required in ((sys.argv[1], gnome_required), (sys.argv[2], kde_required)):
    with zipfile.ZipFile(archive) as package:
        names = set(package.namelist())
    missing = sorted(required - names)
    if missing:
        raise SystemExit(f'{archive}: missing {", ".join(missing)}')
    if archive == sys.argv[1] and any(name.startswith('screenshots/') for name in names):
        raise SystemExit(f'{archive}: contains preview screenshots')

print('validate: GNOME and KDE package contents verified independently')
PY

printf 'validate: OK (GNOME v%s, KDE v%s)\n' "$GNOME_VERSION" "$PLASMA_VERSION"
