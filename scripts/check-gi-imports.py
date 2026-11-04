#!/usr/bin/env python3
"""Fail when a runtime module uses a GNOME global without importing it.

Comments are stripped first so JSDoc type references do not count.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

GLOBALS = {
    "Cairo": ("cairo",),
    "Clutter": ("gi://Clutter",),
    "Gio": ("gi://Gio",),
    "GLib": ("gi://GLib",),
    "GObject": ("gi://GObject",),
    "Gvc": ("gi://Gvc",),
    "Main": ("resource:///org/gnome/shell/ui/main.js",),
    "Meta": ("gi://Meta",),
    "Pango": ("gi://Pango",),
    "Shell": ("gi://Shell",),
    "Soup": ("gi://Soup",),
    "St": ("gi://St",),
}

BLOCK = re.compile(r"/\*.*?\*/", re.S)
LINE = re.compile(r"(?m)(?:^|(?<=\s))//[^\n]*")
IMPORT = re.compile(r"^\s*import\b", re.M)


def code_only(text: str) -> str:
    return LINE.sub("", BLOCK.sub("", text))


def main() -> int:
    failures: list[str] = []
    for path in sorted(Path("extension").glob("*.js")):
        text = code_only(path.read_text(encoding="utf-8"))
        imports = "\n".join(
            line for line in text.splitlines() if IMPORT.match(line)
        )
        for name, sources in GLOBALS.items():
            if not re.search(rf"\b{name}\.", text):
                continue
            if any(source in imports for source in sources):
                continue
            failures.append(f"{path}: uses {name} without importing it")
    if failures:
        print("\n".join(failures))
        return 1
    print(f"GI imports verified in {len(list(Path('extension').glob('*.js')))} runtime modules")
    return 0


if __name__ == "__main__":
    sys.exit(main())
