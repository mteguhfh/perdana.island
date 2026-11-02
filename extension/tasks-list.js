import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {createTaskRow} from './task-row.js';

export function createTasksList(tasks, {todayKey, listWidth, editing, onToggle,
    onSetTime, onCyclePriority, onRemove} = {}) {
    const rowHeight = 36;
    const rowGap = 7;
    const listHeight = tasks.length * (rowHeight + rowGap) - rowGap;
    const scroll = new St.ScrollView({
        overlay_scrollbars: false,
        style_class: 'perdana-island__task-scroll',
    });
    scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
    const list = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'perdana-island__task-list',
    });
    list.set_size(listWidth, listHeight);
    for (const task of tasks) {
        list.add_child(createTaskRow(task, {
            todayKey,
            listWidth,
            editing,
            onToggle,
            onSetTime,
            onCyclePriority,
            onRemove,
        }));
    }
    scroll.add_child(list);
    return scroll;
}
