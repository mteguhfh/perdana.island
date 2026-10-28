// SPDX-License-Identifier: GPL-3.0-or-later

const CLIPBOARD_EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const CLIPBOARD_URL_PATTERN = /\b(?:(?:https?|ftp|file):\/\/|www\.)[^\s<>"']+/gi;
const CLIPBOARD_DOMAIN_PATTERN = /(^|[^\w@.-])((?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/[^\s<>"']*)?)/gi;

// Only named fields here. Bare words such as "id" would hide ordinary text.
const CREDENTIAL_FIELD = '(?:'
    + 'password|passwd|pwd|passphrase'
    + '|secret|client[ _-]?secret'
    + '|(?:api|access|refresh)[ _-]?(?:key|token)'
    + '|token'
    + '|authorization'
    + '|private[ _-]?key'
    + ')';
const CREDENTIAL_PATTERN = new RegExp(
    `(?:^|[\\s,{;])['"]?\\b${CREDENTIAL_FIELD}\\b['"]?\\s*[:=]\\s*['"]?\\S+`,
    'i'
);

export function normalizeClipboardHistoryKey(value) {
    const text = String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ');
    const url = text.replace(/[.,!?;:)\]}]+$/, '');
    const match = url.match(/^(https?:\/\/|ftp:\/\/|file:\/\/|www\.)([^/?#]*)(.*)$/i);
    if (!match)
        return text;

    const [, prefix, authority, suffix] = match;
    const atIndex = authority.lastIndexOf('@');
    const userInfo = atIndex >= 0 ? authority.slice(0, atIndex + 1) : '';
    const hostAndPort = authority.slice(atIndex + 1);
    let hostname = hostAndPort;
    let port = '';
    if (hostAndPort.startsWith('[')) {
        const bracketEnd = hostAndPort.indexOf(']');
        if (bracketEnd >= 0) {
            hostname = hostAndPort.slice(0, bracketEnd + 1);
            port = hostAndPort.slice(bracketEnd + 1);
        }
    } else {
        const colonIndex = hostAndPort.lastIndexOf(':');
        if (colonIndex >= 0 && /^:\d+$/.test(hostAndPort.slice(colonIndex))) {
            hostname = hostAndPort.slice(0, colonIndex);
            port = hostAndPort.slice(colonIndex);
        }
    }

    const normalizedPrefix = prefix.toLowerCase();
    const normalizedPort = (normalizedPrefix === 'https://' && port === ':443')
        || (normalizedPrefix === 'http://' && port === ':80')
        || (normalizedPrefix === 'ftp://' && port === ':21')
        ? ''
        : port;
    const normalizedSuffix = suffix === '/' ? '' : suffix;
    return `${normalizedPrefix}${userInfo}${hostname.toLowerCase()}${normalizedPort}${normalizedSuffix}`;
}

export function areClipboardHistoryValuesEqual(first, second) {
    return normalizeClipboardHistoryKey(first) === normalizeClipboardHistoryKey(second);
}

export function maskClipboardPart(value) {
    const text = String(value || '');
    if (text.length <= 1)
        return `${text || '•'}•••`;
    return `${text[0]}•••${text.length > 2 ? text.at(-1) : ''}`;
}

export function maskClipboardDomain(value) {
    const labels = String(value || '').split('.');
    if (labels.length < 2)
        return maskClipboardPart(value);

    const last = labels.length - 1;
    const suffixLength = labels.length > 2 && labels[last].length === 2 && labels[last - 1].length <= 3
        ? 2
        : 1;
    return labels.map((label, index) => index >= labels.length - suffixLength
        ? label
        : maskClipboardPart(label)).join('.');
}

export function maskClipboardEmail(value) {
    const at = value.lastIndexOf('@');
    if (at < 0)
        return maskClipboardPart(value);
    return `${maskClipboardPart(value.slice(0, at))}@${maskClipboardDomain(value.slice(at + 1))}`;
}

export function maskClipboardLink(value) {
    let link = String(value || '');
    const punctuation = link.match(/[.,!?;:)\]}]+$/)?.[0] || '';
    if (punctuation)
        link = link.slice(0, -punctuation.length);

    const prefix = link.match(/^(?:(?:https?|ftp|file):\/\/|www\.)/i)?.[0] || '';
    if (prefix.toLowerCase() === 'file://')
        return `${prefix}•••${punctuation}`;

    const remainder = link.slice(prefix.length);
    const authorityEnd = remainder.search(/[/?#]/);
    const authority = authorityEnd < 0 ? remainder : remainder.slice(0, authorityEnd);
    const suffix = authorityEnd < 0 ? '' : remainder.slice(authorityEnd);
    const host = authority.slice(authority.lastIndexOf('@') + 1);
    const port = host.match(/:(\d+)$/)?.[1] || '';
    const hostname = port ? host.slice(0, -(port.length + 1)) : host;
    const maskedHost = maskClipboardDomain(hostname);
    return `${prefix}${maskedHost}${port ? ':•••' : ''}${suffix ? '/•••' : ''}${punctuation}`;
}

export function maskClipboardPreview(value) {
    const links = [];
    const emails = [];
    const marker = (kind, index) => `\uE000${kind}${index}\uE001`;
    let preview = String(value || '').replace(CLIPBOARD_URL_PATTERN, link => {
        const index = links.push(maskClipboardLink(link)) - 1;
        return marker('L', index);
    });
    // Emails run before bare domains. Otherwise a dotted local part such as
    // "john.doe" matches as a domain and leaves the real email domain exposed.
    preview = preview.replace(CLIPBOARD_EMAIL_PATTERN, email => {
        const index = emails.push(maskClipboardEmail(email)) - 1;
        return marker('E', index);
    });
    preview = preview.replace(CLIPBOARD_DOMAIN_PATTERN, (match, boundary, link) => {
        const index = links.push(maskClipboardLink(link)) - 1;
        return `${boundary}${marker('L', index)}`;
    });
    return preview.replace(/\uE000([LE])(\d+)\uE001/g, (_match, kind, index) =>
        (kind === 'L' ? links : emails)[Number(index)]);
}

export function isPasswordLikeClipboardText(value) {
    const text = String(value || '').trim();
    if (!text)
        return false;

    if (CREDENTIAL_PATTERN.test(text)
        || /-----BEGIN [A-Z ]*PRIVATE KEY-----/i.test(text)
        || /\bBearer\s+[A-Z0-9._~+/-]{16,}/i.test(text)
        || /^eyJ[A-Z0-9_-]{8,}\.eyJ[A-Z0-9_-]{8,}\.[A-Z0-9_-]{8,}$/i.test(text)
        || /^(?:gh[pousr]_|github_pat_|glpat-|xox[baprs]-|sk-(?:proj-)?|AIzaSy)[A-Z0-9_-]{16,}/i.test(text)
        || /\bhttps?:\/\/[^/@\s]+:[^/@\s]+@/i.test(text)
        || /[?&](?:access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|client[_-]?secret|password|passwd)=[^&#\s]{8,}/i.test(text)) {
        return true;
    }

    return false;
}

export function isSensitiveClipboardMimeType(mimeType) {
    // KDE's password-manager hint is explicit. Match it exactly so an
    // unrelated MIME name cannot suppress normal copied text.
    return String(mimeType || '').trim().toLowerCase() === 'application/x-kde-passwordmanagerhint';
}
