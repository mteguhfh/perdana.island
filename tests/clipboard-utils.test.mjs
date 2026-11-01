import test from 'node:test';
import assert from 'node:assert/strict';

import {
    areClipboardHistoryValuesEqual,
    isPasswordLikeClipboardText,
    isSensitiveClipboardMimeType,
    maskClipboardPreview,
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
