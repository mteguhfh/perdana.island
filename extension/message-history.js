// Notification history merge helpers. Kept free of GI imports so the message
// grouping rules can be tested with plain Node.

const PERSIST_VERSION = 1;
const READ_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const TEXT_LIMIT = 600;

export function mergeMessageItem(items, incoming, {limit = 100} = {}) {
    const current = items.find(entry =>
        entry.notification === incoming.notification && !entry.detached);
    // Chrome/WhatsApp can reuse one notification object, fill its body late, or
    // send the next message on the same object. Only changed text is a new row.
    const grewBody = Boolean(current && !current.body && incoming.body);
    const isNew = !current
        || (!grewBody && (current.title !== incoming.title || current.body !== incoming.body));

    if (current && !isNew) {
        const item = {...current, ...incoming, id: current.id, receivedAt: Date.now()};
        return {
            items: [item, ...items.filter(entry => entry !== current)],
            item,
            isNew: false,
        };
    }

    // A row restored from disk has no live notification. When the same message
    // shows up again (extension reload with the notification still open), attach
    // the live object to the stored row instead of listing the message twice.
    if (!current && incoming.notification) {
        const restored = items.find(entry => !entry.notification && !entry.detached
            && entry.restored
            && entry.appKey === incoming.appKey
            && entry.title === incoming.title
            && entry.body === incoming.body);
        if (restored) {
            const item = {...restored, ...incoming, id: restored.id, read: restored.read,
                receivedAt: restored.receivedAt, restored: false};
            return {
                items: items.map(entry => entry === restored ? item : entry),
                item,
                isNew: false,
            };
        }
    }

    if (current)
        current.detached = true;
    const item = {...incoming, read: false, receivedAt: Date.now(), detached: false};
    return {
        items: [item, ...items].slice(0, limit),
        item,
        isNew: true,
    };
}

// Group chat rows by app and sender, newest conversation first.
export function groupConversations(items, {keyOf = item => `${item.appKey || item.app}\u0000${item.title}`} = {}) {
    const groups = new Map();
    for (const item of [...items].sort((first, second) =>
        (Number(second.receivedAt) || 0) - (Number(first.receivedAt) || 0))) {
        const key = keyOf(item);
        if (!groups.has(key))
            groups.set(key, {key, sender: item.title, app: item.app, items: []});
        groups.get(key).items.push(item);
    }
    return [...groups.values()];
}

const text = (value, max = TEXT_LIMIT) => typeof value === 'string' ? value.slice(0, max) : '';

// Plain-data snapshot of the chat history. Live GNOME objects (source,
// notification) are never written; only what is needed to show and reopen a
// conversation after the session restarts.
export function serializeMessages(items, {isChat = () => true, limit = 100} = {}) {
    const rows = items
        .filter(item => isChat(item) && (item.title || item.body))
        .slice(0, limit)
        .map(item => ({
            id: Number(item.id) || 0,
            app: text(item.app, 80),
            appKey: text(item.appKey, 60),
            appId: text(item.appId, 200),
            appIconName: text(item.appIconName, 120) || null,
            appIconFile: text(item.appIconFile, 400) || null,
            title: text(item.title, 200),
            body: text(item.body),
            read: item.read === true,
            receivedAt: Number(item.receivedAt) || 0,
        }));
    return JSON.stringify({version: PERSIST_VERSION, items: rows});
}

// Rebuild rows from a snapshot. Corrupt input yields an empty history, read rows
// past the retention window are dropped, and unread rows are always kept.
export function restoreMessages(raw, {now = Date.now(), isChat = () => true, limit = 100} = {}) {
    let parsed;
    try {
        parsed = JSON.parse(raw || '{}');
    } catch (_error) {
        return {items: [], nextId: 0};
    }
    if (!parsed || parsed.version !== PERSIST_VERSION || !Array.isArray(parsed.items))
        return {items: [], nextId: 0};

    const seen = new Set();
    const items = [];
    for (const row of parsed.items) {
        if (!row || typeof row !== 'object')
            continue;
        const id = Number(row.id);
        if (!Number.isInteger(id) || id <= 0 || seen.has(id))
            continue;
        const receivedAt = Number(row.receivedAt);
        if (!Number.isFinite(receivedAt) || receivedAt <= 0 || receivedAt > now + 60_000)
            continue;
        const read = row.read === true;
        if (read && now - receivedAt > READ_RETENTION_MS)
            continue;
        const item = {
            id,
            source: null,
            notification: null,
            app: text(row.app, 80) || 'Chat',
            appKey: text(row.appKey, 60),
            appId: text(row.appId, 200),
            appIconName: text(row.appIconName, 120) || null,
            appIconFile: text(row.appIconFile, 400) || null,
            title: text(row.title, 200),
            body: text(row.body),
            read,
            receivedAt,
            detached: false,
            restored: true,
        };
        if (!isChat(item) || !(item.title || item.body))
            continue;
        seen.add(id);
        items.push(item);
    }
    items.sort((first, second) => second.receivedAt - first.receivedAt);
    const kept = items.slice(0, limit);
    return {items: kept, nextId: kept.reduce((max, item) => Math.max(max, item.id), 0)};
}
