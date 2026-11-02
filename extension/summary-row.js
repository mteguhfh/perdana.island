import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {makeLabel, place} from './ui-controls.js';

export function createSummaryRow(row, {icon, width, height, titleWidth, onOpen} = {}) {
    const content = new St.Widget({
        layout_manager: new Clutter.FixedLayout(),
    });
    content.set_size(width, height);
    const card = new St.Button({
        child: content,
        can_focus: true,
        reactive: true,
        track_hover: true,
        style_class: `perdana-button perdana-island__summary-row${row.live ? ' perdana-island__summary-row--live' : ''}`,
        accessible_name: `${row.title}: ${row.sub}. ${row.value}`,
    });
    const title = makeLabel(row.title, 'perdana-island__summary-row-title');
    const subtitle = makeLabel(row.sub, 'perdana-island__summary-row-sub');
    const value = makeLabel(row.value, 'perdana-island__summary-row-value');
    value.clutter_text.x_align = Clutter.ActorAlign.END;
    place(content, icon, 13, Math.round((height - 18) / 2), 18, 18);
    place(content, title, 42, Math.round(height / 2) - 15, titleWidth, 16);
    place(content, subtitle, 42, Math.round(height / 2) + 1, titleWidth, 15);
    place(content, value, width - 79, Math.round((height - 16) / 2), 67, 16);
    card.connect('clicked', () => onOpen?.(row.key));
    return {card, title, subtitle, value};
}
