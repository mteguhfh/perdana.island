# Install Perdana Island

## Requirements

- GNOME Shell 50 or 51.
- `gnome-extensions`, `glib-compile-schemas`, and Python 3 for the local build script.

## Build and install

From the project root, build the package and install the generated archive:

```sh
./scripts/package-release.sh v79
gnome-extensions install --force ./dist/Perdana-Island-GNOME-v79.shell-extension.zip
gnome-extensions enable perdana.island@perdana
```

The script reads the GNOME version from `extension/metadata.json`, compiles the settings schema, and packages the extension with its runtime assets and license. It writes `dist/Perdana-Island-GNOME-v79.shell-extension.zip`. KDE packaging uses its own version and is not part of this command.

If Perdana Island was already enabled, GNOME may still have the previous extension code loaded in memory. On Wayland, loading the newly installed code can require ending the desktop session and signing in again. The installer does not do that automatically.

## Update or remove

To update, run the build and install commands again. To remove the extension:

```sh
gnome-extensions disable perdana.island@perdana
gnome-extensions uninstall perdana.island@perdana
```

Disabling the extension does not delete tasks, notes, preferences, clipboard history, or Shelf files. They remain under `~/.local/share/perdana.island/`.

## Local-only build

The generated archive is a local build. Publishing it to GitHub or GNOME Extensions is a separate release action.
