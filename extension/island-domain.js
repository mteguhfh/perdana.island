// Pure helpers shared by island pages. Keep this module independent of GJS.
export const TAB_BAR_KEYS = [
    'summary', 'lyrics', 'focus', 'tasks', 'notes', 'shelf',
    'messages', 'notifications', 'today', 'reminders', 'settings',
];

const FOCUS_DISTRACTIONS = [
    ['youtube', 'YouTube'], ['netflix', 'Netflix'], ['twitch', 'Twitch'],
    ['tiktok', 'TikTok'], ['instagram', 'Instagram'], ['facebook', 'Facebook'],
    ['reddit', 'Reddit'], ['x.com', 'X'], ['twitter', 'X'],
];

export function normalizeTabOrder(value) {
    const order = [];
    for (const key of Array.isArray(value) ? value : []) {
        if (TAB_BAR_KEYS.includes(key) && !order.includes(key))
            order.push(key);
    }
    for (const key of TAB_BAR_KEYS) {
        if (!order.includes(key))
            order.push(key);
    }
    return order;
}

export function clampUnit(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback;
}

export function taskScheduleKey(task) {
    return task?.dueDate
        ? `${task.dueDate} ${Number.isInteger(task.due) ? String(task.due).padStart(4, '0') : '9999'}`
        : '9999-99-99 9999';
}

export const TASK_PRIORITIES = ['high', 'medium', 'low'];

export function createTask({id, text, due = null, priority = null, dueDate = null, now = new Date()}) {
    const trimmed = String(text || '').trim().slice(0, 120);
    if (!trimmed)
        return null;
    const scheduleDate = typeof dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dueDate)
        ? dueDate
        : Number.isInteger(due) ? dateKey(now) : null;
    return {
        id,
        text: trimmed,
        done: false,
        doneAt: null,
        due: Number.isInteger(due) ? due : null,
        dueDate: scheduleDate,
        priority: TASK_PRIORITIES.includes(priority) ? priority : null,
    };
}

export function agendaTasks(tasks, key = dateKey()) {
    return tasks
        .filter(task => !task.done && task.dueDate === key)
        .sort((first, second) => (first.due ?? Number.MAX_SAFE_INTEGER)
            - (second.due ?? Number.MAX_SAFE_INTEGER));
}

export function tasksDoneOnDate(tasks, date = new Date()) {
    const key = dateKey(date);
    return tasks.filter(task => task.done && task.doneAt && dateKey(new Date(task.doneAt)) === key);
}

export function toggleTask(tasks, id, now = new Date()) {
    return tasks.map(task => task.id === id
        ? {...task, done: !task.done, doneAt: task.done ? null : now.toISOString()}
        : task);
}

export function setTaskTime(tasks, id, minutes, now = new Date()) {
    return tasks.map(task => task.id === id
        ? {
            ...task,
            due: Number.isInteger(minutes) ? minutes : null,
            dueDate: task.dueDate || (Number.isInteger(minutes) ? dateKey(now) : null),
        }
        : task);
}

export function cycleTaskPriority(tasks, id) {
    const order = [null, ...TASK_PRIORITIES];
    return tasks.map(task => {
        if (task.id !== id)
            return task;
        const index = order.indexOf(task.priority ?? null);
        return {...task, priority: order[(index + 1) % order.length]};
    });
}

export function dailyReportText(tasks, focusLog = {}, now = new Date()) {
    const formatted = new Intl.DateTimeFormat('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
    }).format(now);
    const agenda = agendaTasks(tasks, dateKey(now));
    const done = tasksDoneOnDate(tasks, now).length;
    const open = tasks.filter(task => !task.done).length;
    const focus = Math.round((Number(focusLog[dateKey(now)]) || 0) / 60);
    const lines = [
        `Perdana Island · ${formatted}`,
        `Tasks done: ${done}`,
        `Open tasks: ${open}`,
    ];
    if (agenda.length) {
        lines.push(`Scheduled: ${agenda
            .map(task => `${Number.isInteger(task.due) ? `${formatClockTime(task.due)} ` : ''}${task.text}`)
            .join(', ')}`);
    }
    lines.push(`Focus: ${focus} min`);
    return lines.join('\n');
}

export function distractionLabel(identity) {
    const text = String(identity || '').toLowerCase();
    if (!text)
        return null;
    for (const [needle, label] of FOCUS_DISTRACTIONS) {
        if (needle.includes('.')) {
            const pattern = new RegExp(`(^|[^a-z0-9])${needle.replace(/\./g, '\\.')}($|[^a-z0-9])`);
            if (pattern.test(text))
                return label;
        } else if (text.includes(needle)) {
            return label;
        }
    }
    return null;
}

export function splitCity(value) {
    const text = String(value || '').trim();
    if (!text)
        return ['', 'Indonesia'];
    const [city, ...rest] = text.split(',');
    return [city.trim(), rest.join(',').trim() || 'Indonesia'];
}

export function formatTime(totalSeconds) {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`;
}

export function dateKey(date = new Date()) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

export function parseClockTime(value) {
    const match = String(value || '').trim().match(/^(\d{1,2})[:.](\d{2})$/);
    if (!match)
        return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    return hours > 23 || minutes > 59 ? null : hours * 60 + minutes;
}

export function formatClockTime(minutes) {
    const value = Math.max(0, Math.min(1439, Math.round(Number(minutes) || 0)));
    return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export function normalizeHexColor(value) {
    const match = String(value || '').trim().match(/^#?([a-f\d]{6})$/i);
    return match ? `#${match[1].toUpperCase()}` : null;
}

export function hexColorToRgb(value, fallback = '#5577B8') {
    const normalized = normalizeHexColor(value) || fallback;
    return [1, 3, 5].map(offset => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255);
}

export function isoWeekNumber(date) {
    const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const weekday = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - weekday);
    const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    return Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
}

export function formatMinutesSeconds(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function summaryTaskState(tasks) {
    const pending = tasks.filter(task => !task.done);
    return {
        pending,
        completed: Math.max(0, tasks.length - pending.length),
        subtitle: pending[0]?.text || (tasks.length ? 'All tasks done' : 'No tasks yet'),
        value: `${Math.max(0, tasks.length - pending.length)}/${tasks.length}`,
    };
}

export function formatStorageGiB(bytes) {
    return (Math.max(0, Number(bytes) || 0) / 1_073_741_824).toFixed(1);
}

export function todayMetricValues({cpuPercent = null, totalKiB = 0, usedKiB = 0,
    diskTotal = 0, diskFree = 0, battery = null} = {}) {
    const gb = bytes => formatStorageGiB(bytes);
    return {
        cpu: cpuPercent === null
            ? {value: '—', detail: 'Sampling processor', progress: 0}
            : {value: `${cpuPercent}%`, detail: 'Processor use', progress: cpuPercent / 100},
        memory: totalKiB
            ? {value: `${Math.round(usedKiB / totalKiB * 100)}%`,
                detail: `${gb(usedKiB * 1024)} / ${gb(totalKiB * 1024)} GB`, progress: usedKiB / totalKiB}
            : {value: '—', detail: 'Memory unavailable', progress: 0},
        disk: diskTotal
            ? {value: `${gb(diskFree)} GB`, detail: `free of ${gb(diskTotal)} GB`,
                progress: 1 - diskFree / diskTotal}
            : {value: '—', detail: 'Storage unavailable', progress: 0},
        battery: battery
            ? {value: `${battery.percent}%`,
                detail: battery.connected ? (battery.status === 'Full' ? 'Plugged in' : 'Charging')
                    : battery.status || 'Discharging', progress: battery.percent / 100}
            : {value: '—', detail: 'No battery detected', progress: 0},
    };
}
