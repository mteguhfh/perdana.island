// Pure notification and Messages rules. MessageTray objects stay in extension.js.
export const CHAT_SOURCE_KEYS = new Set([
    'whatsapp', 'discord', 'telegramWeb', 'telegramDesktop', 'googleChat',
]);

export function isChatItem(item) {
    return CHAT_SOURCE_KEYS.has(item?.appKey);
}

export function visibleChatItems(items, isSourceEnabled = () => true) {
    return (Array.isArray(items) ? items : [])
        .filter(isChatItem)
        .filter(item => isSourceEnabled(item.appKey));
}

export function visibleNotifications(items, isSourceEnabled = () => true) {
    return (Array.isArray(items) ? items : []).filter(item => isSourceEnabled(item.appKey));
}

export function unreadCount(items) {
    return items.filter(item => !item.read).length;
}

export function latestChatItem(items) {
    return items.find(item => !item.read) || items[0] || null;
}

export function normalizeNotificationText(value, appKey = null) {
    let text = String(value || '').replace(/[\r\n\t\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text)
        return '';
    if (CHAT_SOURCE_KEYS.has(appKey)) {
        text = text.replace(/(?:https?:\/\/)?(?:web\.)?whatsapp\.com(?:\/\S*)?/ig, ' ')
            .replace(/(?:https?:\/\/)?web(?:k|a)?\.telegram\.org(?:\/\S*)?/ig, ' ')
            .replace(/(?:https?:\/\/)?chat\.google\.com(?:\/\S*)?/ig, ' ')
            .replace(/(?:https?:\/\/)?chat\.googleusercontent\.com(?:\/\S*)?/ig, ' ')
            .replace(/(?:https?:\/\/)?mail\.google\.com\/chat(?:\/\S*)?/ig, ' ')
            .replace(/(?:https?:\/\/)?mail\.google\.com\/mail\/\S*#chat\S*/ig, ' ')
            .replace(/\s+/g, ' ')
            .replace(/^[\s·•|:–—]+|[\s·•|:–—]+$/g, '')
            .trim();
    }
    return text;
}

export function notificationSummary(items, isSourceEnabled = () => true) {
    const chats = visibleChatItems(items, isSourceEnabled);
    const latest = latestChatItem(chats);
    return {items: chats, latest, unread: unreadCount(chats)};
}
