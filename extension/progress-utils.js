// SPDX-License-Identifier: GPL-3.0-or-later

const PARTIAL_SUFFIXES = ['.part', '.crdownload', '.download', '.opdownload'];
const ARIA2_SUFFIX = '.aria2';
const MAX_ACTIVITY_TEXT = 120;
const ACTIVITY_ICON_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;
const DEFAULT_ACTIVITY_ICON = 'folder-download-symbolic';

export function normalizeProgress(value) {
    if (value === null || value === undefined || value === '')
        return null;
    const progress = Number(value);
    if (!Number.isFinite(progress) || progress < 0)
        return null;
    return Math.min(1, progress);
}

export function cleanActivityText(value, maxLength = MAX_ACTIVITY_TEXT) {
    const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (text.length <= maxLength)
        return text;
    return `${text.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

export function cleanActivityId(value) {
    return cleanActivityText(value, 160);
}

export function cleanActivityIcon(value) {
    const icon = cleanActivityText(value, 64);
    return ACTIVITY_ICON_PATTERN.test(icon) ? icon : DEFAULT_ACTIVITY_ICON;
}

export function partialSuffix(name) {
    const lower = String(name ?? '').toLowerCase();
    return PARTIAL_SUFFIXES.find(suffix => lower.endsWith(suffix)) || null;
}

export function isPartialFile(name) {
    return partialSuffix(name) !== null;
}

export function isAria2Control(name) {
    return String(name ?? '').toLowerCase().endsWith(ARIA2_SUFFIX);
}

export function downloadTitle(name) {
    const text = String(name ?? '');
    const suffix = isAria2Control(text) ? ARIA2_SUFFIX : partialSuffix(text);
    if (!suffix)
        return text;
    const title = text.slice(0, -suffix.length);
    return title || text;
}

export function formatBytes(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value < 0)
        return '';
    if (value < 1024)
        return `${Math.round(value)} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let amount = value / 1024;
    let unit = 0;
    while (amount >= 1024 && unit < units.length - 1) {
        amount /= 1024;
        unit++;
    }
    const digits = amount >= 100 ? 0 : amount >= 10 ? 1 : 2;
    return `${parseFloat(amount.toFixed(digits))} ${units[unit]}`;
}

export function formatActivityValue(activity) {
    const progress = normalizeProgress(activity?.progress);
    if (progress !== null)
        return `${Math.round(progress * 100)}%`;
    const received = Number(activity?.receivedBytes);
    if (Number.isFinite(received) && received > 0)
        return formatBytes(received);
    return 'Working';
}

export function formatActivityDetail(activity) {
    const received = Number(activity?.receivedBytes);
    const total = Number(activity?.totalBytes);
    if (Number.isFinite(received) && received > 0 && Number.isFinite(total) && total > 0) {
        const suffix = Number.isFinite(Number(activity?.speedBytes))
            ? ` · ${formatBytes(activity.speedBytes)}/s`
            : '';
        return `${formatBytes(received)} of ${formatBytes(total)}${suffix}`;
    }
    const subtitle = cleanActivityText(activity?.subtitle);
    if (subtitle)
        return subtitle;
    if (Number.isFinite(received) && received > 0)
        return 'Downloading';
    return activity?.state === 'running' ? 'Running' : 'Finished';
}

export function selectActivity(activities) {
    const running = (Array.isArray(activities) ? activities : [])
        .filter(activity => activity?.state === 'running');
    if (!running.length)
        return null;
    // Keep the pill on the oldest running item so parallel downloads do not
    // make it hop between rows as each one reports progress.
    return running.reduce((oldest, activity) => {
        if (!oldest)
            return activity;
        return (activity.startedAt || 0) < (oldest.startedAt || 0) ? activity : oldest;
    }, null);
}

export function aria2TotalLength(contents) {
    if (!contents)
        return null;
    const bytes = contents instanceof Uint8Array ? contents : new Uint8Array(contents);
    if (bytes.byteLength < 38)
        return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint16(0, false) !== 1)
        return null;
    const hashLength = view.getUint32(6, false);
    const totalOffset = 14 + hashLength;
    if (hashLength > 128 || bytes.byteLength < totalOffset + 8)
        return null;
    const total = view.getBigUint64(totalOffset, false);
    if (total <= 0n || total > BigInt(Number.MAX_SAFE_INTEGER))
        return null;
    return Number(total);
}
