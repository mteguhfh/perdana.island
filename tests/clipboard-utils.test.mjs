import assert from 'node:assert/strict';
import test from 'node:test';

import {
    areClipboardHistoryValuesEqual,
    isPasswordLikeClipboardText,
    isSensitiveClipboardMimeType,
    maskClipboardEmail,
    maskClipboardLink,
    maskClipboardPreview,
    normalizeClipboardHistoryKey,
} from '../extension/clipboard-utils.js';

test('normalizes equivalent URL forms to one history key', () => {
    assert.equal(
        normalizeClipboardHistoryKey('HTTP://Example.com:80/'),
        normalizeClipboardHistoryKey('http://example.com')
    );
    assert.equal(
        normalizeClipboardHistoryKey('https://Example.com:443/path'),
        normalizeClipboardHistoryKey('https://example.com/path')
    );
    assert.equal(
        normalizeClipboardHistoryKey('  Hello   world  '),
        'Hello world'
    );
    assert.equal(
        normalizeClipboardHistoryKey('https://example.com/path).'),
        'https://example.com/path'
    );
    assert.equal(
        normalizeClipboardHistoryKey('https://[::1]:443/path'),
        normalizeClipboardHistoryKey('https://[::1]/path')
    );
});

test('treats URL variants that differ only in normalization as duplicates', () => {
    assert.ok(areClipboardHistoryValuesEqual('http://example.com/', 'HTTP://EXAMPLE.COM'));
    assert.ok(!areClipboardHistoryValuesEqual('http://example.com/a', 'http://example.com/b'));
});

test('masks email addresses and links in previews', () => {
    assert.equal(maskClipboardEmail('user@example.com'), 'u•••r@e•••e.com');
    assert.equal(maskClipboardEmail('john.doe@example.org'), 'j•••e@e•••e.org');
    assert.equal(maskClipboardLink('https://example.com/path'), 'https://e•••e.com/•••');
    assert.equal(maskClipboardLink('file:///home/user/secret.txt'), 'file://•••');
    assert.equal(
        maskClipboardPreview('mail john.doe@example.org or open https://example.com/a now'),
        'mail j•••e@e•••e.org or open https://e•••e.com/••• now'
    );
    assert.equal(maskClipboardPreview('bare domain example.com stays masked'), 'bare domain e•••e.com stays masked');
    assert.equal(maskClipboardPreview('plain text stays readable'), 'plain text stays readable');
});

test('detects labeled credentials', () => {
    const credentials = [
        'password: hunter2',
        'passwd=correct horse',
        'pwd: 12345678',
        'passphrase = open sesame',
        'secret=abc',
        'client_secret="s3cr3t"',
        'api_key=abcd1234',
        'apikey: abcd1234',
        'access_token=abcdefghijklmnop',
        'refresh-token: abcdefghijklmnop',
        'token: abcdefghijklmnop',
        'Authorization: Basic dXNlcjpwYXNz',
        'private_key=abcd1234',
        '{"token":"abcdefghijklmnop"}',
        'Bearer abcdefghijklmnopqrstuvwx',
        '-----BEGIN OPENSSH PRIVATE KEY-----',
        'ghp_abcdefghijklmnopqrstuvwx',
        'https://user:pass@example.com/private',
        'https://example.com/callback?access_token=abcdefghijklmnop',
    ];

    for (const value of credentials)
        assert.equal(isPasswordLikeClipboardText(value), true, value);
});

test('leaves ordinary clipboard text alone', () => {
    const ordinary = [
        '',
        'hello world',
        'This is a normal sentence, with punctuation.',
        'tokenizer: enabled',
        'The secret to good coffee is water.',
        'my password is not written here',
        'ID 1234567890',
        'https://example.com/docs',
        'user@example.com',
        'function password() {}',
    ];

    for (const value of ordinary)
        assert.equal(isPasswordLikeClipboardText(value), false, value);
});

test('matches only KDE password-manager MIME hint exactly', () => {
    assert.equal(isSensitiveClipboardMimeType('application/x-kde-passwordManagerHint'), true);
    assert.equal(isSensitiveClipboardMimeType(' application/x-kde-passwordmanagerhint '), true);
    assert.equal(isSensitiveClipboardMimeType('text/plain'), false);
    assert.equal(isSensitiveClipboardMimeType('application/x-kde-passwordmanagerhint+extra'), false);
    assert.equal(isSensitiveClipboardMimeType(''), false);
});
