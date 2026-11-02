import test from 'node:test';
import assert from 'node:assert/strict';
import {
    focusSecondsOnDate,
    normalizeFocusLog,
    recordFocusSeconds,
} from '../extension/focus-domain.js';

const NOW = new Date(2026, 10, 2, 9, 0);

test('focus log normalization keeps valid non-negative dates and seconds', () => {
    assert.deepEqual(normalizeFocusLog({
        '2026-11-02': 120.6,
        '2026-11-01': '60',
        '2026-99-99': 20,
        invalid: 40,
        negative: -1,
    }), {
        '2026-11-02': 121,
        '2026-11-01': 60,
        '2026-99-99': 20,
    });
    assert.deepEqual(normalizeFocusLog([]), {});
});

test('focus totals read the local calendar date and missing entries are zero', () => {
    assert.equal(focusSecondsOnDate({'2026-11-02': 900}, NOW), 900);
    assert.equal(focusSecondsOnDate({}, NOW), 0);
});

test('recording focus adds rounded seconds and removes entries older than retention', () => {
    const result = recordFocusSeconds({
        '2026-09-01': 200,
        '2026-11-02': 100,
    }, 61.4, NOW);
    assert.deepEqual(result, {'2026-11-02': 161});
    assert.equal(recordFocusSeconds({}, 0, NOW), null);
});
