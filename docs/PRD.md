# Product requirements: Perdana Island

## Summary

Perdana Island is a GNOME Shell extension that presents media controls and desktop information in a single top-attached island. It has compact resting, media, and focus states, plus an expanded panel whose pages share one stable frame.

## Users and goals

The extension is for GNOME users who want quick media controls and short focus sessions without opening a separate utility window. Its goals are to:

1. Provide compact resting and active states with clear visual feedback.
2. Keep page content inside the rounded island as it changes between states.
3. Make media and focus controls usable directly from the island.
4. Store tasks and Shelf files locally and migrate previous user data safely.
5. Run on GNOME Shell 50.x across Linux distributions that package that Shell version.

## Scope

### Island states

- **Resting:** centered and attached to the top edge; pointer-aware eyes reveal a clock on hover.
- **Playing / focus active:** compact wider state; media shows artwork and an animated equalizer, or an active timer shows its remaining time.
- **Open:** one fixed-size black panel with date/time header, page viewport, and icon tab bar. Transitions respect the desktop reduced-motion setting.
- Escape, outside click, and the close interaction dismiss the panel. Hover opens Music while media is playing.

### Pages and notices

- **Music:** MPRIS metadata, artwork, position, seek, previous, play/pause, and next.
- **Focus:** Focus, Short, Long, and custom durations; Start/Pause, Reset, and Skip; completion notice and daily session count.
- **Shelf:** file chooser, local file copy, open-folder action, and refresh after filesystem changes.
- **To-do:** add, complete, and delete tasks; persist the list as JSON.
- **Clipboard:** collect recent text only while the page is open, skip sensitive MIME types, allow recopy and delete, and keep the history in memory.
- **Today:** local date plus available processor, memory, disk, and battery metrics.
- **System notices:** charger connect/disconnect and output-volume changes; each notice dismisses automatically.

## Data and upgrade behavior

- New data directory: `$XDG_DATA_HOME/perdana.island` (normally `~/.local/share/perdana.island`).
- On first enable, copy tasks and files under `shelf/` from the former `pulo-island` data directory only when the corresponding destination does not exist.
- Do not delete or overwrite the old data during migration.

## Platform and architecture

- GNOME Shell 50.x, GJS, St, Clutter, Gio, GLib, Pango, Gvc, and GNOME Shell volume status integration.
- MPRIS on the current user's session D-Bus for media controls.
- Development runtime validated on Fedora Linux 44, GNOME Shell 50.6, Wayland.
- Ubuntu 26.04 LTS and Debian testing (Forky) have GNOME Shell 50.x packages; runtime validation on those systems remains outstanding.
- Non-GNOME desktops and GNOME Shell versions outside 50.x are out of scope for this release.

## Constraints

GNOME Shell's internal volume module and bundled Gvc API are tied to Shell releases and need a compatibility review before targeting another major version. GNOME Shell actors do not receive the desktop file list for direct drop onto the island, so file selection or copying into the Shelf folder is required. Clipboard history is deliberately transient.
