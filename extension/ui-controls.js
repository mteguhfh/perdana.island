// Shared St/Clutter controls. Page state and callbacks remain owned by extension.js.
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

export function makeLabel(text, styleClass = '') {
    const label = new St.Label({
        text,
        style_class: styleClass,
        y_align: Clutter.ActorAlign.CENTER,
    });
    label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return label;
}

export function place(parent, actor, x, y, width, height) {
    actor.set_position(x, y);
    actor.set_size(width, height);
    parent.add_child(actor);
    return actor;
}

function animationsEnabled() {
    try {
        return Boolean(St.Settings.get().enable_animations);
    } catch (_error) {
        return true;
    }
}

export function attachButtonMotion(button, {hoverScale = 1.035, pressScale = 0.955} = {}) {
    if (!button || button._perdanaMotionAttached)
        return button;
    button._perdanaMotionAttached = true;
    const scaleTo = (value, duration, mode) => {
        button.remove_all_transitions();
        if (!animationsEnabled()) {
            button.set_scale(value, value);
            return;
        }
        button.ease({scale_x: value, scale_y: value, duration, mode});
    };
    button.connect('notify::hover', () => {
        if (button._perdanaPressed)
            return;
        scaleTo(button.hover ? hoverScale : 1, 180, Clutter.AnimationMode.EASE_OUT_CUBIC);
    });
    button.connect('notify::pressed', () => {
        button._perdanaPressed = Boolean(button.pressed);
        if (button.pressed)
            scaleTo(pressScale, 90, Clutter.AnimationMode.EASE_OUT_QUAD);
        else
            scaleTo(button.hover ? hoverScale : 1, 240, Clutter.AnimationMode.EASE_OUT_BACK);
    });
    return button;
}

export function makeIconButton(iconName, accessibleName, callback, styleClass = '') {
    const icon = new St.Icon({icon_name: iconName, style_class: 'perdana-island__icon'});
    const button = new St.Button({
        child: icon,
        can_focus: true,
        reactive: true,
        track_hover: true,
        style_class: `perdana-button ${styleClass}`.trim(),
        accessible_name: accessibleName,
    });
    button.connect('clicked', callback);
    attachButtonMotion(button, {hoverScale: 1.07, pressScale: 0.93});
    return button;
}

export function makeTextButton(label, accessibleName, callback, styleClass = '') {
    const button = new St.Button({
        label,
        can_focus: true,
        reactive: true,
        track_hover: true,
        style_class: `perdana-button ${styleClass}`.trim(),
        accessible_name: accessibleName,
    });
    button.connect('clicked', callback);
    attachButtonMotion(button);
    return button;
}

export function makeActionButton(iconName, label, accessibleName, callback, styleClass = '') {
    const contents = new St.BoxLayout({style_class: 'perdana-action__contents'});
    const icon = new St.Icon({icon_name: iconName, style_class: 'perdana-island__icon'});
    const text = makeLabel(label, 'perdana-action__label');
    contents.add_child(icon);
    contents.add_child(text);
    const button = new St.Button({
        child: contents,
        can_focus: true,
        reactive: true,
        track_hover: true,
        style_class: `perdana-button perdana-action ${styleClass}`.trim(),
        accessible_name: accessibleName,
    });
    button.connect('clicked', callback);
    button._perdanaActionIcon = icon;
    button._perdanaActionLabel = text;
    attachButtonMotion(button);
    return button;
}
