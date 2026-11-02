import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {attachButtonMotion, makeLabel, makeTextButton, place} from './ui-controls.js';

export function renderNotificationsPage(body, {
    pageWidth,
    bodyHeight,
    tab,
    alertItems = [],
    visibleItems = [],
    activityCount = 0,
    onSelectTab,
    onClearAll,
    onOpen,
    makeIcon,
} = {}) {
    const contentWidth = pageWidth;
    // Keep Alerts and Activity in a single header row, matching the preview.
    const tabs = new St.BoxLayout({style_class: 'perdana-island__notification-tabs'});
    const tabStyle = key =>
        `perdana-island__rem-tab${tab === key ? ' perdana-island__rem-tab--on' : ''}`;
    const tabWidth = Math.min(98, Math.max(72, Math.floor((contentWidth - 108) / 2)));
    const alertsTab = makeTextButton(`Alerts ${visibleItems.length}`, 'Alerts', () => {
        onSelectTab?.('alerts');
    }, `perdana-island__notification-tab ${tabStyle('alerts')}`);
    const activityTab = makeTextButton(`Activity ${activityCount}`, 'Activity', () => {
        onSelectTab?.('activity');
    }, `perdana-island__notification-tab ${tabStyle('activity')}`);
    alertsTab.set_size(tabWidth, 22);
    activityTab.set_size(tabWidth, 22);
    tabs.add_child(alertsTab);
    tabs.add_child(activityTab);
    const tabsWidth = tabWidth * 2 + 8;
    tabs.set_size(tabsWidth, 28);
    place(body, tabs, 0, 8, tabsWidth, 28);
    const clearWidth = Math.min(76, Math.max(58, Math.round(contentWidth * 0.15)));
    const clearButton = makeTextButton('Clear all', 'Clear all app notifications', () => {
        onClearAll?.();
    }, 'perdana-island__notification-clear');
    clearButton.reactive = alertItems.length > 0;
    clearButton.opacity = alertItems.length > 0 ? 255 : 110;
    const clearX = Math.max(tabsWidth + 8, contentWidth - clearWidth);
    const safeClearWidth = Math.max(1, Math.min(clearWidth, contentWidth - clearX));
    place(body, clearButton, clearX, 8, safeClearWidth, 26);
    const status = tab === 'activity'
        ? 'Click a completed download to open it and dismiss it.'
        : 'Chat notifications appear under Messages.';
    place(body, makeLabel(status, 'perdana-island__notification-hint'), 0, 43, contentWidth - 4, 20);
    if (tab === 'activity')
        return {activity: true};

    if (!visibleItems.length) {
        const emptyText = alertItems.length
            ? 'All app sources are turned off' : 'No notifications yet';
        const empty = makeLabel(emptyText, 'perdana-island__empty-media');
        empty.clutter_text.x_align = Clutter.ActorAlign.CENTER;
        place(body, empty, 0, 70, contentWidth, bodyHeight - 74);
        return {activity: false};
    }
    const cardWidth = Math.max(1, contentWidth - 18);
    const rowHeight = 42;
    const rowGap = 5;
    const list = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'perdana-island__notification-list',
    });
    list.set_size(cardWidth, visibleItems.length * (rowHeight + rowGap) - rowGap);
    visibleItems.forEach(item => {
        const unread = !item.read;
        const row = new St.BoxLayout({
            style_class: `perdana-island__notification-row${unread ? ' perdana-island__notification-row--unread' : ''}`,
            clip_to_allocation: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        row.set_size(cardWidth, rowHeight);
        row.add_child(makeIcon?.(item, 22, 'perdana-island__notification-icon'));
        const copy = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'perdana-island__notification-copy',
            clip_to_allocation: true,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const top = new St.BoxLayout({
            style_class: 'perdana-island__notification-top',
            y_align: Clutter.ActorAlign.CENTER,
        });
        const title = makeLabel(item.title, 'perdana-island__notification-title');
        title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        title.clutter_text.line_wrap = false;
        title.x_expand = true;
        title.x_align = Clutter.ActorAlign.FILL;
        top.add_child(title);
        const appLabel = makeLabel(item.app, 'perdana-island__notification-app');
        appLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        appLabel.clutter_text.line_wrap = false;
        top.add_child(appLabel);
        copy.add_child(top);
        const bodyLabel = makeLabel(item.body || item.title, 'perdana-island__notification-body');
        bodyLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        bodyLabel.clutter_text.line_wrap = false;
        bodyLabel.x_expand = true;
        bodyLabel.x_align = Clutter.ActorAlign.FILL;
        copy.add_child(bodyLabel);
        row.add_child(copy);
        const button = new St.Button({
            child: row,
            can_focus: true,
            reactive: true,
            track_hover: true,
            style_class: 'perdana-button perdana-island__notification-button',
            accessible_name: `Open ${item.app}: ${item.title}`,
        });
        button.connect('clicked', () => onOpen?.(item));
        button.set_size(cardWidth, rowHeight);
        button.x_expand = true;
        attachButtonMotion(button, {hoverScale: 1.015, pressScale: 0.98});
        list.add_child(button);
    });
    const scroll = new St.ScrollView({
        overlay_scrollbars: false,
        style_class: 'perdana-island__notification-scroll',
    });
    scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
    scroll.add_child(list);
    place(body, scroll, 0, 70, contentWidth, Math.max(0, bodyHeight - 74));
    return {activity: false};
}
