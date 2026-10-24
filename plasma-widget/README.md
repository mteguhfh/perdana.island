# Perdana Island for KDE Plasma

This is the Plasma 6 branch of Perdana Island. It packages as a native Plasma widget and can be placed in a panel or on the desktop. The compact black capsule expands into a fixed-size island popup.

## Implemented pages

- **Music**: uses the Plasma MPRIS model for player metadata, album art, playback controls, and seeking.
- **Focus**: Focus, Short, Long, and custom timers in seconds or minutes. The end time is saved, so the countdown continues while the popup is closed. A completed timer sends a KDE notification.
- **Tasks**: add, complete, and delete tasks. The list is saved in the widget's Plasma configuration.
- **Clipboard**: records plain text only while this page is open, keeps the latest four entries, and supports copy-again and delete. It skips common labeled secret values and private-key blocks; this is a heuristic, not a complete secret detector. The history is saved in the widget's Plasma configuration.

Pages that need APIs not included in this first Plasma port, such as the file shelf and hardware metrics, are hidden. Charging and volume change notices are also not ported yet.

The compact eyes blink and reveal the clock on hover. This widget does not track the global pointer or automatically open when music starts. It opens from its position in the panel or desktop, rather than as a separate centered top-edge overlay.

## Requirements

- KDE Plasma 6
- KDE's MPRIS QML module for media controls
- `kpackagetool6` for command-line installation

## Install

From the repository root:

```sh
kpackagetool6 --type=Plasma/Applet --install plasma-widget
```

Then open **Edit Mode** on a Plasma panel or desktop, choose **Add Widgets**, search for **Perdana Island**, and place it where you want the capsule. Clicking it opens the island. Remove and re-add the widget after installing a newer package version.

## Remove

```sh
kpackagetool6 --type=Plasma/Applet --remove perdana.island.plasma
```

Tasks, clipboard history, and timer state live in Plasma's widget configuration. Removing the applet may remove that configuration with it.
