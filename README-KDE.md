# Perdana Island for KDE Plasma

[![KDE Plasma 6](https://img.shields.io/badge/KDE%20Plasma-6-1d99f3?logo=kde&logoColor=white)](https://develop.kde.org/docs/plasma/widget/)
[![Qt Quick and QML](https://img.shields.io/badge/UI-Qt%20Quick%20%2B%20QML-41cd52?logo=qt&logoColor=white)](https://doc.qt.io/qt-6/qtquick-index.html)
[![Kirigami](https://img.shields.io/badge/components-Kirigami-1d99f3?logo=kde&logoColor=white)](https://develop.kde.org/docs/getting-started/kirigami/)
[![MPRIS](https://img.shields.io/badge/media-MPRIS%20over%20D--Bus-383838)](https://specifications.freedesktop.org/mpris-spec/latest/)

This is the KDE Plasma 6 port of Perdana Island. It is a native Plasma widget that can sit in a panel or on the desktop. It is maintained on the [`codex/kde-plasma` branch](https://github.com/txtperdana/perdana.island/tree/codex/kde-plasma); the default `main` branch contains the GNOME Shell extension.

## What the KDE version includes

- **Music** reads the active player's MPRIS metadata and provides playback, previous/next, and seeking controls.
- **Focus** offers Focus, Short, Long, and custom timers in seconds or minutes. A finished session appears in the island and sends a Plasma notification.
- **Tasks** supports adding, completing, and deleting tasks. The list is saved in the widget configuration.
- **Clipboard** keeps up to four recent plain-text entries. Entries can be copied again or deleted. A small heuristic skips text that resembles common labeled secrets or private-key blocks; it is not a complete secret detector.
- **Resting capsule** blinks and shows the clock when hovered.

The widget uses a compact panel representation and an expanded Plasma popup. It does not create the GNOME version's separate, centered top-edge overlay. It also does not follow the global pointer, auto-open when media starts, or include Shelf, system metrics, battery notices, or volume notices. Those features are not part of this KDE port yet.

No KDE runtime screenshots are published yet. The screenshots in the main README show the GNOME extension and do not represent this widget.

## Architecture

![KDE Plasma 6 applet](https://img.shields.io/badge/architecture-Plasma%206%20applet-1d99f3?logo=kde&logoColor=white)
![Qt Quick QML](https://img.shields.io/badge/UI-Qt%20Quick%20%2B%20QML-41cd52?logo=qt&logoColor=white)
![KConfig widget settings](https://img.shields.io/badge/persistence-Plasma%20widget%20configuration-555555)
![KNotifications](https://img.shields.io/badge/notifications-KNotifications-555555)

The applet is built with Qt Quick and QML using Plasma's compact and expanded representations. It reads media through Plasma's MPRIS QML model, stores tasks, clipboard history, and focus timer state in per-widget Plasma configuration, and uses KDE notifications when a focus session finishes. The package declares Plasma 6.0 as its minimum version, following KDE's [Plasma widget setup](https://develop.kde.org/docs/plasma/widget/setup/) guidance.

The media page imports `org.kde.plasma.private.mpris`. This is a Plasma-provided private QML module, so compatibility depends on that module being present in the installed Plasma build. The widget has not yet been runtime-validated across Plasma releases.

## Linux distribution compatibility

The package targets **KDE Plasma 6.0 or later**. It should be installable on a Linux distribution when its Plasma session provides the QML modules used by the applet and `kpackagetool6` is available. The current project environment has not runtime-tested the KDE widget on any distribution.

| Distribution family | Status |
| --- | --- |
| Fedora KDE Spin | Untested; requires Plasma 6 and the applet's QML modules. |
| KDE neon | Untested; requires Plasma 6 and the applet's QML modules. |
| Kubuntu | Untested; use a release that provides Plasma 6 and the applet's QML modules. |
| openSUSE | Untested; requires Plasma 6 and the applet's QML modules. |
| Arch Linux and derivatives | Untested; requires Plasma 6 and the applet's QML modules. |
| Other Linux distributions | Untested; should work when the same Plasma and QML requirements are met. |

These are compatibility targets, not confirmed distro support. KDE's [Plasma 6 porting guide](https://develop.kde.org/docs/plasma/widget/porting_kf6/) documents the metadata and API changes from Plasma 5.

## Install

Install the widget from the KDE branch:

```sh
git clone --branch codex/kde-plasma --single-branch https://github.com/txtperdana/perdana.island.git
cd perdana.island
kpackagetool6 --type=Plasma/Applet --install plasma-widget
```

Then enter panel or desktop edit mode, choose **Add Widgets**, search for **Perdana Island**, and place it. Click the capsule to open the pages. The timer, task list, and Clipboard history are stored in Plasma's widget configuration.

Remove it with:

```sh
kpackagetool6 --type=Plasma/Applet --remove perdana.island.plasma
```

Removing a Plasma applet may also remove its instance configuration. Save any task or clipboard content you need before removing it.

## References

- [KDE Plasma widget setup](https://develop.kde.org/docs/plasma/widget/setup/)
- [Porting Plasma widgets to KF6](https://develop.kde.org/docs/plasma/widget/porting_kf6/)
- [KDE notification QML type](https://api.kde.org/org-kde-notifications-qmlmodule.html)
- [MPRIS specification](https://specifications.freedesktop.org/mpris-spec/latest/)
