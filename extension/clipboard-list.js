import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {maskClipboardPreview} from './clipboard-utils.js';
import {attachButtonMotion, makeIconButton, makeLabel} from './ui-controls.js';

export function createClipboardRow(item, {listWidth, onCopy, onDelete} = {}) {
    const preview = maskClipboardPreview(item);
    const hasMaskedValue = preview !== item;
    const row = new St.BoxLayout({style_class: 'perdana-island__clip-row'});
    row.set_size(listWidth, 32);
    row.x_expand = true;
    const contents = new St.BoxLayout({style_class: 'perdana-island__clip-contents'});
    contents.add_child(new St.Icon({icon_name: 'edit-copy-symbolic', style_class: 'perdana-island__icon'}));
    const label = makeLabel(preview, 'perdana-island__clip-text');
    label.clutter_text.max_width = Math.max(0, listWidth - 92);
    label.x_expand = true;
    contents.add_child(label);
    contents.x_expand = true;
    const button = new St.Button({
        child: contents,
        can_focus: true,
        reactive: true,
        track_hover: true,
        style_class: 'perdana-button perdana-island__clip-item',
        accessible_name: hasMaskedValue
            ? 'Copy masked email or link again'
            : 'Copy text again',
    });
    button.x_expand = true;
    button.set_height(32);
    button.connect('clicked', () => onCopy?.(item));
    attachButtonMotion(button, {hoverScale: 1.015, pressScale: 0.98});
    row.add_child(button);
    row.add_child(makeIconButton(
        'user-trash-symbolic',
        'Delete clipboard item',
        () => onDelete?.(item),
        'perdana-island__clip-delete'
    ));
    return row;
}

export function createClipboardList(items, {cardWidth, cardHeight, onCopy, onDelete} = {}) {
    const scroll = new St.ScrollView({
        overlay_scrollbars: false,
        style_class: 'perdana-island__clipboard-scroll',
    });
    scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
    scroll.set_position(8, 44);
    scroll.set_size(cardWidth - 16, Math.max(0, cardHeight - 52));
    const listWidth = Math.max(1, cardWidth - 36);
    const list = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'perdana-island__clip-list',
    });
    list.set_size(listWidth, Math.max(1, items.length * 34));
    for (const item of items) {
        list.add_child(createClipboardRow(item, {listWidth, onCopy, onDelete}));
    }
    scroll.add_child(list);
    return scroll;
}
