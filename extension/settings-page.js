import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {normalizeHexColor} from './island-domain.js';
import {summarizeBackup} from './backup-utils.js';
import {attachButtonMotion, makeLabel, makeTextButton, place} from './ui-controls.js';

const SECTIONS = [
    ['island', 'Island'],
    ['greeting', 'Greeting'],
    ['music', 'Music'],
    ['messages', 'Messages'],
    ['reminders', 'Reminders'],
    ['notifications', 'Notifications'],
    ['tabs', 'Tabs'],
    ['data', 'Data'],
];

const CONTENT_HEIGHTS = {
    island: 670,
    greeting: 414,
    music: 206,
    messages: 210,
    reminders: 326,
    notifications: 240,
    tabs: 206,
    data: 230,
};

const POSITION_OPTIONS = [
    ['top', 'Top'], ['bottom', 'Bottom'], ['left', 'Left'],
    ['right', 'Right'], ['free', 'Free'],
];

const ACCENT_PALETTE = [
    ['Navy', '#5577B8'], ['Ocean', '#35A7C8'], ['Blue', '#4C83E2'],
    ['Plum', '#A579D4'], ['Forest', '#43A778'], ['Bronze', '#D89651'], ['Slate', '#98A6B8'],
];

const FONT_OPTIONS = [
    ['cantarell', 'Cantarell'],
    ['noto-sans', 'Noto Sans'],
    ['plus-jakarta-sans', 'Plus Jakarta Sans'],
];

const NAME_SOURCES = [
    ['account', 'Linux user', 'system-users-symbolic'],
    ['device', 'Device', 'computer-symbolic'],
    ['custom', 'Custom', 'document-edit-symbolic'],
];

export function renderSettingsPage(body, {
    pageWidth,
    bodyHeight,
    section,
    preferences,
    themes = [],
    chatSources = [],
    systemSources = [],
    prayerMethods = [],
    defaultAccentColor = '#5577B8',
    themeKey,
    pendingRestore,
    backupStatus,
    keepAwakeStatusText,
    greetingName,
    prayerStatusText,
    orderedPages,
    onOpenSection,
    onSetPreference,
    onSetPositionMode,
    onPreviewGreeting,
    onSaveBackup,
    onRequestRestore,
    onApplyRestore,
    onCancelRestore,
    onSetPageVisible,
    setNavScrollSource,
} = {}) {
    const layoutWidth = Math.max(0, pageWidth - 8);
    const navWidth = Math.min(280, Math.max(196, Math.round(layoutWidth * 0.26)));
    const panelX = navWidth + 24;
    const panelWidth = Math.max(0, layoutWidth - panelX);
    // Keep fixed-position controls clear of St.ScrollView's non-overlay
    // scrollbar and leave a visible safe inset at the right edge.
    const contentWidth = Math.max(0, panelWidth - 30);
    const columnGap = 10;
    const halfWidth = Math.max(0, (contentWidth - columnGap) / 2);
    if (!SECTIONS.some(([key]) => key === section))
        section = 'island';

    place(body, makeLabel('Settings', 'perdana-island__settings-title-label'),
        4, 3, navWidth - 8, 22);
    place(body, makeLabel('Ctrl+Alt+X hide/show', 'perdana-island__settings-shortcut'),
        panelX, 5, panelWidth, 18);

    const navScroll = new St.ScrollView({
        overlay_scrollbars: false,
        clip_to_allocation: true,
        style_class: 'perdana-island__settings-nav-scroll',
    });
    navScroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
    const navList = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'perdana-island__settings-nav-list',
    });
    const navItemWidth = Math.max(1, navWidth - 38);
    const navRowStep = 22;
    navList.set_size(navItemWidth, SECTIONS.length * navRowStep);
    navScroll.add_child(navList);
    place(body, navScroll, 4, 29, navWidth - 12, Math.max(0, bodyHeight - 29));

    SECTIONS.forEach(([key, label]) => {
        const selected = section === key;
        const text = makeLabel(label, 'perdana-island__settings-tab-label');
        text.x_expand = true;
        text.x_align = Clutter.ActorAlign.FILL;
        text.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        const button = new St.Button({
            child: text,
            can_focus: true,
            reactive: true,
            track_hover: true,
            style_class: `perdana-button perdana-island__settings-tab ${selected
                ? 'perdana-island__settings-tab--active' : ''}`,
            accessible_name: `${label} settings`,
        });
        button.connect('clicked', () => {
            if (section === key)
                return;
            onOpenSection?.(key);
        });
        attachButtonMotion(button, {hoverScale: 1, pressScale: 0.98});
        button.set_size(navItemWidth, 21);
        navList.add_child(button);
    });

    const selectedIndex = SECTIONS.findIndex(([key]) => key === section);
    const navScrollSource = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        setNavScrollSource?.(0);
        const adjustment = navScroll.get_vadjustment?.();
        if (!navScroll.get_stage() || !adjustment || adjustment.page_size <= 0)
            return GLib.SOURCE_REMOVE;
        const top = selectedIndex * navRowStep;
        const bottom = top + 21;
        const currentTop = adjustment.value;
        const currentBottom = currentTop + adjustment.page_size;
        const maxValue = Math.max(0, adjustment.upper - adjustment.page_size);
        if (top < currentTop)
            adjustment.value = Math.max(0, top);
        else if (bottom > currentBottom)
            adjustment.value = Math.min(maxValue, bottom - adjustment.page_size);
        return GLib.SOURCE_REMOVE;
    });
    setNavScrollSource?.(navScrollSource);

    const contentHeight = CONTENT_HEIGHTS[section];
    const scroll = new St.ScrollView({
        overlay_scrollbars: false,
        clip_to_allocation: true,
        style_class: 'perdana-island__settings-scroll',
    });
    scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
    const scrollContent = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'perdana-island__settings-scroll-content',
    });
    scrollContent.set_size(contentWidth, contentHeight);
    const content = new St.Widget({
        layout_manager: new Clutter.FixedLayout(),
        style_class: 'perdana-island__settings-content',
    });
    content.set_size(contentWidth, contentHeight);
    scrollContent.add_child(content);
    scroll.add_child(scrollContent);
    place(body, scroll, panelX, 29, panelWidth, Math.max(0, bodyHeight - 29));

    const heading = (label, y) => {
        const text = makeLabel(label, 'perdana-island__settings-heading-label');
        text.x_expand = true;
        text.x_align = Clutter.ActorAlign.FILL;
        text.clutter_text.line_alignment = Pango.Alignment.RIGHT;
        place(content, text, 0, y, contentWidth, 18);
    };
    const settingButton = (label, selected, x, y, width, callback, iconName) => {
        const contents = new St.BoxLayout({
            style_class: 'perdana-island__setting-option-content',
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
        });
        if (iconName) {
            contents.add_child(new St.Icon({
                icon_name: iconName,
                style_class: 'perdana-island__setting-option-icon',
            }));
        }
        const text = makeLabel(label, 'perdana-island__setting-option-label');
        text.x_expand = true;
        text.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        contents.add_child(text);
        const button = new St.Button({
            child: contents,
            can_focus: true,
            reactive: true,
            track_hover: true,
            style_class: `perdana-button ${selected
                ? 'perdana-island__setting-option perdana-island__setting-option--active'
                : 'perdana-island__setting-option'}`,
            accessible_name: label,
        });
        button.connect('clicked', () => callback?.());
        attachButtonMotion(button, {hoverScale: 1.02, pressScale: 0.97});
        place(content, button, x, y, width, 30);
        return button;
    };
    const themeButton = (theme, x, y, width) => {
        const contents = new St.BoxLayout({
            style_class: 'perdana-island__setting-option-content',
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
        });
        contents.add_child(new St.Widget({
            style_class: 'perdana-island__theme-dot',
            style: `background-color: ${theme.dot};`,
        }));
        const text = makeLabel(theme.label, 'perdana-island__setting-option-label');
        text.x_expand = true;
        text.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        contents.add_child(text);
        const selected = themeKey === theme.key;
        const button = new St.Button({
            child: contents,
            can_focus: true,
            reactive: true,
            track_hover: true,
            style_class: `perdana-button ${selected
                ? 'perdana-island__setting-option perdana-island__setting-option--active'
                : 'perdana-island__setting-option'}`,
            accessible_name: `${theme.label} theme`,
        });
        button.connect('clicked', () => onSetPreference?.('theme', theme.key));
        attachButtonMotion(button, {hoverScale: 1.02, pressScale: 0.97});
        place(content, button, x, y, width, 30);
    };
    const addEntry = (name, value, x, y, width, onChanged, hintText = '') => {
        const entry = new St.Entry({
            text: value,
            hint_text: hintText,
            can_focus: true,
            style_class: 'perdana-island__settings-entry',
            accessible_name: name,
        });
        entry.clutter_text.connect('text-changed', () => onChanged(entry.get_text()));
        place(content, entry, x, y, width, 30);
        return entry;
    };

    let positionButtons = null;

    if (section === 'island') {
        heading('Theme', 0);
        const themeGap = 7;
        const themeWidth = (contentWidth - themeGap * 2) / 3;
        themes.forEach((theme, index) => {
            const row = Math.floor(index / 3);
            const column = index % 3;
            themeButton(theme, column * (themeWidth + themeGap), 22 + row * 34, themeWidth);
        });

        heading('Resting island', 94);
        settingButton('Clock on hover', preferences.restingStyle === 'hover-clock',
            0, 116, halfWidth, () => onSetPreference?.('restingStyle', 'hover-clock'), 'alarm-symbolic');
        settingButton('Eyes + clock', preferences.restingStyle === 'eyes-clock',
            halfWidth + columnGap, 116, halfWidth,
            () => onSetPreference?.('restingStyle', 'eyes-clock'), 'preferences-system-symbolic');

        heading('Island shape', 152);
        settingButton('Notch', preferences.islandShape !== 'pill',
            0, 174, halfWidth, () => onSetPreference?.('islandShape', 'notch'),
            'view-fullscreen-symbolic');
        settingButton('Pill', preferences.islandShape === 'pill',
            halfWidth + columnGap, 174, halfWidth,
            () => onSetPreference?.('islandShape', 'pill'), 'media-playlist-repeat-symbolic');
        settingButton(preferences.browserOverlap ? 'Browser tuck on' : 'Browser tuck off',
            preferences.browserOverlap, 0, 210, contentWidth,
            () => onSetPreference?.('browserOverlap', !preferences.browserOverlap),
            'web-browser-symbolic');
        place(content, makeLabel('Tuck under a browser when the pointer reaches the top edge.',
            'perdana-island__settings-hint'), 0, 240, contentWidth, 24);

        heading('Appearance', 270);
        settingButton(preferences.glass ? 'Glass on' : 'Glass off', preferences.glass,
            0, 292, halfWidth, () => onSetPreference?.('glass', !preferences.glass),
            'preferences-desktop-appearance-symbolic');

        heading('Accent color · Navy is the default', 328);
        ACCENT_PALETTE.forEach(([name, color], index) => {
            const selected = preferences.accentColor === color;
            const swatch = new St.Button({
                child: selected ? new St.Icon({icon_name: 'object-select-symbolic'}) : null,
                can_focus: true,
                reactive: true,
                track_hover: true,
                style_class: 'perdana-button perdana-island__color-swatch',
                accessible_name: `${name} ${color}`,
            });
            swatch.set_style(`background-color: ${color}; border: 2px solid ${selected ? '#ffffff' : 'rgba(255,255,255,0.18)'}; border-radius: 10px; padding: 0;`);
            swatch.connect('clicked', () => onSetPreference?.('accentColor', color));
            attachButtonMotion(swatch, {hoverScale: 1.1, pressScale: 0.9});
            place(content, swatch, index * 40, 350, 34, 32);
        });
        const colorEntry = new St.Entry({
            hint_text: defaultAccentColor,
            can_focus: true,
            style_class: 'perdana-island__color-entry',
            accessible_name: 'Accent color hex code',
        });
        colorEntry.set_text(preferences.accentColor);
        colorEntry.clutter_text.connect('text-changed', () =>
            colorEntry.remove_style_class_name('perdana-island__color-entry--invalid'));
        const applyColor = () => {
            const color = normalizeHexColor(colorEntry.get_text());
            if (color)
                onSetPreference?.('accentColor', color);
            else
                colorEntry.add_style_class_name('perdana-island__color-entry--invalid');
        };
        colorEntry.clutter_text.connect('activate', applyColor);
        place(content, colorEntry, 0, 389, 132, 32);
        place(content, makeTextButton('Apply', 'Apply accent color', applyColor,
            'perdana-island__color-apply'), 142, 389, 82, 32);

        heading('Font', 428);
        const fontWidth = (contentWidth - columnGap * 2) / 3;
        FONT_OPTIONS.forEach(([key, label], index) => {
            settingButton(label, preferences.fontFamily === key,
                index * (fontWidth + columnGap), 450, fontWidth,
                () => onSetPreference?.('fontFamily', key), 'font-x-generic-symbolic');
        });
        place(content, makeLabel('Uses Plus Jakarta Sans when available; otherwise falls back to Cantarell.',
            'perdana-island__settings-hint'), 0, 482, contentWidth, 24);

        heading('Session', 516);
        settingButton(preferences.keepAwake ? 'Keep awake on' : 'Keep awake off',
            preferences.keepAwake === true, 0, 538, halfWidth,
            () => onSetPreference?.('keepAwake', preferences.keepAwake !== true),
            'preferences-desktop-screensaver-symbolic');
        place(content, makeLabel(keepAwakeStatusText?.() ?? '',
            'perdana-island__settings-hint'), halfWidth + columnGap, 543, halfWidth, 30);

        heading('Position · drag to move', 578);
        const positionGap = 6;
        const positionWidth = (contentWidth - positionGap * 4) / 5;
        positionButtons = new Map();
        POSITION_OPTIONS.forEach(([key, label], index) => {
            const button = settingButton(label, preferences.positionMode === key,
                index * (positionWidth + positionGap), 600, positionWidth,
                () => onSetPositionMode?.(key));
            positionButtons.set(key, button);
        });
        place(content, makeLabel('Drag the resting pill or header. Release near an edge to snap.',
            'perdana-island__settings-hint'), 0, 636, contentWidth, 26);
    } else if (section === 'greeting') {
        heading('Session greeting', 0);
        settingButton(preferences.greetingEnabled ? 'Greeting on' : 'Greeting off',
            preferences.greetingEnabled, 0, 22, contentWidth,
            () => onSetPreference?.('greetingEnabled', !preferences.greetingEnabled),
            'user-available-symbolic');
        place(content, makeLabel('First use shows the welcome text; later sessions show the returning text.',
            'perdana-island__settings-hint'), 0, 57, contentWidth, 30);

        heading('Name to show', 88);
        const sourceGap = 7;
        const sourceWidth = (contentWidth - sourceGap * 2) / 3;
        NAME_SOURCES.forEach(([key, label, icon], index) => {
            settingButton(label, preferences.greetingNameSource === key,
                index * (sourceWidth + sourceGap), 110, sourceWidth,
                () => onSetPreference?.('greetingNameSource', key), icon);
        });
        if (preferences.greetingNameSource === 'custom') {
            heading('Custom name', 148);
            addEntry('Custom greeting name', preferences.greetingCustomName, 0, 170,
                contentWidth, value => onSetPreference?.('greetingCustomName',
                    value.replace(/[\r\n]+/g, ' ').slice(0, 40), false), 'Your name');
        } else {
            const currentName = greetingName?.() ?? '';
            place(content, makeLabel(`Name preview · ${currentName}`,
                'perdana-island__settings-hint'), 0, 148, contentWidth, 20);
        }

        heading('Greeting text', 206);
        place(content, makeLabel('First sign-in', 'perdana-island__settings-hint'), 0, 229, contentWidth, 16);
        addEntry('First sign-in greeting', preferences.greetingWelcomeText, 0, 246,
            contentWidth, value => onSetPreference?.('greetingWelcomeText',
                value.replace(/[\r\n]+/g, ' ').slice(0, 56), false), 'Hello, {name}');
        place(content, makeLabel('Returning', 'perdana-island__settings-hint'), 0, 282, contentWidth, 16);
        addEntry('Returning greeting', preferences.greetingReturnText, 0, 299,
            contentWidth, value => onSetPreference?.('greetingReturnText',
                value.replace(/[\r\n]+/g, ' ').slice(0, 56), false), "You're back, {name}");
        place(content, makeLabel('Use {name} to insert the selected name. Text is saved on this device.',
            'perdana-island__settings-hint'), 0, 336, contentWidth, 28);
        settingButton('Preview first sign-in', false, 0, 368, halfWidth,
            () => onPreviewGreeting?.(false), 'user-available-symbolic');
        settingButton('Preview returning', false, halfWidth + columnGap, 368, halfWidth,
            () => onPreviewGreeting?.(true), 'user-available-symbolic');
    } else if (section === 'music') {
        heading('Playback detection', 0);
        settingButton(preferences.smartMusicDetection
            ? 'Smart detection on' : 'Smart detection off',
            preferences.smartMusicDetection, 0, 22, contentWidth,
            () => onSetPreference?.('smartMusicDetection', !preferences.smartMusicDetection),
            'audio-x-generic-symbolic');
        place(content, makeLabel('Recognizes song metadata from Spotify, YouTube Music, Apple Music, Deezer, and SoundCloud.',
            'perdana-island__settings-hint'), 0, 57, contentWidth, 30);
        place(content, makeLabel('Podcasts, films, social clips, and unclear media stay out of the playing island.',
            'perdana-island__settings-hint'), 0, 77, contentWidth, 30);
    } else if (section === 'reminders') {
        heading('Daily agenda', 0);
        settingButton('Morning 08:00', preferences.morningAgenda !== false,
            0, 22, halfWidth,
            () => onSetPreference?.('morningAgenda', preferences.morningAgenda === false),
            'x-office-calendar-symbolic');
        settingButton('Evening 17:00', preferences.eveningRecap !== false,
            halfWidth + columnGap, 22, halfWidth,
            () => onSetPreference?.('eveningRecap', preferences.eveningRecap === false),
            'emblem-ok-symbolic');
        heading('Focus guard', 60);
        settingButton(preferences.focusGuard !== false ? 'Guard on' : 'Guard off',
            preferences.focusGuard !== false, 0, 82, halfWidth,
            () => onSetPreference?.('focusGuard', preferences.focusGuard === false),
            'dialog-warning-symbolic');
        place(content, makeLabel('Warns after 5 min on a distraction', 'perdana-island__settings-hint'),
            halfWidth + columnGap, 88, halfWidth, 28);
        heading('Water & prayer', 122);
        settingButton(preferences.waterReminder ? 'Water on' : 'Water off',
            preferences.waterReminder === true, 0, 144, halfWidth,
            () => onSetPreference?.('waterReminder', !preferences.waterReminder), 'alarm-symbolic');
        settingButton(preferences.prayerReminder ? 'Prayer on' : 'Prayer off',
            preferences.prayerReminder === true, halfWidth + columnGap, 144, halfWidth,
            () => onSetPreference?.('prayerReminder', !preferences.prayerReminder),
            'x-office-calendar-symbolic');
        heading('Prayer location', 184);
        const cityEntry = new St.Entry({
            hint_text: 'City, Country',
            text: preferences.prayerCity,
            can_focus: true,
            style_class: 'perdana-island__settings-entry',
            accessible_name: 'Prayer city and country',
        });
        const applyCity = () => {
            const value = cityEntry.get_text().trim();
            if (!value) {
                cityEntry.add_style_class_name('perdana-island__settings-entry--invalid');
                return;
            }
            onSetPreference?.('prayerCity', value);
        };
        cityEntry.clutter_text.connect('text-changed', () =>
            cityEntry.remove_style_class_name('perdana-island__settings-entry--invalid'));
        cityEntry.clutter_text.connect('activate', applyCity);
        place(content, cityEntry, 0, 206, Math.max(0, contentWidth - 76), 30);
        place(content, makeTextButton('Apply', 'Apply prayer city', applyCity,
            'perdana-island__color-apply'), contentWidth - 68, 206, 68, 30);
        const methodIndex = prayerMethods.findIndex(([method]) => method === preferences.prayerMethod);
        const methodName = prayerMethods[Math.max(0, methodIndex)][1];
        place(content, makeTextButton(methodName,
            `Prayer calculation method, ${methodName}. Click to change`, () => {
                const index = prayerMethods.findIndex(([method]) => method === preferences.prayerMethod);
                const next = prayerMethods[(index + 1) % prayerMethods.length];
                onSetPreference?.('prayerMethod', next[0]);
            }, 'perdana-island__color-apply'), 0, 244, contentWidth, 30);
        place(content, makeLabel(prayerStatusText?.() ?? '', 'perdana-island__settings-hint'),
            0, 280, contentWidth, 26);
    } else if (section === 'messages') {
        heading('Chat apps · shown on Messages', 0);
        const chatGap = 8;
        const chatWidth = (contentWidth - chatGap) / 2;
        chatSources.forEach(([key, label, iconName], index) => {
            const enabled = preferences.notificationSources?.[key] !== false;
            const row = Math.floor(index / 2);
            const column = index % 2;
            const x = column * (chatWidth + chatGap);
            const y = 22 + row * 36;
            settingButton(`${label} ${enabled ? 'on' : 'off'}`, enabled, x, y,
                chatWidth, () => onSetPreference?.('notificationSources', {
                    ...preferences.notificationSources,
                    [key]: !enabled,
                }), iconName);
        });
        place(content, makeLabel('Chat messages are grouped by sender on the Messages page.',
            'perdana-island__settings-hint'), 0, 150, contentWidth, 24);
    } else if (section === 'notifications') {
        heading('Island notification banners', 0);
        settingButton(preferences.systemNotices ? 'Notices on' : 'Notices off',
            preferences.systemNotices, 0, 22, halfWidth,
            () => onSetPreference?.('systemNotices', !preferences.systemNotices),
            'preferences-system-notifications-symbolic');
        place(content, makeLabel('Controls banners shown by the island; GNOME notifications stay unchanged.',
            'perdana-island__settings-hint'), halfWidth + columnGap, 22, halfWidth, 32);

        heading('System alerts · shown on Notifications', 62);
        const sourceGap = 8;
        const sourceWidth = (contentWidth - sourceGap) / 2;
        systemSources.forEach(([key, label, iconName], index) => {
            const enabled = preferences.notificationSources?.[key] !== false;
            const row = Math.floor(index / 2);
            const column = index % 2;
            const x = column * (sourceWidth + sourceGap);
            const y = 84 + row * 36;
            settingButton(`${label} ${enabled ? 'on' : 'off'}`, enabled, x, y,
                sourceWidth, () => onSetPreference?.('notificationSources', {
                    ...preferences.notificationSources,
                    [key]: !enabled,
                }), iconName);
        });
        place(content, makeLabel('Chat apps are on the Messages section. These switches only filter the island.',
            'perdana-island__settings-hint'), 0, 192, contentWidth, 24);
    } else if (section === 'data') {
        heading('Backup file', 0);
        settingButton('Save backup', false, 0, 22, halfWidth, () => onSaveBackup?.(),
            'document-save-symbolic');
        settingButton('Restore backup', false, halfWidth + columnGap, 22, halfWidth,
            () => onRequestRestore?.(), 'document-open-symbolic');
        const restore = pendingRestore;
        if (restore) {
            place(content, makeLabel(`${restore.name} · ${summarizeBackup(restore.summary)}`,
                'perdana-island__settings-hint'), 0, 64, contentWidth, 18);
            settingButton('Restore now', false, 0, 86, halfWidth, () => onApplyRestore?.(),
                'object-select-symbolic');
            settingButton('Cancel', false, halfWidth + columnGap, 86, halfWidth,
                () => onCancelRestore?.(), 'window-close-symbolic');
        }
        let status = backupStatus
            || 'Tasks, notes, settings, and focus history. Clipboard and Shelf files are not included.';
        if (status.startsWith('Saved to ')) {
            const fileName = status.slice('Saved to '.length).split(/[\\/]/).pop();
            status = `Backup saved · ${fileName}`;
        }
        place(content, makeLabel(status,
            'perdana-island__settings-hint'), 0, restore ? 118 : 64, contentWidth, 34);
    } else {
        heading('Visible tabs · Settings stays available', 0);
        place(content, makeLabel('Drag tabs in the bar to reorder. The first tab opens with the island.',
            'perdana-island__settings-hint'), 0, 20, contentWidth, 18);
        const pages = (orderedPages?.() ?? []).filter(page =>
            !['settings', 'media', 'clipboard'].includes(page.key));
        const gap = 7;
        const itemWidth = (contentWidth - gap * 3) / 4;
        pages.forEach((page, index) => {
            const row = Math.floor(index / 4);
            const column = index % 4;
            const label = page.key === 'notifications' ? 'Alerts' : page.label;
            settingButton(label, preferences.visiblePages[page.key] !== false,
                column * (itemWidth + gap), 44 + row * 34, itemWidth, () =>
                    onSetPageVisible?.(page.key, preferences.visiblePages[page.key] === false), page.icon);
        });
    }

    return {section, positionButtons};
}
