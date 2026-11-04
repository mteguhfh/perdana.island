import test from 'node:test';
import assert from 'node:assert/strict';

import {
    mergeMessageItem,
    groupConversations,
    serializeMessages,
    restoreMessages,
} from '../extension/message-history.js';

const notif = () => ({});

function arrive(items, notification, title, body) {
    return mergeMessageItem(items, {
        id: items.length + 1,
        notification,
        app: 'WhatsApp',
        appKey: 'whatsapp',
        title,
        body,
    });
}

test('a reused WhatsApp notification keeps every message', () => {
    const reused = notif();
    let state = {items: []};
    for (const text of ['Hello!', 'How are you?', 'Are you available?']) {
        const merged = arrive(state.items, reused, 'Nadia', text);
        assert.equal(merged.isNew, true);
        state = merged;
    }
    assert.equal(state.items.length, 3);
    assert.deepEqual(state.items.map(item => item.body).reverse(),
        ['Hello!', 'How are you?', 'Are you available?']);
    assert.equal(state.items.filter(item => !item.read).length, 3);
});

test('near-simultaneous distinct objects are all preserved', () => {
    let state = {items: []};
    for (const text of ['one', 'two', 'three']) {
        state = arrive(state.items, notif(), 'Raka', text);
    }
    assert.equal(state.items.length, 3);
    assert.equal(new Set(state.items.map(item => item.id)).size, 3);
});

test('banner and added events for one message do not duplicate it', () => {
    const notification = notif();
    const first = arrive([], notification, 'Nadia', 'Hello!');
    const banner = arrive(first.items, notification, 'Nadia', 'Hello!');
    assert.equal(banner.isNew, false);
    assert.equal(banner.items.length, 1);
    assert.equal(banner.item.id, first.item.id);
});

test('a late body fills the existing row instead of adding an empty one', () => {
    const notification = notif();
    const first = arrive([], notification, 'Nadia', '');
    const filled = arrive(first.items, notification, 'Nadia', 'Hello!');
    assert.equal(filled.isNew, false);
    assert.equal(filled.items.length, 1);
    assert.equal(filled.item.body, 'Hello!');
});

test('detached history is not reused by the next notification', () => {
    const notification = notif();
    const first = arrive([], notification, 'Nadia', 'Hello!');
    first.items[0].detached = true;
    const next = arrive(first.items, notification, 'Nadia', 'Again');
    assert.equal(next.items.length, 2);
    assert.equal(next.items[0].body, 'Again');
});

test('conversations group by sender with the newest first', () => {
    const items = [
        {...arrive([], notif(), 'Nadia', 'newer').item, receivedAt: 3},
        {...arrive([], notif(), 'Raka', 'other').item, receivedAt: 2},
        {...arrive([], notif(), 'Nadia', 'older').item, receivedAt: 1},
    ];
    const groups = groupConversations(items);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].sender, 'Nadia');
    assert.equal(groups[0].items[0].body, 'newer');
    assert.equal(groups[1].sender, 'Raka');
});

const chat = () => true;

function history(...bodies) {
    let items = [];
    bodies.forEach((body, index) => {
        items = mergeMessageItem(items, {
            id: index + 1, notification: notif(), source: {live: true}, app: 'WhatsApp',
            appKey: 'whatsapp', appId: 'chrome-whatsapp.desktop', title: 'Nadia', body,
        }).items;
    });
    return items;
}

test('unread history survives a save and restore cycle', () => {
    const items = history('Hello!', 'How are you?', 'Are you available?');
    items[0].read = true;
    const restored = restoreMessages(serializeMessages(items, {isChat: chat}), {isChat: chat});
    assert.equal(restored.items.length, 3);
    assert.deepEqual(restored.items.map(item => item.read).sort(), [false, false, true]);
    assert.equal(restored.items[0].appId, 'chrome-whatsapp.desktop');
    assert.equal(restored.nextId, 3);
});

test('live GNOME objects are never written to disk', () => {
    const raw = serializeMessages(history('Hello!'), {isChat: chat});
    assert.ok(!raw.includes('live'));
    assert.ok(!('source' in JSON.parse(raw).items[0]));
    assert.ok(!('notification' in JSON.parse(raw).items[0]));
});

test('only chat rows are persisted', () => {
    const items = [
        ...history('keep me'),
        {id: 9, appKey: 'browser-chrome', app: 'Chrome', title: 'Alert', body: 'x', receivedAt: 1},
    ];
    const restored = restoreMessages(serializeMessages(items, {isChat: item => item.appKey === 'whatsapp'}),
        {isChat: item => item.appKey === 'whatsapp'});
    assert.equal(restored.items.length, 1);
    assert.equal(restored.items[0].body, 'keep me');
});

test('corrupt or foreign files restore as an empty history', () => {
    for (const raw of ['', '{', 'null', '[]', '{"version":99,"items":[]}', '{"version":1}'])
        assert.deepEqual(restoreMessages(raw).items, []);
});

test('invalid rows are skipped and ids stay unique', () => {
    const raw = JSON.stringify({version: 1, items: [
        {id: 1, title: 'A', body: 'ok', receivedAt: Date.now()},
        {id: 1, title: 'A', body: 'dupe id', receivedAt: Date.now()},
        {id: -4, title: 'A', body: 'bad id', receivedAt: Date.now()},
        {id: 2, title: 'A', body: 'future', receivedAt: Date.now() + 10 * 86_400_000},
        {id: 3, title: '', body: '', receivedAt: Date.now()},
        'junk',
    ]});
    const restored = restoreMessages(raw);
    assert.deepEqual(restored.items.map(item => item.body), ['ok']);
});

test('old read rows expire but unread rows are always kept', () => {
    const now = Date.now();
    const old = now - 30 * 86_400_000;
    const raw = JSON.stringify({version: 1, items: [
        {id: 1, title: 'A', body: 'old read', read: true, receivedAt: old},
        {id: 2, title: 'A', body: 'old unread', read: false, receivedAt: old},
        {id: 3, title: 'A', body: 'recent read', read: true, receivedAt: now - 1000},
    ]});
    const restored = restoreMessages(raw, {now});
    assert.deepEqual(restored.items.map(item => item.body).sort(), ['old unread', 'recent read']);
});

test('a restored row adopts its live notification instead of duplicating', () => {
    const restored = restoreMessages(serializeMessages(history('Hello!'), {isChat: chat}), {isChat: chat});
    const live = notif();
    const merged = mergeMessageItem(restored.items, {
        id: 99, notification: live, source: {live: true}, app: 'WhatsApp',
        appKey: 'whatsapp', title: 'Nadia', body: 'Hello!',
    });
    assert.equal(merged.items.length, 1);
    assert.equal(merged.isNew, false);
    assert.equal(merged.item.notification, live);
    assert.equal(merged.item.id, restored.items[0].id);
});

test('a new message after restore is added next to the restored history', () => {
    const restored = restoreMessages(serializeMessages(history('Hello!'), {isChat: chat}), {isChat: chat});
    const merged = mergeMessageItem(restored.items, {
        id: restored.nextId + 1, notification: notif(), source: {}, app: 'WhatsApp',
        appKey: 'whatsapp', title: 'Nadia', body: 'Still there?',
    });
    assert.equal(merged.items.length, 2);
    assert.equal(merged.items[0].body, 'Still there?');
    assert.equal(merged.items[1].body, 'Hello!');
});
