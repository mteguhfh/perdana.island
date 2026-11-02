import test from 'node:test';
import assert from 'node:assert/strict';
import {
    isChatItem,
    latestChatItem,
    normalizeNotificationText,
    notificationSummary,
    visibleNotifications,
} from '../extension/notification-domain.js';

test('notification text removes chat website labels while preserving message content', () => {
    assert.equal(normalizeNotificationText('Hello\nworld', 'whatsapp'), 'Hello world');
    assert.equal(normalizeNotificationText('Open chat.google.com/thread/1', 'googleChat'), 'Open');
    assert.equal(normalizeNotificationText('example.com/docs', 'whatsapp'), 'example.com/docs');
});

test('notification domain separates chat items and respects source filters', () => {
    const items = [
        {appKey: 'whatsapp', read: false, title: 'A'},
        {appKey: 'calendar', read: false, title: 'Meeting'},
        {appKey: 'telegramWeb', read: true, title: 'B'},
    ];
    assert.equal(isChatItem(items[0]), true);
    assert.equal(isChatItem(items[1]), false);
    const summary = notificationSummary(items, key => key !== 'telegramWeb');
    assert.equal(summary.items.length, 1);
    assert.equal(summary.latest.title, 'A');
    assert.equal(summary.unread, 1);
    assert.equal(visibleNotifications(items, key => key !== 'calendar').length, 2);
    assert.equal(latestChatItem(summary.items).title, 'A');
});
