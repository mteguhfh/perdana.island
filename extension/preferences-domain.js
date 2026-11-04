import {clampUnit, normalizeHexColor, normalizeTabOrder} from './island-domain.js';

export function normalizePreferences(stored, {
    defaults,
    pageKeys,
    themeKeys,
    fontFamilies,
    positionModes,
    prayerMethods,
    nowSeconds = Math.floor(Date.now() / 1000),
} = {}) {
    const result = {
        ...defaults,
        visiblePages: {...defaults.visiblePages},
        notificationSources: {...defaults.notificationSources},
    };
    if (!stored || typeof stored !== 'object' || Array.isArray(stored))
        return result;

    const savedPages = stored.visiblePages && typeof stored.visiblePages === 'object'
        && !Array.isArray(stored.visiblePages) ? stored.visiblePages : {};
    for (const key of pageKeys) {
        if (typeof savedPages[key] === 'boolean')
            result.visiblePages[key] = savedPages[key];
    }
    result.glass = Boolean(stored.glass);
    result.theme = themeKeys.includes(stored.theme) ? stored.theme : result.theme;
    result.accentColor = normalizeHexColor(stored.accentColor) || result.accentColor;
    result.fontFamily = fontFamilies.includes(stored.fontFamily) ? stored.fontFamily : result.fontFamily;
    result.islandShape = stored.islandShape === 'pill' ? 'pill' : 'notch';
    result.browserOverlap = stored.browserOverlap === true;
    result.restingStyle = ['hover-clock', 'eyes-clock'].includes(stored.restingStyle)
        ? stored.restingStyle : result.restingStyle;
    result.showRestingLyrics = stored.showRestingLyrics === true;
    result.smartMusicDetection = stored.smartMusicDetection !== false;
    result.systemNotices = stored.systemNotices !== false;
    if (stored.notificationSources && typeof stored.notificationSources === 'object'
        && !Array.isArray(stored.notificationSources)) {
        for (const key of Object.keys(result.notificationSources)) {
            if (typeof stored.notificationSources[key] === 'boolean')
                result.notificationSources[key] = stored.notificationSources[key];
        }
    }
    result.morningAgenda = stored.morningAgenda !== false;
    result.eveningRecap = stored.eveningRecap !== false;
    result.lastAgendaBriefing = typeof stored.lastAgendaBriefing === 'string' ? stored.lastAgendaBriefing : '';
    result.lastAgendaRecap = typeof stored.lastAgendaRecap === 'string' ? stored.lastAgendaRecap : '';
    result.focusGuard = stored.focusGuard !== false;
    result.keepAwake = stored.keepAwake === true;
    result.waterReminder = stored.waterReminder === true;
    result.prayerReminder = stored.prayerReminder === true;
    result.prayerCity = typeof stored.prayerCity === 'string' && stored.prayerCity.trim()
        ? stored.prayerCity : result.prayerCity;
    result.prayerMethod = prayerMethods.includes(stored.prayerMethod) ? stored.prayerMethod : result.prayerMethod;
    result.lastWaterAt = Number.isFinite(stored.lastWaterAt) ? stored.lastWaterAt : 0;
    result.lastWaterLogAt = Number.isFinite(stored.lastWaterLogAt) ? stored.lastWaterLogAt : 0;
    const hasWaterReminderBaseline = Number.isFinite(stored.lastWaterReminderAt)
        && stored.lastWaterReminderAt > 0;
    result.lastWaterReminderAt = hasWaterReminderBaseline
        ? stored.lastWaterReminderAt : result.waterReminder ? nowSeconds : 0;
    result.waterReminderBaselineNeedsSave = result.waterReminder && !hasWaterReminderBaseline;
    result.lastPrayerNotice = typeof stored.lastPrayerNotice === 'string' ? stored.lastPrayerNotice : '';
    result.shelfView = ['grid', 'list'].includes(stored.shelfView) ? stored.shelfView : result.shelfView;
    result.greetingEnabled = stored.greetingEnabled !== false;
    result.greetingNameSource = ['account', 'device', 'custom'].includes(stored.greetingNameSource)
        ? stored.greetingNameSource : result.greetingNameSource;
    result.greetingCustomName = typeof stored.greetingCustomName === 'string'
        ? stored.greetingCustomName.replace(/[\r\n]+/g, ' ').slice(0, 40) : '';
    result.greetingWelcomeText = typeof stored.greetingWelcomeText === 'string'
        ? stored.greetingWelcomeText.replace(/[\r\n]+/g, ' ').slice(0, 56) : result.greetingWelcomeText;
    result.greetingReturnText = typeof stored.greetingReturnText === 'string'
        ? stored.greetingReturnText.replace(/[\r\n]+/g, ' ').slice(0, 56) : result.greetingReturnText;
    result.greetingWelcomeShown = stored.greetingWelcomeShown === true;
    result.greetingLastSession = typeof stored.greetingLastSession === 'string' ? stored.greetingLastSession : '';
    result.tabOrder = normalizeTabOrder(stored.tabOrder);
    result.positionMode = positionModes.includes(stored.positionMode) ? stored.positionMode : result.positionMode;
    result.positionX = clampUnit(stored.positionX, 0.5);
    result.positionY = clampUnit(stored.positionY, 0);
    result.visiblePages.settings = true;
    return result;
}
