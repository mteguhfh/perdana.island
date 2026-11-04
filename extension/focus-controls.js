import St from 'gi://St';

import {
    attachButtonMotion, makeActionButton, makeLabel, makeTextButton, place,
} from './ui-controls.js';

export function createFocusModeButtons(body, {options, activeMode, x, width, gap = 8, onSelect} = {}) {
    const buttonWidth = (width - gap * (options.length - 1)) / options.length;
    options.forEach((option, index) => {
        const active = activeMode === option.mode;
        const button = makeTextButton(
            option.label,
            option.label + ' timer',
            () => onSelect?.(option),
            'perdana-button--segment' + (active ? ' perdana-button--segment-active' : '')
        );
        place(body, button, x + index * (buttonWidth + gap), 18, buttonWidth, 34);
    });
}

export function createFocusCustomRow(body, {x, width, value, unit}, {
    onTextChanged, onEditingChanged, onApply, onToggleUnit,
} = {}) {
    const entry = new St.Entry({
        hint_text: '30',
        can_focus: true,
        style_class: 'perdana-island__focus-custom-entry',
    });
    entry.set_text(value);
    entry.clutter_text.connect('text-changed', () => onTextChanged?.(entry.get_text()));
    entry.clutter_text.connect('key-focus-in', () => onEditingChanged?.(true));
    entry.clutter_text.connect('key-focus-out', () => onEditingChanged?.(false));
    entry.clutter_text.connect('activate', () => onApply?.());
    const entryWidth = Math.round(width * 0.25);
    const unitWidth = Math.round(width * 0.37);
    const applyWidth = width - entryWidth - unitWidth - 20;
    place(body, entry, x, 64, entryWidth, 34);
    const unitContents = new St.BoxLayout({style_class: 'perdana-island__focus-unit-content'});
    const unitLabel = makeLabel(unit, 'perdana-island__focus-unit-label');
    unitLabel.x_expand = true;
    unitContents.add_child(unitLabel);
    unitContents.add_child(new St.Icon({
        icon_name: 'pan-down-symbolic',
        style_class: 'perdana-island__focus-unit-arrow',
    }));
    const unitButton = new St.Button({
        child: unitContents,
        can_focus: true,
        reactive: true,
        track_hover: true,
        style_class: 'perdana-button perdana-button--focus-unit',
        accessible_name: 'Toggle duration between seconds and minutes',
    });
    unitButton.connect('clicked', () => onToggleUnit?.(unitLabel));
    attachButtonMotion(unitButton, {hoverScale: 1.03});
    place(body, unitButton, x + entryWidth + 10, 64, unitWidth, 34);
    place(body, makeTextButton(
        'Apply',
        'Apply custom focus duration',
        () => onApply?.(),
        'perdana-button--focus-apply'
    ), x + entryWidth + unitWidth + 20, 64, applyWidth, 34);
    return {entry, unitLabel, unitButton};
}

export function createFocusActions(body, {x, width, running, wasStarted}, {onToggle, onReset, onSkip} = {}) {
    const gap = 10;
    const actionWidth = (width - 2 * gap) / 3;
    const toggleButton = makeActionButton(
        running ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic',
        running ? 'Pause' : wasStarted ? 'Resume' : 'Start',
        running ? 'Pause focus session' : 'Start focus session',
        () => onToggle?.(),
        'perdana-action--primary'
    );
    place(body, toggleButton, x, 104, actionWidth, 34);
    place(body, makeActionButton(
        'view-refresh-symbolic',
        'Reset',
        'Reset timer',
        () => onReset?.(),
        'perdana-action--neutral'
    ), x + actionWidth + gap, 112, actionWidth, 36);
    place(body, makeActionButton(
        'media-skip-forward-symbolic',
        'Skip',
        'Skip to the next timer phase',
        () => onSkip?.(),
        'perdana-action--neutral'
    ), x + 2 * (actionWidth + gap), 112, actionWidth, 36);
    return {toggleButton};
}
