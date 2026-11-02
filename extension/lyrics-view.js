// Synchronized lyrics viewport, rail, and animation state.
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {makeLabel, place} from './ui-controls.js';

const VISIBLE_LYRIC_CONTEXT = 4;

export class LyricsView {
    constructor({width, height} = {}) {
        this.viewport = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            clip_to_allocation: true,
            style_class: 'perdana-island__lyrics-viewport',
        });
        this._rail = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            style_class: 'perdana-island__lyrics-rail',
        });
        this.viewport.add_child(this._rail);
        this._waitLabel = makeLabel('···', 'perdana-island__lyrics-wait');
        place(this.viewport, this._waitLabel,
            0, Math.max(0, (height - 22) / 2), width, 22);
        this._statusLabel = makeLabel('', 'perdana-island__lyrics-empty');
        place(this.viewport, this._statusLabel, 0, 0, width, height);

        this._lineLabels = [];
        this._renderedLines = null;
        this._windowStart = -1;
        this._layoutWidth = 0;
        this._layoutHeight = 0;
        this._displayedIndex = -1;
        this._displayGap = false;
    }

    resetDisplay() {
        this._renderedLines = null;
        this._windowStart = -1;
        this._displayedIndex = -1;
        this._displayGap = false;
    }

    update({data, status, position, reducedMotion = false, bodyHeight = 0} = {}) {
        const lines = data?.lines || [];
        if (lines.length && !data.synced) {
            this._statusLabel.text = 'Timed lyrics unavailable for this track';
            this._statusLabel.visible = true;
            this.hide();
            return;
        }
        if (!lines.length) {
            this._statusLabel.text = status || 'No lyrics found';
            this._statusLabel.visible = true;
            this.hide();
            return;
        }

        this._statusLabel.visible = false;
        let activeIndex = 0;
        let displayGap = false;
        if (data.synced) {
            activeIndex = -1;
            for (let index = 0; index < lines.length; index++) {
                if (lines[index].time <= position)
                    activeIndex = index;
                else
                    break;
            }
            // LRC timestamps mark lyric starts, not when the current line ends.
            if (activeIndex < 0)
                displayGap = true;
        }

        const windowCapacity = VISIBLE_LYRIC_CONTEXT * 2 + 1;
        const maxWindowStart = Math.max(0, lines.length - windowCapacity);
        const windowStart = activeIndex < 0
            ? 0
            : Math.max(0, Math.min(activeIndex - VISIBLE_LYRIC_CONTEXT, maxWindowStart));
        const visibleLines = lines.slice(windowStart, windowStart + windowCapacity);
        const width = this.viewport.width;
        const viewportHeight = this.viewport.height || bodyHeight - 16;
        const linesChanged = this._windowStart !== windowStart
            || this._renderedLines?.length !== visibleLines.length
            || visibleLines.some((line, index) => this._renderedLines?.[index] !== line);

        if (linesChanged) {
            this._rail.remove_all_transitions();
            while (this._lineLabels.length < visibleLines.length) {
                const label = makeLabel('', 'perdana-island__lyrics-line perdana-island__lyrics-line--far');
                label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
                label.clutter_text.line_wrap = true;
                label.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
                label.set_position(0, 0);
                this._rail.add_child(label);
                this._lineLabels.push(label);
            }
            for (let index = 0; index < this._lineLabels.length; index++) {
                const label = this._lineLabels[index];
                label.remove_all_transitions();
                label.visible = index < visibleLines.length;
                if (index >= visibleLines.length)
                    continue;
                label.text = visibleLines[index].text;
                label.opacity = 0;
                label.remove_style_class_name('perdana-island__lyrics-line--current');
                label.remove_style_class_name('perdana-island__lyrics-line--near');
                label.add_style_class_name('perdana-island__lyrics-line--far');
                label.set_size(width, 24);
            }
            this._rail.set_size(width, 0);
            this._renderedLines = visibleLines;
            this._windowStart = windowStart;
        }
        const layoutChanged = linesChanged
            || width !== this._layoutWidth
            || viewportHeight !== this._layoutHeight;
        const changed = activeIndex !== this._displayedIndex
            || displayGap !== this._displayGap
            || layoutChanged;
        this._displayedIndex = activeIndex;
        this._displayGap = displayGap;
        if (!changed)
            return;

        this._rail.visible = activeIndex >= 0;
        this._waitLabel.visible = displayGap;
        this._layoutWidth = width;
        this._layoutHeight = viewportHeight;
        const offsets = [];
        const heights = [];
        let railHeight = 0;
        for (let index = 0; index < visibleLines.length; index++) {
            const label = this._lineLabels[index];
            const lineIndex = windowStart + index;
            const distance = activeIndex < 0 ? Infinity : Math.abs(lineIndex - activeIndex);
            const style = distance === 0
                ? 'perdana-island__lyrics-line--current'
                : (distance === 1 ? 'perdana-island__lyrics-line--near' : 'perdana-island__lyrics-line--far');
            for (const candidate of [
                'perdana-island__lyrics-line--current',
                'perdana-island__lyrics-line--near',
                'perdana-island__lyrics-line--far',
            ]) {
                if (candidate !== style)
                    label.remove_style_class_name(candidate);
            }
            label.add_style_class_name(style);
            label.set_width(width);
            const [, naturalHeight] = label.get_preferred_height(width);
            const height = Math.max(24, Math.ceil(naturalHeight));
            offsets[index] = railHeight;
            heights[index] = height;
            label.set_position(0, railHeight);
            label.set_size(width, height);
            railHeight += height + 5;
        }
        if (visibleLines.length)
            railHeight -= 5;
        this._rail.set_size(width, railHeight);
        const activeWindowIndex = activeIndex - windowStart;
        const targetY = activeIndex < 0
            ? (viewportHeight - 24) / 2
            : viewportHeight / 2 - offsets[activeWindowIndex] - heights[activeWindowIndex] / 2;
        const duration = reducedMotion ? 160 : 620;
        if (reducedMotion) {
            const rail = this._rail;
            rail.remove_all_transitions();
            rail.ease({
                opacity: 0,
                duration: 80,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                onComplete: () => {
                    if (this._rail !== rail)
                        return;
                    rail.translation_y = targetY;
                    rail.ease({
                        opacity: displayGap ? 112 : 255,
                        duration: 100,
                        mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                    });
                },
            });
        } else {
            this._rail.ease({
                translation_y: targetY,
                opacity: displayGap ? 112 : 255,
                duration,
                mode: Clutter.AnimationMode.EASE_OUT_QUINT,
            });
        }
        this._waitLabel.ease({
            opacity: displayGap ? 220 : 0,
            duration: reducedMotion ? 160 : 260,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        });
        for (let index = 0; index < visibleLines.length; index++) {
            const label = this._lineLabels[index];
            const distance = activeIndex < 0 ? Infinity : Math.abs(windowStart + index - activeIndex);
            label.ease({
                opacity: distance === 0 ? 255 : (distance === 1 ? 176 : 74),
                duration: reducedMotion ? 160 : 320,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            });
        }
    }

    hide() {
        this._rail.visible = false;
        this._rail.remove_all_transitions();
        this._rail.opacity = 0;
        this._rail.translation_y = 0;
        this._waitLabel.visible = false;
        this._waitLabel.remove_all_transitions();
        this._waitLabel.opacity = 0;
        for (const label of this._lineLabels) {
            label.remove_all_transitions();
            label.opacity = 0;
        }
        this._displayedIndex = -1;
        this._displayGap = false;
    }
}
