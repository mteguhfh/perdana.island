import test from 'node:test';
import assert from 'node:assert/strict';
import {
    nextPrayer,
    parsePrayerTimings,
    prayerCacheIsValid,
    prayerStatus,
    waterSummary,
    waterTabLabel,
    PRAYER_NAMES,
} from '../extension/reminder-domain.js';

const TIMES = {Fajr: 300, Dhuhr: 720, Asr: 900, Maghrib: 1080, Isha: 1200};
const NOW = new Date(2026, 10, 2, 13, 0);

test('prayer timings parse valid clock values and skip malformed values', () => {
    assert.deepEqual(parsePrayerTimings({Fajr: '05:10 (EET)', Dhuhr: '25:00', Asr: '15:40'}), {
        Fajr: 310,
        Asr: 940,
    });
    assert.throws(() => parsePrayerTimings(null), /Prayer timings missing/);
});

test('prayer cache requires today, selected city and method, and all prayer times', () => {
    const cache = {date: '2026-11-02', city: 'Bandung', method: 20, times: TIMES};
    assert.equal(prayerCacheIsValid(cache, {date: NOW, city: 'Bandung', method: 20}), true);
    assert.equal(prayerCacheIsValid(cache, {date: NOW, city: 'Jakarta', method: 20}), false);
    assert.equal(prayerCacheIsValid({...cache, times: {Fajr: 300}}, {
        date: NOW, city: 'Bandung', method: 20,
    }), false);
});

test('next prayer selects the next item today or first prayer tomorrow', () => {
    assert.deepEqual(nextPrayer(TIMES, NOW), {
        name: 'Asr', minutes: 900, tomorrow: false, minutesUntil: 120,
    });
    const late = new Date(2026, 10, 2, 23, 0);
    assert.deepEqual(nextPrayer(TIMES, late), {
        name: 'Fajr', minutes: 300, tomorrow: true, minutesUntil: 360,
    });
    assert.equal(PRAYER_NAMES.length, 5);
});

test('prayer status reflects disabled, loading, error, upcoming, and passed states', () => {
    assert.equal(prayerStatus(), 'Prayer reminders are off');
    assert.equal(prayerStatus({enabled: true, loading: true}), 'Loading prayer times...');
    assert.equal(prayerStatus({enabled: true, error: 'Offline'}), 'Offline');
    assert.equal(prayerStatus({enabled: true, times: TIMES, now: NOW}), 'Next: Asr 15:00');
    assert.equal(prayerStatus({enabled: true, times: TIMES, now: new Date(2026, 10, 2, 23)}),
        'All prayers passed for today');
});

test('water summary handles quiet hours, reminder intervals, logs, and label formatting', () => {
    assert.equal(waterSummary({enabled: false, now: NOW}).value, 'Off');
    assert.equal(waterSummary({enabled: true, now: new Date(2026, 10, 2, 7)}).value, '08:00');
    const nowSeconds = Math.floor(NOW.getTime() / 1000);
    const summary = waterSummary({
        enabled: true,
        lastReminderAt: nowSeconds - 60,
        lastLogAt: nowSeconds - 300,
        now: NOW,
    });
    assert.equal(summary.value, '59 min');
    assert.match(summary.detail, /^Last glass /);
    assert.equal(waterTabLabel('59 min'), 'Water 59m');
});
