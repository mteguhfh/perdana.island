import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {makeTextButton} from './ui-controls.js';

const PRIORITY_LABELS = {high: 'High', medium: 'Med', low: 'Low'};

export function createTaskDraft({text = '', dueText = '', priority = null,
    onCyclePriority, onSubmit, onCancel} = {}) {
    const entry = new St.Entry({
        hint_text: 'Add a task',
        text,
        can_focus: true,
        style_class: 'perdana-island__task-entry',
        accessible_name: 'Task text',
    });
    const timeEntry = new St.Entry({
        hint_text: '09:00',
        text: dueText,
        can_focus: true,
        style_class: 'perdana-island__task-time-entry',
        accessible_name: 'Task time, 24 hour HH:MM',
    });
    const priorityButton = makeTextButton(
        priority ? PRIORITY_LABELS[priority] : 'Priority',
        'Cycle task priority',
        onCyclePriority,
        `perdana-island__task-priority-button${priority
            ? ` perdana-island__task-priority-button--${priority}` : ''}`
    );
    const addButton = makeTextButton('Add', 'Add task', onSubmit,
        'perdana-island__task-add');

    const handleEscape = (_actor, event) => {
        if (event.get_key_symbol() !== Clutter.KEY_Escape)
            return Clutter.EVENT_PROPAGATE;
        onCancel();
        return Clutter.EVENT_STOP;
    };
    entry.clutter_text.connect('activate', onSubmit);
    entry.clutter_text.connect('key-press-event', handleEscape);
    timeEntry.clutter_text.connect('activate', onSubmit);
    timeEntry.clutter_text.connect('key-press-event', handleEscape);

    return {entry, timeEntry, priorityButton, addButton};
}
