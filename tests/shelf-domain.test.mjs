import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeShelfItems, shelfAvailableSlots} from '../extension/shelf-domain.js';

test('Shelf entries keep regular files, default content types, and stable names', () => {
    assert.deepEqual(normalizeShelfItems([
        {name: 'z.txt', type: 'regular', contentType: 'text/plain'},
        {name: 'folder', type: 'directory'},
        {name: 'a.bin', type: 'regular'},
    ], '/tmp/shelf'), [
        {name: 'a.bin', contentType: 'application/octet-stream', path: '/tmp/shelf/a.bin'},
        {name: 'z.txt', contentType: 'text/plain', path: '/tmp/shelf/z.txt'},
    ]);
});

test('Shelf slots never become negative', () => {
    assert.equal(shelfAvailableSlots(3), 7);
    assert.equal(shelfAvailableSlots(12), 0);
});
