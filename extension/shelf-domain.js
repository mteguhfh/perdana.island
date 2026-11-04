// Pure Shelf entry rules. Gio directory enumeration remains in extension.js.
export const SHELF_LIMIT = 10;

export function normalizeShelfItems(entries, directory) {
    if (!Array.isArray(entries))
        return [];
    return entries
        .filter(entry => entry && entry.type === 'regular' && typeof entry.name === 'string')
        .map(entry => ({
            name: entry.name,
            contentType: entry.contentType || 'application/octet-stream',
            path: directory ? `${directory}/${entry.name}` : entry.path,
        }))
        .sort((first, second) => first.name.localeCompare(second.name));
}

export function shelfAvailableSlots(count, limit = SHELF_LIMIT) {
    return Math.max(0, limit - count);
}
