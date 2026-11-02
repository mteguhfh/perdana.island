// Pure prayer and water-reminder rules. Network and GNOME timezone access stay in extension.js.
export const WATER_REMINDER_SECONDS = 60 * 60;
export const WATER_WINDOW_START = 8 * 60;
export const WATER_WINDOW_END = 21 * 60;
export const PRAYER_NAMES = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
export const PRAYER_METHODS = [[20, 'Kemenag'], [3, 'MWL'], [2, 'ISNA'], [4, 'Umm al-Qura']];

function dateKey(date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

function formatClockTime(minutes) {
    const value = Math.max(0, Math.min(1439, Math.round(Number(minutes) || 0)));
    return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export function parsePrayerTimings(timings) {
    if (!timings || typeof timings !== 'object')
        throw new Error('Prayer timings missing');
    const times = {};
    for (const name of PRAYER_NAMES) {
        const match = String(timings[name] || '').match(/^(\d{1,2}):(\d{2})/);
        if (!match)
            continue;
        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        if (hours <= 23 && minutes <= 59)
            times[name] = hours * 60 + minutes;
    }
    return times;
}

export function prayerCacheIsValid(cache, {date = new Date(), city = '', method} = {}) {
    return Boolean(cache && cache.date === dateKey(date) && cache.city === city
        && cache.method === method && PRAYER_NAMES.every(name => Number.isInteger(cache.times?.[name])));
}

export function nextPrayer(times, now = new Date()) {
    if (!times)
        return {name: null, minutes: null, tomorrow: false, minutesUntil: null};
    const current = now.getHours() * 60 + now.getMinutes();
    const today = PRAYER_NAMES.find(name => times[name] > current) || null;
    const name = today || PRAYER_NAMES[0];
    const minutesUntil = today ? times[name] - current : 24 * 60 - current + times[name];
    return {name, minutes: times[name], tomorrow: !today, minutesUntil};
}

export function prayerStatus({enabled = false, loading = false, error = null, times = null, now = new Date()} = {}) {
    if (!enabled)
        return 'Prayer reminders are off';
    if (loading)
        return 'Loading prayer times...';
    if (error)
        return error;
    if (!times)
        return 'No prayer times for today yet';
    const next = nextPrayer(times, now);
    return next.tomorrow ? 'All prayers passed for today' : `Next: ${next.name} ${formatClockTime(next.minutes)}`;
}

export function waterSummary({enabled = false, lastReminderAt = 0, lastLogAt = 0, now = new Date()} = {}) {
    if (!enabled)
        return {caption: 'Water reminder', value: 'Off', detail: 'Turn on in Settings', progress: 0};
    const minutes = now.getHours() * 60 + now.getMinutes();
    if (minutes < WATER_WINDOW_START)
        return {caption: 'Next glass', value: '08:00', detail: 'Quiet hours until then', progress: 0};
    if (minutes >= WATER_WINDOW_END)
        return {caption: 'Next glass', value: '08:00', detail: 'Resumes tomorrow', progress: 0};
    const lastLogDate = lastLogAt ? new Date(lastLogAt * 1000) : null;
    const detail = lastLogDate
        ? `Last glass ${formatClockTime(lastLogDate.getHours() * 60 + lastLogDate.getMinutes())}`
        : 'No glass logged yet';
    if (!lastReminderAt)
        return {caption: 'Next glass', value: 'Now', detail, progress: 0.04};
    const remaining = Math.min(WATER_REMINDER_SECONDS,
        Math.max(0, lastReminderAt + WATER_REMINDER_SECONDS - Math.floor(now.getTime() / 1000)));
    return {
        caption: 'Next glass',
        value: remaining <= 0 ? 'Now' : `${Math.ceil(remaining / 60)} min`,
        detail,
        progress: remaining > 0 ? remaining / WATER_REMINDER_SECONDS : 0.04,
    };
}

export function waterTabLabel(value) {
    if (value === 'Now' || value === 'Off' || value.includes(':'))
        return `Water ${value}`;
    const minutes = Number.parseInt(value, 10);
    return `Water ${Number.isFinite(minutes) ? `${minutes}m` : value}`;
}
