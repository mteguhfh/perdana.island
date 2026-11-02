// Pure note data rules. File access and GNOME actors stay in extension.js.
export const MAX_NOTES = 60;
export const NOTE_MAX_CHARS = 12000;

export function normalizeNotes(value, {now = Date.now()} = {}) {
    if (!Array.isArray(value))
        return [];
    return value
        .filter(note => note && typeof note.id === 'string' && typeof note.text === 'string')
        .map(note => ({
            id: note.id,
            text: note.text.slice(0, NOTE_MAX_CHARS),
            updatedAt: Number.isFinite(note.updatedAt) ? note.updatedAt : now,
        }))
        .sort((first, second) => second.updatedAt - first.updatedAt)
        .slice(0, MAX_NOTES);
}

export function noteTitle(note) {
    const line = String(note?.text || '').split('\n').map(item => item.trim()).find(item => item.length);
    if (!line)
        return 'Empty note';
    return line.length > 64 ? `${line.slice(0, 63)}…` : line;
}

export function notePreview(note) {
    const lines = String(note?.text || '').split('\n').map(item => item.trim()).filter(item => item.length);
    if (!lines.length)
        return 'No text yet';
    const rest = lines.slice(1).join(' ');
    if (!rest)
        return 'Single line';
    return rest.length > 80 ? `${rest.slice(0, 79)}…` : rest;
}

export function noteDateText(updatedAt, now = new Date()) {
    const date = new Date(Number(updatedAt) || now.getTime());
    const today = dateKey(now);
    if (dateKey(date) === today)
        return new Intl.DateTimeFormat('en-GB', {hour: '2-digit', minute: '2-digit'}).format(date);
    return new Intl.DateTimeFormat('en-GB', {day: '2-digit', month: 'short'}).format(date);
}

export function noteWordCount(text) {
    const trimmed = String(text || '').trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function notesStatusLine(state, note) {
    if (!note)
        return state;
    const words = noteWordCount(note.text);
    return `${state} · ${words} ${words === 1 ? 'word' : 'words'}`;
}

export function trimNoteText(text) {
    return String(text || '').slice(0, NOTE_MAX_CHARS);
}

export function dropEmptyNotes(notes, selectedId = null) {
    const filtered = notes.filter(note => note.text.trim() !== '');
    if (filtered.length === notes.length)
        return {notes, selectedId};
    const selectedStillExists = filtered.some(note => note.id === selectedId);
    const nextId = selectedStillExists ? selectedId
        : [...filtered].sort((first, second) => second.updatedAt - first.updatedAt)[0]?.id || null;
    return {notes: filtered, selectedId: nextId};
}

function dateKey(date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}
