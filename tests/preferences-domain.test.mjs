import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePreferences} from '../extension/preferences-domain.js';
import {TAB_BAR_KEYS} from '../extension/island-domain.js';

const defaults = {
    glass: false,
    theme: 'midnight',
    accentColor: '#5577B8',
    fontFamily: 'cantarell',
    islandShape: 'notch',
    browserOverlap: false,
    restingStyle: 'hover-clock',
    showRestingLyrics: false,
    smartMusicDetection: true,
    systemNotices: true,
    notificationSources: {whatsapp: true, calendar: true},
    morningAgenda: true,
    eveningRecap: true,
    lastAgendaBriefing: '',
    lastAgendaRecap: '',
    focusGuard: true,
    keepAwake: false,
    waterReminder: false,
    prayerReminder: false,
    prayerCity: 'Jakarta, Indonesia',
    prayerMethod: 20,
    lastWaterAt: 0,
    lastWaterLogAt: 0,
    lastWaterReminderAt: 0,
    lastPrayerNotice: '',
    shelfView: 'grid',
    greetingEnabled: true,
    greetingNameSource: 'account',
    greetingCustomName: '',
    greetingWelcomeText: 'Hello, {name}',
    greetingReturnText: "You're back, {name}",
    greetingWelcomeShown: false,
    greetingLastSession: '',
    visiblePages: Object.fromEntries(TAB_BAR_KEYS.map(key => [key, true])),
    tabOrder: [...TAB_BAR_KEYS],
    positionMode: 'top',
    positionX: 0.5,
    positionY: 0,
};

const options = {
    defaults,
    pageKeys: TAB_BAR_KEYS,
    themeKeys: ['midnight', 'aero'],
    fontFamilies: ['cantarell', 'noto-sans'],
    positionModes: ['top', 'bottom', 'free'],
    prayerMethods: [20, 3],
    nowSeconds: 123456,
};

test('preferences use defaults for corrupt shapes and force Settings visible', () => {
    const result = normalizePreferences([], options);
    assert.equal(result.theme, 'midnight');
    assert.equal(result.visiblePages.settings, true);
    assert.notEqual(result.visiblePages, defaults.visiblePages);
});

test('preferences validate appearance, page visibility, and position', () => {
    const result = normalizePreferences({
        theme: 'unknown',
        accentColor: 'bad',
        fontFamily: 'foreign',
        islandShape: 'pill',
        visiblePages: {notes: false, settings: false, nonexistent: false},
        positionMode: 'floating',
        positionX: 2,
        positionY: 'invalid',
        tabOrder: ['notes', 'notes', 'unknown'],
    }, options);
    assert.equal(result.theme, 'midnight');
    assert.equal(result.accentColor, '#5577B8');
    assert.equal(result.islandShape, 'pill');
    assert.equal(result.visiblePages.notes, false);
    assert.equal(result.visiblePages.settings, true);
    assert.equal(result.positionMode, 'top');
    assert.equal(result.positionX, 1);
    assert.equal(result.positionY, 0);
    assert.deepEqual(result.tabOrder.slice(0, 2), ['notes', 'summary']);
});

test('preferences clean greeting strings, sources, and water reminder baseline', () => {
    const result = normalizePreferences({
        greetingCustomName: 'Ayu\nPerdana',
        greetingWelcomeText: 'Hello, {name}\nWelcome',
        notificationSources: {whatsapp: false, calendar: 'yes', unknown: false},
        prayerMethod: 999,
        waterReminder: true,
        lastWaterReminderAt: 0,
    }, options);
    assert.equal(result.greetingCustomName, 'Ayu Perdana');
    assert.equal(result.greetingWelcomeText, 'Hello, {name} Welcome');
    assert.deepEqual(result.notificationSources, {whatsapp: false, calendar: true});
    assert.equal(result.prayerMethod, 20);
    assert.equal(result.lastWaterReminderAt, 123456);
    assert.equal(result.waterReminderBaselineNeedsSave, true);
});

test('preferences preserve valid reminder and greeting choices', () => {
    const result = normalizePreferences({
        prayerCity: ' Bandung, Indonesia ',
        prayerMethod: 3,
        greetingNameSource: 'custom',
        shelfView: 'list',
        positionMode: 'free',
        lastWaterReminderAt: 100,
    }, options);
    assert.equal(result.prayerCity, ' Bandung, Indonesia ');
    assert.equal(result.prayerMethod, 3);
    assert.equal(result.greetingNameSource, 'custom');
    assert.equal(result.shelfView, 'list');
    assert.equal(result.positionMode, 'free');
    assert.equal(result.waterReminderBaselineNeedsSave, false);
});
