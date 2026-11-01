# GNOME Extensions submission

Perdana Island targets GNOME Shell 50 and 51. Its package is built independently from the KDE Plasma widget and contains only the GNOME extension, runtime assets, compiled schema, and GPL license.

## Build and inspect the ZIP

From the repository root:

```sh
./scripts/build-gnome.sh
unzip -l ./dist/Perdana-Island-GNOME-v79.shell-extension.zip
```

The ZIP root should contain `metadata.json`, `extension.js`, the JavaScript helper modules, `stylesheet.css`, `assets/`, the settings schema XML and `gschemas.compiled`, plus `LICENSE`. It must not contain the repository's screenshots, tests, build scripts, HTML mockups, or KDE package.

Before upload, run the GNOME Extensions static analyzer against the folder or ZIP:

```sh
python3 -m venv .venv-shexli
. .venv-shexli/bin/activate
python -m pip install --upgrade shexli
shexli ./dist/Perdana-Island-GNOME-v79.shell-extension.zip
```

Review every finding against the source. During v79 preparation, Shexli 0.2.1 exited with a segmentation fault under Python 3.14 before returning findings, so that run is inconclusive and is not treated as a pass. Re-run it with a supported Python runtime before submitting.

Clipboard access is a core feature and is declared in the extension description. Clipboard changes are observed while the extension is enabled; unique entries are stored locally with sensitive values masked or skipped. Clipboard text is not sent to third parties. LRCLIB lyric lookup sends the current track title, artist, optional album, and duration to `lrclib.net`.

## Upload

Upload the GNOME ZIP through the [GNOME Extensions developer form](https://extensions.gnome.org/upload/). GNOME controls the submission `version`; `version-name` is the project's display label. The package declares GNOME Shell 50 and 51 support and links to this repository for source and issue reports.

The site sends the review result by email. Local checks do not guarantee approval; the final decision belongs to GNOME Extensions reviewers. Distributed extension content is also subject to the [GNOME Code of Conduct](https://conduct.gnome.org/).

## Compliance notes

- The extension is licensed under GPL-3.0-or-later, compatible with GNOME Shell's GPL-2.0-or-later terms.
- The package contains no helper scripts, preview pages, or development-only folders.
- Fedora Linux 44 with GNOME Shell 50.6 on Wayland and Ubuntu 26.10 with GNOME Shell 51.0 have previously passed smoke checks. Other distributions and X11 have not been independently runtime-tested for v79.
