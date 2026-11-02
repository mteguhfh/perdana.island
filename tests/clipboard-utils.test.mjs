import test from 'node:test';
import assert from 'node:assert/strict';

import {
    areClipboardHistoryValuesEqual,
    isPasswordLikeClipboardText,
    isSensitiveClipboardMimeType,
    maskClipboardPreview,
    addClipboardHistoryValue,
    normalizeClipboardHistory,
} from '../extension/clipboard-utils.js';

test('ordinary text and URLs are accepted while explicit credentials are skipped', () => {
    assert.equal(isPasswordLikeClipboardText('Bring milk after work'), false);
    assert.equal(isPasswordLikeClipboardText('https://example.com/docs'), false);
    assert.equal(isPasswordLikeClipboardText('password=correct-horse-battery'), true);
    assert.equal(isPasswordLikeClipboardText('Bearer abcdefghijklmnopqrstuvwxyz'), true);
    assert.equal(isSensitiveClipboardMimeType('application/x-kde-passwordmanagerhint'), true);
    assert.equal(isSensitiveClipboardMimeType('text/plain'), false);
});

test('repeated URL forms deduplicate and previews mask links and email addresses', () => {
    assert.equal(areClipboardHistoryValuesEqual('HTTPS://Example.com:443/', 'https://example.com'), true);
    const preview = maskClipboardPreview('Contact jane.doe@example.com or https://example.com/private');
    assert.doesNotMatch(preview, /jane\.doe@example\.com|example\.com\/private/);
    assert.match(preview, /•••/);
});

test('clipboard history normalizes sensitive, duplicate, and bounded values', () => {
    const normalized = normalizeClipboardHistory([
        ' HTTPS://Example.com:443/ ',
        'https://example.com',
        'password=secret-value',
        'Keep this',
    ]);
    assert.deepEqual(normalized.items, ['HTTPS://Example.com:443/', 'Keep this']);
    assert.equal(normalized.skippedSensitive, true);
    const added = addClipboardHistoryValue(normalized.items, 'Keep this');
    assert.equal(added.added, false);
    assert.equal(added.moved, true);
    assert.equal(added.items[0], 'Keep this');
});
