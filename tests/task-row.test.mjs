import test from 'node:test';
import assert from 'node:assert/strict';
import {parseClockTime} from '../extension/island-domain.js';

test('task row scheduling contract accepts valid clock input and rejects invalid values', () => {
    assert.equal(parseClockTime('09:30'), 570);
    assert.equal(parseClockTime('25:00'), null);
});
