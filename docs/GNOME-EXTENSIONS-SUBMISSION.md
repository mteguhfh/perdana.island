# GNOME Extensions submission

Perdana Island's GNOME package targets GNOME Shell 50 and is prepared as a separate upload from the KDE Plasma widget. The ZIP built by `gnome-extensions pack` contains only the extension metadata, JavaScript, stylesheet, and GPL license.

## Build and check the ZIP

From the repository root:

```sh
gnome-extensions pack ./extension --extra-source=./LICENSE --out-dir ./dist
unzip -l ./dist/perdana.island@perdana.shell-extension.zip
```

The archive root should contain `metadata.json`, `extension.js`, `stylesheet.css`, and `LICENSE`. Do not upload the KDE package or repository development files.

Run Shexli before uploading:

```sh
virtualenv venv
. venv/bin/activate
pip install -U shexli
shexli ./dist/perdana.island@perdana.shell-extension.zip
```

Review every warning manually. Clipboard access is a core feature and is declared in the extension description. It runs only while the Clipboard page is open, stores entries locally, and does not share them with third parties. LRCLIB lyric lookup sends the current track title, artist, optional album, and duration to `lrclib.net`.

## Upload

Upload the GNOME ZIP through the [GNOME Extensions developer form](https://extensions.gnome.org/upload/). GNOME controls the submission `version`; `version-name` is the project's display label. The package declares only stable GNOME Shell 50 support and links to this repository for source and issue reports.

The site sends the review result by email. Local static checks do not guarantee approval; the final decision belongs to GNOME Extensions reviewers. Distributed extension content is also subject to the [GNOME Code of Conduct](https://conduct.gnome.org/).

## Compliance notes

- The extension is licensed under GPL-3.0-or-later, which is compatible with GNOME Shell's GPL-2.0-or-later terms.
- The ZIP has no helper scripts, binaries, preview pages, or development-only folders.
- The tested environment is Fedora Linux 44, GNOME Shell 50.6 on Wayland. Other GNOME Shell 50 distributions and X11 have not been independently runtime-tested.
- Shexli may report advisories for direct clipboard access (manual review), small synchronous reads of user data and Linux `/proc`/`sysfs`, and signal handlers attached to actors destroyed with the extension's root widget. Review these against the source before each upload.
