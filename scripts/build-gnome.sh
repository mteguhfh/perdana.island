#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION_NAME="$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1])).get("version-name", ""))' "$PROJECT_ROOT/extension/metadata.json")"

if [[ ! "$VERSION_NAME" =~ ^v[0-9]+$ ]]; then
    printf 'Invalid GNOME version-name in extension/metadata.json: %s\n' "$VERSION_NAME" >&2
    exit 1
fi

"$PROJECT_ROOT/scripts/package-release.sh" "$VERSION_NAME"
