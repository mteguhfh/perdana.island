// Animated four-bar equalizer used on media surfaces.
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

export function createEqualizer({
    motionDuration = milliseconds => milliseconds,
    isEnabled = () => true,
    isReducedMotion = () => false,
} = {}) {
    const equalizer = new St.BoxLayout({
        y_align: Clutter.ActorAlign.CENTER,
        style_class: 'perdana-island__equalizer',
    });
    const bars = [];
    let playing = false;
    let animating = false;
    for (let index = 0; index < 4; index++) {
        const bar = new St.Widget({
            style_class: `perdana-island__bar perdana-island__bar--${index + 1}`,
        });
        bar.set_pivot_point(0.5, 1);
        bar.scale_y = 0.22;
        bars.push(bar);
        equalizer.add_child(bar);
    }

    function setStaticLevels(playingValue) {
        const levels = playingValue && isEnabled()
            ? [0.42, 0.78, 0.54, 0.9]
            : [0.22, 0.22, 0.22, 0.22];
        bars.forEach((bar, index) => {
            bar.remove_all_transitions();
            bar.scale_y = levels[index] ?? levels[0];
        });
    }

    function animateBar(bar, index) {
        if (!isEnabled() || !animating)
            return;

        const target = 0.22 + Math.random() * 0.78;
        const duration = 170 + Math.floor(Math.random() * 250) + index * 24;
        bar.ease({
            scale_y: target,
            duration: motionDuration(duration),
            mode: Clutter.AnimationMode.EASE_IN_OUT_SINE,
            onComplete: () => {
                if (!isEnabled() || !animating)
                    return;
                bar._perdanaAnimSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 60, () => {
                    bar._perdanaAnimSource = 0;
                    animateBar(bar, index);
                    return GLib.SOURCE_REMOVE;
                });
            },
        });
    }

    function setPlaying(value) {
        const shouldAnimate = Boolean(value && isEnabled() && !isReducedMotion());
        playing = Boolean(value);
        equalizer._perdanaPlaying = playing;
        if (animating === shouldAnimate) {
            if (!shouldAnimate)
                setStaticLevels(playing);
            return;
        }

        animating = shouldAnimate;
        for (const bar of bars) {
            if (bar._perdanaAnimSource) {
                GLib.source_remove(bar._perdanaAnimSource);
                bar._perdanaAnimSource = 0;
            }
            bar.remove_all_transitions();
            if (!shouldAnimate) {
                if (isReducedMotion()) {
                    setStaticLevels(playing);
                    break;
                }
                bar.ease({
                    scale_y: 0.22,
                    duration: motionDuration(130),
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            }
        }

        if (shouldAnimate) {
            bars.forEach((bar, index) => animateBar(bar, index));
        }
    }

    function stop() {
        animating = false;
        for (const bar of bars) {
            if (bar._perdanaAnimSource) {
                GLib.source_remove(bar._perdanaAnimSource);
                bar._perdanaAnimSource = 0;
            }
            bar.remove_all_transitions();
        }
    }

    equalizer._perdanaPlaying = false;
    equalizer._perdanaAnimating = false;
    equalizer.setPlaying = setPlaying;
    equalizer.stop = stop;
    return equalizer;
}
