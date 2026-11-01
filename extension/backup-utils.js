// SPDX-License-Identifier: GPL-3.0-or-later
// Backup validation is pure JavaScript; file access stays in the GNOME extension.

export const BACKUP_APP = 'perdana-island';
export const BACKUP_FORMAT = 1;
export const BACKUP_MAX_BYTES = 5 * 1024 * 1024;

const LOCAL_ONLY_PREFERENCES = new Set([
    'keepAwake', 'lastWaterAt', 'lastWaterLogAt', 'lastWaterReminderAt',
    'lastPrayerNotice', 'agendaNoticeDay', 'greetingState',
    'lastAgendaBriefing', 'lastAgendaRecap', 'greetingWelcomeShown', 'greetingLastSession',
]);
const BOOLEAN_PREFERENCES = new Set([
    'glass', 'browserOverlap', 'showRestingLyrics', 'smartMusicDetection', 'systemNotices',
    'morningAgenda', 'eveningRecap', 'focusGuard', 'waterReminder', 'prayerReminder',
    'greetingEnabled',
]);
const STRING_PREFERENCE_LIMITS = new Map([
    ['theme', 40], ['accentColor', 16], ['fontFamily', 80], ['islandShape', 24],
    ['restingStyle', 24], ['prayerCity', 120], ['shelfView', 24],
    ['greetingNameSource', 20], ['greetingCustomName', 40],
    ['greetingWelcomeText', 56], ['greetingReturnText', 56], ['positionMode', 20],
]);

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cleanBooleanMap(value) {
    const clean = Object.create(null);
    if (!isObject(value))
        return clean;
    for (const [key, enabled] of Object.entries(value).slice(0, 64)) {
        if (/^[a-z0-9-]{1,48}$/i.test(key) && typeof enabled === 'boolean')
            clean[key] = enabled;
    }
    return clean;
}

function cleanPreferences(value) {
    const clean = Object.create(null);
    if (!isObject(value))
        return clean;
    for (const [key, preference] of Object.entries(value)) {
        if (LOCAL_ONLY_PREFERENCES.has(key))
            continue;
        if (BOOLEAN_PREFERENCES.has(key) && typeof preference === 'boolean') {
            clean[key] = preference;
        } else if (STRING_PREFERENCE_LIMITS.has(key) && typeof preference === 'string') {
            clean[key] = preference.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0,
                STRING_PREFERENCE_LIMITS.get(key));
        } else if (['notificationSources', 'visiblePages'].includes(key) && isObject(preference)) {
            clean[key] = cleanBooleanMap(preference);
        } else if (key === 'tabOrder' && Array.isArray(preference)) {
            clean[key] = [...new Set(preference.filter(item => typeof item === 'string'
                && /^[a-z0-9-]{1,40}$/i.test(item)))].slice(0, 64);
        } else if (key === 'prayerMethod' && Number.isInteger(preference)
            && preference >= 0 && preference <= 1000) {
            clean[key] = preference;
        } else if (['positionX', 'positionY'].includes(key) && Number.isFinite(preference)) {
            clean[key] = Math.min(1, Math.max(0, preference));
        }
    }
    return clean;
}

function isValidDateKey(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function cleanTasks(value) {
    if (!Array.isArray(value))
        return [];
    const tasks = [];
    for (const task of value) {
        if (!isObject(task) || typeof task.text !== 'string')
            continue;
        const text = task.text.trim().slice(0, 120);
        if (!text)
            continue;
        tasks.push({
            id: typeof task.id === 'string' && task.id ? task.id.slice(0, 120) : `task-${tasks.length}`,
            text,
            done: task.done === true,
            doneAt: typeof task.doneAt === 'string' ? task.doneAt.slice(0, 40) : null,
            due: Number.isInteger(task.due) && task.due >= 0 && task.due < 24 * 60 ? task.due : null,
            dueDate: isValidDateKey(task.dueDate) ? task.dueDate : null,
            priority: ['high', 'medium', 'low'].includes(task.priority) ? task.priority : null,
        });
        if (tasks.length >= 5000)
            break;
    }
    return tasks;
}

function cleanNotes(value) {
    if (!Array.isArray(value))
        return [];
    const notes = [];
    for (const note of value) {
        if (!isObject(note) || typeof note.text !== 'string')
            continue;
        const text = note.text.trim().slice(0, 12000);
        if (!text)
            continue;
        notes.push({
            id: typeof note.id === 'string' && note.id ? note.id.slice(0, 120) : `note-${notes.length}`,
            text,
            updatedAt: Number.isFinite(note.updatedAt) ? note.updatedAt
                : Number.isFinite(note.updated) ? note.updated : 0,
        });
        if (notes.length >= 5000)
            break;
    }
    return notes;
}

function cleanFocusLog(value) {
    if (!isObject(value))
        return {};
    const log = {};
    let count = 0;
    for (const [day, seconds] of Object.entries(value)) {
        if (!isValidDateKey(day) || !Number.isFinite(seconds) || seconds <= 0)
            continue;
        log[day] = Math.round(seconds);
        if (++count >= 1000)
            break;
    }
    return log;
}

function buildOptions(options) {
    if (options instanceof Date)
        return {now: options, version: ''};
    return {
        now: options?.now instanceof Date ? options.now : new Date(),
        version: typeof options?.version === 'string' || typeof options?.version === 'number'
            ? String(options.version) : '',
    };
}

/** Create the portable v1 format; machine-local state and private clipboard data are excluded. */
export function buildBackup(state = {}, options = {}) {
    const {now, version} = buildOptions(options);
    const data = {
        preferences: cleanPreferences(state?.preferences),
        tasks: cleanTasks(state?.tasks),
        notes: cleanNotes(state?.notes),
        focusLog: cleanFocusLog(state?.focusLog),
    };
    return {
        app: BACKUP_APP,
        format: BACKUP_FORMAT,
        createdAt: now.toISOString(),
        appVersion: version,
        data,
    };
}

export function backupFileName(now = new Date()) {
    const pad = value => String(value).padStart(2, '0');
    return `perdana-island-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

// Accept both the nested v79 format and the earlier flat local format.
export function validateBackup(text) {
    if (typeof text !== 'string' || !text.trim())
        return {ok: false, reason: 'The file is empty.'};
    if (new TextEncoder().encode(text).length > BACKUP_MAX_BYTES)
        return {ok: false, reason: 'The file is too large to be a backup.'};

    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (_error) {
        return {ok: false, reason: 'The file is not valid JSON.'};
    }
    if (!isObject(parsed) || parsed.app !== BACKUP_APP)
        return {ok: false, reason: 'This file was not made by Perdana Island.'};

    const format = Number(parsed.format);
    if (!Number.isInteger(format) || format < 1)
        return {ok: false, reason: 'The backup format is missing or invalid.'};
    if (format > BACKUP_FORMAT)
        return {ok: false, reason: 'This backup is from a newer version. Update Perdana Island first.'};
    if (format !== BACKUP_FORMAT)
        return {ok: false, reason: 'This backup format is not supported.'};

    const nested = Object.prototype.hasOwnProperty.call(parsed, 'data');
    if (nested && !isObject(parsed.data))
        return {ok: false, reason: 'The backup content is incomplete or damaged.'};
    const source = nested ? parsed.data : parsed;
    if (!nested && (!Array.isArray(source.tasks) || !Array.isArray(source.notes)
        || !isObject(source.preferences) || !isObject(source.focusLog))) {
        return {ok: false, reason: 'The backup content is incomplete or damaged.'};
    }

    const tasks = cleanTasks(source.tasks);
    const notes = cleanNotes(source.notes);
    const focusLog = cleanFocusLog(source.focusLog);
    const preferences = cleanPreferences(source.preferences);
    if (!tasks.length && !notes.length && !Object.keys(focusLog).length
        && !Object.keys(preferences).length) {
        return {ok: false, reason: 'The backup contains no data to restore.'};
    }

    return {
        ok: true,
        data: {tasks, notes, focusLog, preferences},
        summary: {
            tasks: tasks.length,
            notes: notes.length,
            focusDays: Object.keys(focusLog).length,
            settings: Object.keys(preferences).length > 0,
        },
        createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : '',
        appVersion: typeof parsed.appVersion === 'string' ? parsed.appVersion : '',
    };
}

export function summarizeBackup(summary) {
    const parts = [
        `${summary.tasks} ${summary.tasks === 1 ? 'task' : 'tasks'}`,
        `${summary.notes} ${summary.notes === 1 ? 'note' : 'notes'}`,
        `${summary.focusDays} focus ${summary.focusDays === 1 ? 'day' : 'days'}`,
    ];
    if (summary.settings)
        parts.push('settings');
    return parts.join(' · ');
}
