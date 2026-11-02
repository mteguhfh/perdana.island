// Natural-language parsing for local Quick Capture. No network or shell imports.

const WEEKDAYS = new Map([
    ['minggu', 0], ['ahad', 0], ['sunday', 0],
    ['senin', 1], ['monday', 1],
    ['selasa', 2], ['tuesday', 2],
    ['rabu', 3], ['wednesday', 3],
    ['kamis', 4], ['thursday', 4],
    ['jumat', 5], ["jum'at", 5], ['friday', 5],
    ['sabtu', 6], ['saturday', 6],
]);

const MONTHS = new Map([
    ['jan', 0], ['januari', 0], ['january', 0],
    ['feb', 1], ['februari', 1], ['february', 1],
    ['mar', 2], ['maret', 2], ['march', 2],
    ['apr', 3], ['april', 3],
    ['mei', 4], ['may', 4],
    ['jun', 5], ['juni', 5], ['june', 5],
    ['jul', 6], ['juli', 6], ['july', 6],
    ['agu', 7], ['agustus', 7], ['august', 7],
    ['sep', 8], ['september', 8],
    ['okt', 9], ['oktober', 9], ['oct', 9], ['october', 9],
    ['nov', 10], ['november', 10],
    ['des', 11], ['desember', 11], ['dec', 11], ['december', 11],
]);

const PERIODS = new Map([
    ['pagi', {name: 'pagi', minute: 8 * 60}],
    ['morning', {name: 'morning', minute: 8 * 60}],
    ['siang', {name: 'siang', minute: 12 * 60}],
    ['afternoon', {name: 'afternoon', minute: 13 * 60}],
    ['sore', {name: 'sore', minute: 16 * 60}],
    ['evening', {name: 'evening', minute: 18 * 60}],
    ['malam', {name: 'malam', minute: 19 * 60}],
    ['night', {name: 'night', minute: 19 * 60}],
]);

function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function shiftDays(date, days) {
    const shifted = startOfDay(date);
    shifted.setDate(shifted.getDate() + days);
    return shifted;
}

function dateFromParts(year, month, day) {
    const date = new Date(year, month, day);
    return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
        ? date : null;
}

function resolveHour(hour, period, suffix) {
    if (!Number.isInteger(hour) || !Number.isInteger(period?.minute ?? 0))
        return null;
    if (suffix) {
        if (hour < 1 || hour > 12)
            return null;
        if (suffix === 'pm')
            return hour === 12 ? 12 : hour + 12;
        return hour === 12 ? 0 : hour;
    }
    if (hour < 0 || hour > 23)
        return null;
    if (!period)
        return hour;
    if (['pagi', 'morning'].includes(period.name))
        return hour === 12 ? 0 : hour;
    if (['malam', 'night'].includes(period.name))
        return hour === 12 ? 0 : (hour < 12 ? hour + 12 : hour);
    return hour === 12 ? 12 : (hour < 12 ? hour + 12 : hour);
}

function removeFirst(text, pattern) {
    const match = text.match(pattern);
    return match ? {text: text.replace(pattern, ' '), match} : null;
}

function parseTime(text, period) {
    const patterns = [
        /\b(?:jam|pukul)\s*(\d{1,2})(?:[:.](\d{1,2}))?\s*(am|pm)?\b/i,
        /\b(?:at|pada)\s+(\d{1,2})(?:[:.](\d{1,2}))?\s*(am|pm)?\b/i,
        /\b(\d{1,2})(?:[:.](\d{1,2}))?\s*(am|pm)\b/i,
        /\b(\d{1,2})[:.](\d{1,2})\b/,
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (!match)
            continue;
        const rawHour = Number(match[1]);
        const minute = match[2] === undefined ? 0 : Number(match[2]);
        const suffix = match[3]?.toLowerCase() ?? null;
        const hour = resolveHour(rawHour, period, suffix);
        if (hour === null || !Number.isInteger(minute) || minute < 0 || minute > 59)
            continue;
        return {
            text: text.replace(pattern, ' '),
            time: {h: hour, m: minute},
            token: match[0].trim(),
        };
    }
    return null;
}

function notePrefix(text) {
    const prefix = text.match(/^\s*(?:!?catatan|catat|note)\s*[:\-]\s*/i)
        || text.match(/^\s*(?:!?catatan|catat|note)\s+/i);
    if (prefix)
        return {text: text.slice(prefix[0].length), token: prefix[0].trim()};
    const suffix = text.match(/\s+\/note\s*$/i);
    if (suffix)
        return {text: text.slice(0, suffix.index), token: suffix[0].trim()};
    return null;
}

function futureMonthDate(month, day, now) {
    const today = startOfDay(now);
    for (let year = now.getFullYear(); year <= now.getFullYear() + 8; year++) {
        const candidate = dateFromParts(year, month, day);
        if (candidate && candidate >= today)
            return candidate;
    }
    return null;
}

/**
 * Parse a task or note while preserving the shape used by the current island UI.
 * Supports Indonesian/English dates, times, day periods and priority markers.
 */
export function parseCapture(input, now = new Date()) {
    const raw = String(input ?? '').replace(/\s+/g, ' ').trim();
    const result = {
        mode: 'task', title: '', day: null, time: null, period: null,
        priority: null, timeFromRule: null,
    };
    if (!raw)
        return result;

    let text = raw;
    const note = notePrefix(text);
    if (note) {
        result.mode = 'note';
        // The prefix and suffix forms are removed separately to keep punctuation intact.
        if (note.token.startsWith('/'))
            text = raw.slice(0, raw.length - note.token.length).trim();
        else
            text = raw.slice(note.token.length).trim();
    }

    let day = null;
    let relative = removeFirst(text, /\b(hari ini|today|besok|esok|tomorrow|lusa|tonight)\b/i);
    if (relative) {
        const keyword = relative.match[1].toLowerCase();
        text = relative.text;
        if (keyword === 'hari ini' || keyword === 'today' || keyword === 'tonight') {
            day = startOfDay(now);
        } else if (keyword === 'lusa') {
            day = shiftDays(now, 2);
        } else {
            day = shiftDays(now, 1);
        }
        if (keyword === 'tonight')
            result.period = 'malam';
    }

    if (!day) {
        const weekdayPattern = new RegExp(`\\b(${[...WEEKDAYS.keys()].sort((a, b) => b.length - a.length).join('|')})\\b`, 'i');
        const weekday = text.match(weekdayPattern);
        if (weekday) {
            const target = WEEKDAYS.get(weekday[1].toLowerCase());
            const delta = (target - now.getDay() + 7) % 7;
            day = shiftDays(now, delta);
            text = text.replace(weekdayPattern, ' ');
        }
    }

    if (!day) {
        const monthDayPattern = new RegExp(`\\b(\\d{1,2})\\s+(${[...MONTHS.keys()].sort((a, b) => b.length - a.length).join('|')})\\b`, 'i');
        const monthDay = text.match(monthDayPattern);
        if (monthDay) {
            const candidate = futureMonthDate(MONTHS.get(monthDay[2].toLowerCase()), Number(monthDay[1]), now);
            if (candidate) {
                day = candidate;
                text = text.replace(monthDayPattern, ' ');
            }
        }
    }

    const periodPattern = /\b(pagi|siang|sore|malam|morning|afternoon|evening|night)\b/i;
    const periodMatch = text.match(periodPattern);
    let period = null;
    if (periodMatch) {
        period = PERIODS.get(periodMatch[1].toLowerCase());
        if (period) {
            result.period = period.name;
            text = text.replace(periodPattern, ' ');
        }
    } else if (result.period) {
        period = PERIODS.get(result.period);
    }

    const parsedTime = parseTime(text, period);
    let dueTime = null;
    if (parsedTime) {
        text = parsedTime.text;
        result.time = parsedTime.time;
        result.timeFromRule = 'clock';
        dueTime = parsedTime.time.h * 60 + parsedTime.time.m;
    } else if (period) {
        result.time = {h: Math.floor(period.minute / 60), m: period.minute % 60};
        result.timeFromRule = 'period';
        dueTime = period.minute;
    }

    if (!day && dueTime !== null) {
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        day = dueTime <= nowMinutes ? shiftDays(now, 1) : startOfDay(now);
    }

    const priorityPatterns = [
        [/\s*!(?:high|tinggi|penting|urgent)\b/i, 'High'],
        [/\s*!(?:low|rendah)\b/i, 'Low'],
        [/^\s*(?:penting|urgent|mendesak)\s*[:,-]?\s*/i, 'High'],
        [/\s+(?:penting|urgent|mendesak)\s*$/i, 'High'],
        [/\s+(?:rendah|santai)\s*$/i, 'Low'],
        [/\s+(?:high priority|top priority)\s*$/i, 'High'],
        [/\s+low priority\s*$/i, 'Low'],
    ];
    for (const [pattern, priority] of priorityPatterns) {
        if (pattern.test(text)) {
            text = text.replace(pattern, ' ');
            result.priority = priority;
            break;
        }
    }

    result.title = text
        .replace(/\s+/g, ' ')
        .replace(/\s+([,.;:!?])/g, '$1')
        .replace(/^[,.;:\-–\s]+|[,.;:\-–\s]+$/g, '')
        .trim();
    if (!result.title && result.mode !== 'note')
        result.title = raw;
    result.day = day;
    return result;
}

/**
 * Build the preview chips shown under the Quick Capture entry.
 * Kept in this pure module so the panel renderer stays free of parser details.
 */
export function captureChips(result) {
    const chips = [
        {text: result.mode === 'note' ? 'Catatan' : 'Tugas', style: ''},
        {text: result.title || 'Judul kosong', style: 'title'},
    ];
    if (result.day)
        chips.push({text: result.day.toLocaleDateString('id-ID', {
            weekday: 'short', day: 'numeric', month: 'short',
        }), style: ''});
    if (result.time)
        chips.push({text: `${String(result.time.h).padStart(2, '0')}:${String(result.time.m).padStart(2, '0')}`, style: ''});
    if (result.priority)
        chips.push({text: `! ${result.priority}`, style: 'priority'});
    if (result.period)
        chips.push({text: result.period, style: ''});
    return chips;
}
