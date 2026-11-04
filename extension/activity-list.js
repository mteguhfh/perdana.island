import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {
    cleanActivityIcon, cleanActivityText, formatActivityDetail,
    formatActivityValue, formatBytes, normalizeProgress,
} from './progress-utils.js';
import {makeLabel, place} from './ui-controls.js';

export function renderActivityPage(body, {
    pageWidth,
    bodyHeight,
    top = 52,
    activities = [],
    onActivate,
} = {}) {
    const contentWidth = pageWidth;
    const listWidth = Math.max(1, contentWidth - 12);
    const running = activities.filter(item => item.state === 'running');
    const finished = activities.filter(item => item.state === 'done' || item.state === 'failed');
    const shown = running.concat(finished);
    const rows = new Map();
    if (!shown.length) {
        place(body, makeLabel('No downloads or app tasks right now', 'perdana-island__empty-media'),
            0, top + 16, contentWidth, 24);
        return {update: next => rows.size === next.length};
    }
    const rowHeight = 54;
    const rowGap = 5;
    const list = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'perdana-island__activity-list',
    });
    list.set_size(listWidth, shown.length * (rowHeight + rowGap) - rowGap);
    shown.forEach(item => {
        const terminal = item.state !== 'running';
        const complete = item.state === 'done';
        const downloadable = item.source === 'download' && complete;
        const row = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            reactive: terminal,
            can_focus: terminal,
            track_hover: terminal,
            style_class: `perdana-island__activity-row${terminal ? ' perdana-island__activity-row--done' : ''}`,
        });
        row.set_size(listWidth, rowHeight);
        row.accessible_name = terminal
            ? downloadable ? `Download complete: ${item.title}. Press Enter to open and dismiss.`
                : `${complete ? 'Activity complete' : 'Activity stopped'}: ${item.title}. Press Enter to dismiss.`
            : `${item.source === 'download' ? 'Downloading' : 'In progress'}: ${item.title}`;
        const icon = new St.Icon({
            icon_name: complete ? 'emblem-ok-symbolic'
                : item.state === 'failed' ? 'dialog-warning-symbolic' : cleanActivityIcon(item.icon),
            icon_size: 16,
            style_class: 'perdana-island__activity-icon',
        });
        const titleLabel = makeLabel(cleanActivityText(item.title, 80), 'perdana-island__activity-title');
        titleLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        titleLabel.clutter_text.line_wrap = false;
        const stateText = terminal
            ? downloadable ? 'Complete · open' : complete ? 'Complete · dismiss' : 'Stopped · dismiss'
            : item.source === 'download' ? formatActivityValue(item) : 'Running';
        const stateLabel = makeLabel(stateText, 'perdana-island__activity-sub');
        stateLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        stateLabel.clutter_text.line_wrap = false;
        const detailLabel = makeLabel(terminal
            ? item.source === 'download' ? `Download complete · ${formatBytes(item.bytes)}` : item.sub || 'Finished'
            : formatActivityDetail(item), 'perdana-island__activity-sub');
        detailLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        detailLabel.clutter_text.line_wrap = false;
        place(row, icon, 10, 6, 16, 16);
        place(row, titleLabel, 34, 4, Math.max(1, listWidth - 142), 16);
        place(row, stateLabel, listWidth - 104, 4, 94, 16);
        place(row, detailLabel, 34, 21, listWidth - 46, 14);
        const bar = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            style_class: 'perdana-island__activity-bar',
        });
        place(row, bar, 34, 42, listWidth - 46, 4);
        const fill = new St.Widget({style_class: `perdana-island__activity-fill${item.progress === null && !terminal
            ? ' perdana-island__activity-fill--indeterminate' : ''}`});
        const barWidth = listWidth - 46;
        const progress = terminal ? complete ? 1 : 0 : normalizeProgress(item.progress);
        const initialWidth = progress === null ? Math.round(barWidth * 0.35)
            : Math.round(barWidth * progress);
        place(bar, fill, 0, 0, initialWidth, 4);
        const entry = {row, icon, titleLabel, stateLabel, detailLabel, fill, barWidth, connected: false};
        rows.set(item.id, entry);
        if (terminal)
            connectCompletedRow(entry, item, onActivate);
        list.add_child(row);
    });
    const scroll = new St.ScrollView({
        overlay_scrollbars: false,
        style_class: 'perdana-island__notification-scroll',
    });
    scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
    scroll.add_child(list);
    place(body, scroll, 0, top, contentWidth, Math.max(0, bodyHeight - top - 4));

    return {
        update(nextActivities) {
            return updateActivityRows(rows, nextActivities, onActivate);
        },
    };
}

function connectCompletedRow(entry, item, onActivate) {
    if (!entry || entry.connected)
        return;
    entry.connected = true;
    entry.row.connect('button-press-event', (_actor, event) => {
        if (event.get_button() !== 1)
            return Clutter.EVENT_PROPAGATE;
        onActivate?.(item);
        return Clutter.EVENT_STOP;
    });
    entry.row.connect('key-press-event', (_actor, event) => {
        const key = event.get_key_symbol();
        if (key !== Clutter.KEY_Return && key !== Clutter.KEY_KP_Enter && key !== Clutter.KEY_space)
            return Clutter.EVENT_PROPAGATE;
        onActivate?.(item);
        return Clutter.EVENT_STOP;
    });
}

function updateActivityRows(rows, activities, onActivate) {
    if (rows.size !== activities.length)
        return false;
    for (const item of activities) {
        const entry = rows.get(item.id);
        if (!entry)
            return false;
        const terminal = item.state !== 'running';
        const complete = item.state === 'done';
        const downloadable = item.source === 'download' && complete;
        entry.titleLabel.text = cleanActivityText(item.title, 80);
        entry.stateLabel.text = terminal
            ? downloadable ? 'Complete · open' : complete ? 'Complete · dismiss' : 'Stopped · dismiss'
            : item.source === 'download' ? formatActivityValue(item) : 'Running';
        entry.detailLabel.text = terminal
            ? item.source === 'download' ? `Download complete · ${formatBytes(item.bytes)}` : item.sub || 'Finished'
            : formatActivityDetail(item);
        const progress = terminal ? complete ? 1 : 0 : normalizeProgress(item.progress);
        entry.fill.width = progress === null ? Math.max(1, Math.round(entry.barWidth * 0.35))
            : Math.round(entry.barWidth * progress);
        if (terminal && !entry.connected) {
            entry.row.reactive = true;
            entry.row.can_focus = true;
            entry.row.track_hover = true;
            entry.row.accessible_name = downloadable
                ? `Download complete: ${item.title}. Press Enter to open and dismiss.`
                : `${complete ? 'Activity complete' : 'Activity stopped'}: ${item.title}. Press Enter to dismiss.`;
            entry.row.add_style_class_name('perdana-island__activity-row--done');
            connectCompletedRow(entry, item, onActivate);
        } else if (!terminal && entry.connected) {
            entry.row.reactive = false;
            entry.row.can_focus = false;
            entry.row.track_hover = false;
            entry.row.remove_style_class_name('perdana-island__activity-row--done');
            entry.row.accessible_name = `Downloading ${item.title}`;
        }
        if (progress === null && !terminal)
            entry.fill.add_style_class_name('perdana-island__activity-fill--indeterminate');
        else
            entry.fill.remove_style_class_name('perdana-island__activity-fill--indeterminate');
    }
    return true;
}
