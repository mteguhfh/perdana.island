# Perdana Island

[![GNOME Shell 50 and 51](https://img.shields.io/badge/GNOME%20Shell-50%20%7C%2051-4a86cf?logo=gnome&logoColor=white)](https://extensions.gnome.org/)
[![GJS](https://img.shields.io/badge/runtime-GJS%20%2F%20JavaScript-f1e05a?logo=javascript&logoColor=111)](https://gjs.guide/)
[![St and Clutter](https://img.shields.io/badge/UI-St%20%2B%20Clutter-5267a8)](https://gnome.pages.gitlab.gnome.org/gnome-shell/st/)
[![MPRIS](https://img.shields.io/badge/media-MPRIS%20over%20D--Bus-383838)](https://specifications.freedesktop.org/mpris-spec/latest/)
[![Fedora 44](https://img.shields.io/badge/validated-Fedora%2044-51a2da?logo=fedora&logoColor=white)](https://fedoraproject.org/)

Perdana Island provides separate native packages for GNOME Shell and KDE Plasma. The GNOME Shell 50 and 51 extension places media controls, synced lyrics, a focus timer, a file shelf, tasks, recent clipboard text, notifications, settings, and system information in a compact island attached to the top edge of the desktop. The KDE Plasma 6 widget provides Music, Focus, Tasks, and Clipboard pages. Both packages live in this repository, in `extension/` and `plasma-widget/` respectively, and share the project release version while keeping their code and installation packages separate.

See [README-KDE.md](README-KDE.md) for KDE requirements, limitations, installation, and usage. Each GitHub release attaches one GNOME extension archive and one KDE Plasma widget archive. Install only the archive for your desktop environment.

## Latest release: v69

The GNOME package fixes clipboard previews for dotted email addresses, skips more labeled credential formats, and adds GNOME Shell 51 support. The KDE package records clipboard changes while the widget runs and skips KDE password-manager data. See the [v69 release notes](docs/releases/v69.md) for details.

## Feature previews

These images show representative UI states with sample content. Media, battery, and system values in a running extension come from the current desktop session.

| Feature | Preview |
| --- | --- |
| Resting island | ![Resting island with pointer eyes](assets/screenshots/resting.png) |
| Music controls | ![Music page with cover art, playback controls, and track progress](assets/screenshots/music.png) |
| Focus timer | ![Focus page with a custom 30 second timer](assets/screenshots/focus.png) |
| Shelf | ![Shelf page with files and Add files control](assets/screenshots/shelf.png) |
| To-do | ![To-do page with completion states and task actions](assets/screenshots/todo.png) |
| Clipboard | ![Clipboard history with copy and delete controls](assets/screenshots/clipboard.png) |
| Today | ![Today page with CPU, memory, disk, and battery indicators](assets/screenshots/today.png) |
| Charging notice | ![Charging notice with battery level](assets/screenshots/notice-charging.png) |
| Charger disconnected | ![Charger disconnected notice](assets/screenshots/notice-disconnected.png) |
| Volume notice | ![Output volume notice](assets/screenshots/notice-volume.png) |

## Features

- Resting eyes react to the pointer; hovering also reveals the clock.
- Playing media and a running focus timer appear in compact form. Hovering opens the matching page.
- Music uses MPRIS metadata and supports seeking, previous, play/pause, and next when the player exposes those controls.
- Lyrics follow playback timestamps. When a player does not provide synced lyrics, the extension looks up track metadata with LRCLIB.
- Focus offers Focus, Short, Long, and custom durations in seconds or minutes. Completion shows a temporary notice.
- Shelf offers Grid and List views, image thumbnails, a scrollable list capped at 10 visible items, and a local folder that refreshes when files change.
- To-do supports adding, completing, editing, and deleting tasks. Tasks persist between sessions.
- Clipboard keeps up to four recent text entries between sessions. It records changes while the extension is enabled, deduplicates repeated text and URLs, masks email addresses and links in previews, and skips explicitly identified credentials.
- Notifications can be cleared or activated to open their originating application. Settings control the resting style, glass effect, accent color, notices, and visible tabs.
- Today shows available CPU, memory, disk, and battery information.
- Charging, charger disconnect, and output-volume changes show short notices.

## Architecture

![GNOME Shell extension architecture badges](https://img.shields.io/badge/architecture-GNOME%20Shell%20extension-4a86cf?logo=gnome&logoColor=white)
![GJS ES modules](https://img.shields.io/badge/modules-GJS%20ES%20modules-f1e05a?logo=javascript&logoColor=111)
![GLib and Gio](https://img.shields.io/badge/system-GLib%20%2B%20Gio-555555)
![Gvc audio](https://img.shields.io/badge/audio-Gvc%20%2B%20Shell%20VolumeStatus-555555)

The extension runs inside GNOME Shell through the GJS `Extension` lifecycle. Its interface is built from Shell `St` actors and Clutter layouts/animations, attached to GNOME Shell's chrome layer. GLib and Gio provide timers, file access, and filesystem monitoring. Media metadata and playback controls use MPRIS on the session D-Bus; output volume uses GNOME's Gvc mixer API and Shell volume status module. CPU, memory, disk, and battery readings are collected from Linux system interfaces when available.

The GNOME extension declares GNOME Shell **50.x and 51.x** compatibility. This GNOME package does not run on KDE Plasma, Cinnamon, Xfce, or other desktop environments that do not use GNOME Shell. The separate KDE widget and its requirements are documented in [README-KDE.md](README-KDE.md).

| Distribution / release | GNOME Shell | Support status |
| --- | --- | --- |
| Fedora Linux 44 | 50.6 on the development system | Runtime validated on Wayland |
| Ubuntu 26.04 LTS | 50.1 package | Version checked; runtime not independently tested |
| Debian testing (Forky) | 50.4 package | Version checked; runtime not independently tested |
| Ubuntu 26.10 | 51.0 on the test system | Enable/disable, every page, notices, and preferences smoke-tested in a headless Wayland session |
| Other Linux distributions | GNOME Shell 50.x or 51.x required | Expected to work; not individually tested |

GNOME Shell 49 and earlier, and 52 or later, are outside the compatibility range declared by this release. Wayland is the validated session; X11 has not been independently tested.

## Install

See [Installation](docs/INSTALLATION.md) for requirements, build/install, update, removal, and troubleshooting steps.

Quick install from this repository:

```sh
mkdir -p dist
gnome-extensions pack ./extension --extra-source=../LICENSE --extra-source=clipboard-utils.js --out-dir ./dist
gnome-extensions install --force ./dist/perdana.island@perdana.shell-extension.zip
gnome-extensions enable perdana.island@perdana
```

## Platform packages and releases

The repository keeps each desktop implementation in its own directory. Release tags use one shared project version, while the release contains separate installable archives:

- `Perdana-Island-GNOME-v69.shell-extension.zip` for GNOME Shell and GNOME Extensions submission.
- `Perdana-Island-KDE-Plasma-v69.zip` for KDE Plasma 6.

The archive versions follow the tag and package metadata. Pushing a `v*` tag runs the release workflow, checks both package versions, compiles the GNOME settings schema, builds separate archives, and publishes the matching `docs/releases/<tag>.md` notes on GitHub. KDE installation and usage details are in [README-KDE.md](README-KDE.md). To prepare the v69 archives locally, run `./scripts/package-release.sh v69`.

## Use

Click the island to open it. When media or a focus timer is active, hovering over the island opens its page. Select a page from the tab bar. Press **Escape** or click outside to close it. See [How to use](docs/HOW-TO-USE.md) for each page's controls.

## Data and limitations

Tasks, preferences, clipboard history, and Shelf files are stored in `~/.local/share/perdana.island/`. Task data is reconciled with `~/.local/share/pulo-island/tasks.json` and synchronized to both locations, so changes survive switching between the old and new extension UUIDs. Shelf files are copied from the previous location when a matching destination file is absent. Clipboard history is stored locally with user-only permissions and limited to four unique entries. It is monitored while the extension is enabled; repeated copies do not create duplicate rows. Clipboard text is not sent to third parties. LRCLIB lyric lookup sends the current track title, artist, optional album, and duration to `lrclib.net`.

GNOME Shell does not provide the dragged desktop file list to these island actors. Add files through **Add files**, or copy them into the Shelf folder; direct drop onto the island is unavailable.

## Repository layout

```text
extension/                 GNOME Shell extension source
plasma-widget/             KDE Plasma 6 widget source and package metadata
assets/screenshots/        Feature preview images
docs/                      Product requirements, usage, and installation guides
README-KDE.md              KDE Plasma 6 widget guide
CONTRIBUTING.md            Development setup, tests, and contribution rules
.github/workflows/         Validation and release workflows
scripts/                   Local validation and release packaging scripts
```

The GNOME extension is distributed under [GPL-3.0-or-later](LICENSE), a license compatible with GNOME Shell's GPL-2.0-or-later terms. For the EGO package and submission checklist, see [GNOME Extensions submission](docs/GNOME-EXTENSIONS-SUBMISSION.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development loop, tests, packaging, and version rules. Use the issue templates for bug reports and feature requests.
