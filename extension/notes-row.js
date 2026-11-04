import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {noteDateText, notePreview, noteTitle} from './note-domain.js';
import {attachButtonMotion, makeLabel} from './ui-controls.js';

export const NOTE_ROW_HEIGHT = 44;
export const NOTE_ROW_GAP = 6;

export function createNoteRow(note, {contentWidth, selected = false, onSelect} = {}) {
    const innerWidth = Math.max(1, contentWidth - 18);
    const rowBox = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'perdana-island__note-row-content',
    });
    rowBox.set_size(innerWidth, 32);
    const topRow = new St.BoxLayout({style_class: 'perdana-island__note-row-top'});
    topRow.set_size(innerWidth, 16);
    const title = makeLabel(noteTitle(note), 'perdana-island__note-title');
    title.x_expand = true;
    const date = makeLabel(noteDateText(note.updatedAt), 'perdana-island__note-date');
    date.x_align = Clutter.ActorAlign.END;
    topRow.add_child(title);
    topRow.add_child(date);
    const preview = makeLabel(notePreview(note), 'perdana-island__note-preview');
    preview.x_expand = true;
    preview.set_size(innerWidth, 14);
    rowBox.add_child(topRow);
    rowBox.add_child(preview);
    const button = new St.Button({
        child: rowBox,
        can_focus: true,
        reactive: true,
        track_hover: true,
        style_class: selected
            ? 'perdana-button perdana-island__note-row perdana-island__note-row--active'
            : 'perdana-button perdana-island__note-row',
        accessible_name: `Note: ${noteTitle(note)}`,
    });
    button.connect('clicked', () => onSelect?.(note.id));
    attachButtonMotion(button, {hoverScale: 1.012, pressScale: 0.985});
    button.set_size(contentWidth, NOTE_ROW_HEIGHT);
    return {button, title, preview, date};
}
