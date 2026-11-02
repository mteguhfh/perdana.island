import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {makeLabel, place} from './ui-controls.js';

export function createTodayTile({title, width, ring} = {}) {
    const tile = new St.Widget({
        layout_manager: new Clutter.FixedLayout(),
        style_class: 'perdana-island__today-tile',
    });
    const value = makeLabel('—', 'perdana-island__today-value');
    const detail = makeLabel('', 'perdana-island__today-detail');
    place(tile, ring, 8, 17, 34, 34);
    place(tile, makeLabel(title, 'perdana-island__today-title'), 47, 9, width - 51, 16);
    place(tile, value, 47, 25, width - 51, 22);
    place(tile, detail, 47, 48, width - 51, 16);
    return {tile, value, detail};
}
