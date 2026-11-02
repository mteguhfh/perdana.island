import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {MessageGroup} from './message-group.js';
import {MessageList} from './message-list.js';
import {makeLabel, makeTextButton, place} from './ui-controls.js';

export function renderMessagesPage(body, {
    pageWidth,
    bodyHeight,
    cards = [],
    messageCount = 0,
    unread = 0,
    onMarkAllRead,
    onClear,
    onExpandedChange,
    onMarkRead,
    onOpen,
} = {}) {
    const contentWidth = pageWidth;
    const compactHeader = contentWidth < 300;
    const header = new St.BoxLayout({
        style_class: `perdana-island__messages-header${compactHeader
            ? ' perdana-island__messages-header--compact' : ''}`,
        y_align: Clutter.ActorAlign.CENTER,
    });
    header.add_child(makeLabel('Messages', 'perdana-island__todo-heading'));
    const unreadLabel = makeLabel(messageCount
        ? (unread ? `${unread} unread` : 'All read') : 'No messages',
    'perdana-island__messages-count');
    unreadLabel.x_expand = true;
    unreadLabel.x_align = Clutter.ActorAlign.END;
    header.add_child(unreadLabel);
    const markRead = makeTextButton(contentWidth >= 340
        ? 'Mark all read' : compactHeader ? 'Read' : 'Mark read',
        'Mark all messages as read', () => {
            onMarkAllRead?.();
        }, 'perdana-island__notification-clear');
    const markReadWidth = contentWidth >= 340 ? 88 : compactHeader ? 48 : 70;
    markRead.set_size(markReadWidth, 26);
    header.add_child(markRead);
    const clear = makeTextButton('Clear', 'Clear chat messages', () => {
        onClear?.();
    }, 'perdana-island__notification-clear');
    clear.set_size(compactHeader ? 48 : 54, 26);
    header.add_child(clear);
    place(body, header, 0, 7, contentWidth, 28);

    if (!cards.length) {
        const empty = makeLabel('No messages', 'perdana-island__empty-media');
        empty.clutter_text.x_align = Clutter.ActorAlign.CENTER;
        place(body, empty, 0, 43, contentWidth, bodyHeight - 47);
        return;
    }
    const listTop = 7 + 28 + 5;
    const listHeight = Math.max(1, bodyHeight - listTop - 4);
    const list = new MessageList({maxHeight: listHeight});
    for (const data of cards) {
        const card = new MessageGroup({
            appName: data.app,
            gicon: data.gicon,
            sender: data.sender,
            time: data.time,
            messages: data.messages,
            expanded: data.expanded,
        });
        card.connect('expanded-changed', (_group, isExpanded) => {
            onExpandedChange?.(data.sender, isExpanded, card);
        });
        card.connect('mark-read', () => {
            onMarkRead?.(data.items);
        });
        card.connect('open', () => {
            onOpen?.(data.latest);
        });
        list.addGroup(card);
    }
    place(body, list, 0, listTop, contentWidth, listHeight);
}
