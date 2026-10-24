# How to use Perdana Island

## Open and close

- Click the compact island at the top center to open it.
- When a media player or focus timer is active, hover over the island to open its page.
- Select a page from the tab bar. With the island open, use **Left / Right** to switch pages.
- Press **Escape** or click outside the panel to close it.

## Music

The Music page reads active players through MPRIS. It can show the title, artist, artwork, elapsed and total time, and playback controls. Click the progress bar to seek. Previous, Play/Pause, and Next are available when the active player exposes those capabilities. Some browsers only publish media after playback has started.

## Focus

1. Choose **Focus**, **Short**, **Long**, or **Custom**.
2. For a custom session, enter a number, toggle the unit between seconds and minutes, then select **Apply**.
3. Select **Start**. The compact island shows the remaining time; hovering opens the Focus page.
4. Pause/resume, reset, or skip the current timer with its controls. When the timer finishes, a short completion notice appears.

Custom durations accept 1–86,400 seconds or 1–1,440 minutes. The page counts completed focus sessions for the current session.

## Shelf

Select **Add files** to copy chosen files into Shelf. Use the folder button to open the Shelf directory. Files copied into that folder appear in Shelf automatically.

GNOME Shell does not expose the desktop's dragged file list to the island actors. Direct drag-and-drop onto the island is unsupported.

## To-do

Use **Add task** to create an item. Select its check control to mark it complete or incomplete. Select **Edit** to show task deletion controls. The list is saved to `~/.local/share/perdana.island/tasks.json`.

## Clipboard

Open the Clipboard page to collect recent text copies. Select a row to copy it again and use its delete control to remove it. Sampling happens only while this page is open. Up to four entries are saved locally and restored after sign-out or an extension update. Entries marked sensitive by MIME type are skipped.

## Today and system notices

Today shows the local date and available CPU, memory, disk, and battery readings. Plugging in or removing the charger and changing output volume can show a brief system notice. Notices close automatically.

## Data location

Tasks, clipboard history, and Shelf files are in `~/.local/share/perdana.island/`. Task changes are also synchronized to `~/.local/share/pulo-island/tasks.json` for compatibility with the previous extension UUID. Task data from either location is reconciled on enable; Shelf files are copied from the previous location when a matching file is not already present.
