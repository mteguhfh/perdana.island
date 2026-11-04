import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {formatClockTime, parseClockTime} from './island-domain.js';
import {attachButtonMotion, makeIconButton, makeLabel, makeTextButton} from './ui-controls.js';

export function createTaskRow(task, {todayKey, listWidth, editing, onToggle, onSetTime,
    onCyclePriority, onRemove} = {}) {
    const rowHeight = 36;
    const row = new St.BoxLayout({style_class: task.done
        ? 'perdana-island__task-row perdana-island__task-row--done'
        : 'perdana-island__task-row'});
    row.set_size(listWidth, rowHeight);
    const marker = new St.Bin({
        child: task.done ? new St.Icon({icon_name: 'object-select-symbolic', style_class: 'perdana-island__task-check'}) : null,
        style_class: task.done
            ? 'perdana-island__task-marker perdana-island__task-marker--done'
            : 'perdana-island__task-marker',
    });
    const checkbox = new St.Button({
        child: marker, can_focus: true, reactive: true, track_hover: true,
        style_class: 'perdana-button perdana-island__task-check-button',
        accessible_name: task.done ? 'Uncheck ' + task.text : 'Complete ' + task.text,
    });
    checkbox.connect('clicked', () => onToggle(task.id));
    attachButtonMotion(checkbox, {hoverScale: 1.09, pressScale: 0.91});
    row.add_child(checkbox);
    const label = makeLabel(task.text, task.done
        ? 'perdana-island__task-text perdana-island__task-text--done'
        : 'perdana-island__task-text');
    label.x_expand = true;
    row.add_child(label);

    const scheduled = typeof task.dueDate === 'string';
    const timed = scheduled && Number.isInteger(task.due);
    const late = scheduled && !task.done && task.dueDate < todayKey;
    const dateText = scheduled && (task.dueDate !== todayKey || !timed)
        ? (task.dueDate === todayKey ? 'Today' : new Intl.DateTimeFormat('en-GB', {day: '2-digit', month: 'short'})
            .format(new Date(`${task.dueDate}T00:00:00`))) + (timed ? ' ' : '') : '';
    const scheduleText = scheduled
        ? `${late ? 'Late ' : ''}${dateText}${timed ? formatClockTime(task.due) : ''}`.trim() : '';
    const chipWidth = scheduled ? Math.max(44, scheduleText.length * 6 + 14) : 0;
    const priorityWidth = task.priority ? 42 : 0;

    if (editing) {
        const timeEntry = new St.Entry({
            text: timed ? formatClockTime(task.due) : '', hint_text: '--:--', can_focus: true,
            style_class: 'perdana-island__task-time-entry', accessible_name: 'Time for ' + task.text,
        });
        timeEntry.clutter_text.connect('activate', () => {
            const value = timeEntry.get_text().trim();
            if (!value) {
                onSetTime(task.id, null);
                return;
            }
            const minutes = parseClockTime(value);
            if (minutes === null) {
                timeEntry.add_style_class_name('perdana-island__task-entry--invalid');
                return;
            }
            onSetTime(task.id, minutes);
        });
        timeEntry.clutter_text.connect('key-press-event', (_actor, event) => {
            if (event.get_key_symbol() !== Clutter.KEY_Escape)
                return Clutter.EVENT_PROPAGATE;
            timeEntry.set_text(timed ? formatClockTime(task.due) : '');
            return Clutter.EVENT_STOP;
        });
        row.add_child(timeEntry);
        row.add_child(makeTextButton(task.priority ? {high: 'High', medium: 'Med', low: 'Low'}[task.priority] : 'Prio',
            'Cycle priority for ' + task.text, () => onCyclePriority(task.id),
            `perdana-island__task-priority-button${task.priority ? ` perdana-island__task-priority-button--${task.priority}` : ''}`));
        row.add_child(makeIconButton('user-trash-symbolic', 'Delete ' + task.text,
            () => onRemove(task.id), 'perdana-button--task-delete'));
        label.clutter_text.max_width = Math.max(60, listWidth - 24 - 7 - 52 - 44 - 18 - 14);
    } else {
        if (scheduled) {
            const timeLabel = makeLabel(`${late ? 'Late ' : ''}${dateText}${timed ? formatClockTime(task.due) : ''}`,
                `perdana-island__task-time${late ? ' perdana-island__task-time--late' : ''}`);
            timeLabel.x_align = Clutter.ActorAlign.CENTER;
            row.add_child(timeLabel);
        }
        if (task.priority) {
            const priorityLabel = makeLabel({high: 'High', medium: 'Med', low: 'Low'}[task.priority],
                `perdana-island__task-priority perdana-island__task-priority--${task.priority}`);
            priorityLabel.x_align = Clutter.ActorAlign.CENTER;
            row.add_child(priorityLabel);
        }
        label.clutter_text.max_width = Math.max(60, listWidth - 24 - 7 - chipWidth - priorityWidth - 12);
    }
    return row;
}
