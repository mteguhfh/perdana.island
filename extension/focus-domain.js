// Pure focus-log rules. Persistence and timer lifecycle stay in extension.js.
export const FOCUS_LOG_RETENTION_DAYS = 60;

function dateKey(date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

export function normalizeFocusLog(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return {};
    return Object.fromEntries(Object.entries(value)
        .filter(([key, seconds]) => /^\d{4}-\d{2}-\d{2}$/.test(key)
            && Number.isFinite(Number(seconds)) && Number(seconds) >= 0)
        .map(([key, seconds]) => [key, Math.round(Number(seconds))]));
}

export function focusSecondsOnDate(focusLog, date = new Date()) {
    return Number(focusLog?.[dateKey(date)]) || 0;
}

export function recordFocusSeconds(focusLog, seconds, date = new Date(), retentionDays = FOCUS_LOG_RETENTION_DAYS) {
    const amount = Math.max(0, Math.round(Number(seconds) || 0));
    const next = normalizeFocusLog(focusLog);
    if (!amount)
        return null;

    const today = dateKey(date);
    next[today] = (next[today] || 0) + amount;
    const cutoff = new Date(date);
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const oldest = dateKey(cutoff);
    for (const key of Object.keys(next)) {
        if (key < oldest)
            delete next[key];
    }
    return next;
}
