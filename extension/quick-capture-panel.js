// Quick Capture panel. Draft, save, and navigation state stay in extension.js.
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {makeLabel, makeTextButton, place} from './ui-controls.js';

export function renderQuickCapturePanel(body, {
    width,
    draft = '',
    onDraftChanged = () => {},
    onClose = () => {},
    onSave = () => {},
} = {}) {
    const closeWidth = Math.min(70, Math.max(54, Math.round(width * 0.16)));
    place(body, makeLabel('Quick capture', 'perdana-island__todo-heading'), 0, 6,
        Math.max(1, width - closeWidth - 10), 22);
    place(body, makeTextButton('Close', 'Close quick capture',
        () => onClose(), 'perdana-island__clipboard-action'),
    width - closeWidth, 4, closeWidth, 24);

    const entry = new St.Entry({
        hint_text: 'telepon ibu besok jam 5 penting',
        text: draft,
        can_focus: true,
        style_class: 'perdana-island__task-entry',
    });
    entry.clutter_text.connect('text-changed', () => onDraftChanged(entry.get_text()));
    entry.clutter_text.connect('key-press-event', (_actor, event) => {
        const key = event.get_key_symbol();
        const ctrl = (event.get_state() & Clutter.ModifierType.CONTROL_MASK) !== 0;
        if (key === Clutter.KEY_Escape) {
            onClose();
            return Clutter.EVENT_STOP;
        }
        if (key === Clutter.KEY_Return || key === Clutter.KEY_KP_Enter) {
            onSave(ctrl);
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    });
    place(body, entry, 0, 38, width, 32);

    const preview = new St.Widget({
        layout_manager: new Clutter.FixedLayout(),
        style_class: 'perdana-island__capture-preview',
    });
    place(body, preview, 0, 76, width, 42);

    const statusLabel = makeLabel('', 'perdana-island__muted perdana-island__capture-status');
    place(body, statusLabel, 0, 120, width, 14);

    const renderPreview = chips => {
        for (const child of preview.get_children())
            child.destroy();
        if (width <= 0)
            return;

        let x = 0;
        let row = 0;
        const rowHeight = 20;
        const rowGap = 2;
        const gap = 6;
        const titleLimit = Math.min(250, Math.max(120, Math.round(width * 0.52)));
        for (const [index, chip] of chips.entries()) {
            const chipStyle = chip.style ? ` perdana-island__capture-chip--${chip.style}` : '';
            const label = makeLabel(chip.text, `perdana-island__capture-chip${chipStyle}`);
            label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            const naturalWidth = Math.max(40, chip.text.length * 6 + 18);
            const chipWidth = Math.min(width, index === 1 ? titleLimit : naturalWidth);
            if (x > 0 && x + chipWidth > width) {
                row++;
                x = 0;
            }
            if (row > 1)
                break;
            place(preview, label, x, row * (rowHeight + rowGap), chipWidth, rowHeight);
            x += chipWidth + gap;
        }
    };

    const setStatus = (text, isError = false) => {
        statusLabel.text = text;
        if (isError)
            statusLabel.add_style_class_name('perdana-island__capture-status--error');
        else
            statusLabel.remove_style_class_name('perdana-island__capture-status--error');
    };

    const actionGap = 8;
    const actionWidth = Math.min(84, Math.max(64, Math.floor((width - actionGap) / 2)));
    const actionsWidth = actionWidth * 2 + actionGap;
    const actionsX = Math.max(0, width - actionsWidth);
    place(body, makeTextButton('Add task', 'Add task',
        () => onSave(false), 'perdana-island__color-apply'),
    actionsX, 136, actionWidth, 30);
    place(body, makeTextButton('Save note', 'Save note',
        () => onSave(true), 'perdana-island__color-apply'),
    actionsX + actionWidth + actionGap, 136, actionWidth, 30);
    entry.grab_key_focus();

    return {entry, preview, statusLabel, renderPreview, setStatus};
}
