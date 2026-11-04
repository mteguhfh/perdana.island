// Shared media transport controls and lyrics toolbar button updaters.
import St from 'gi://St';

import {makeIconButton} from './ui-controls.js';

export function createMediaButton({
    iconName,
    accessibleName,
    enabled = true,
    primary = false,
    onClick,
} = {}) {
    const button = makeIconButton(
        iconName,
        accessibleName,
        () => onClick?.(),
        primary ? 'perdana-button--play' : 'perdana-button--media'
    );
    button.reactive = enabled;
    button.can_focus = enabled;
    return button;
}

export function updateLyricsPlaybackButton(button, {isPlaying = false, enabled = true} = {}) {
    if (!button)
        return;
    button.set_child(new St.Icon({
        icon_name: isPlaying ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic',
        style_class: 'perdana-island__icon',
    }));
    button.accessible_name = isPlaying ? 'Pause' : 'Play';
    button.reactive = enabled;
    button.can_focus = enabled;
}

export function updateLyricsRestingToggle(button, {enabled = false, applyAccentStyles} = {}) {
    if (!button)
        return;
    if (enabled)
        button.add_style_class_name('perdana-button--lyrics-resting-active');
    else
        button.remove_style_class_name('perdana-button--lyrics-resting-active');
    button.accessible_name = enabled
        ? 'Show synchronized lyrics in the resting island, on'
        : 'Show synchronized lyrics in the resting island, off';
    applyAccentStyles?.(button);
}
