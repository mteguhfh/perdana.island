// SPDX-License-Identifier: GPL-3.0-or-later

import Clutter from 'gi://Clutter';
import Cairo from 'cairo';
import Gio from 'gi://Gio';
import GdkPixbuf from 'gi://GdkPixbuf';
import GLib from 'gi://GLib';
import Gvc from 'gi://Gvc';
import Meta from 'gi://Meta';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';
import Soup from 'gi://Soup?version=3.0';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import * as VolumeStatus from 'resource:///org/gnome/shell/ui/status/volume.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const MPRIS_PREFIX = 'org.mpris.MediaPlayer2.';
const MPRIS_PATH = '/org/mpris/MediaPlayer2';
const MPRIS_PLAYER_IFACE = 'org.mpris.MediaPlayer2.Player';
const DEFAULT_FOCUS_SECONDS = 25 * 60;
const DEFAULT_BREAK_SECONDS = 5 * 60;
const DEFAULT_ACCENT_COLOR = '#5577B8';
const MAX_SHELF_ITEMS = 10;
const MICROSECONDS_PER_SECOND = 1_000_000;
const LEGACY_DATA_DIRECTORY = 'pulo-island';
const COLLAPSED_WIDTH = 150;
const PLAYING_WIDTH = 236;
const RESTING_LYRICS_WIDTH = 460;
const COLLAPSED_HEIGHT = 38;
const RESTING_LYRICS_HEIGHT = 64;
const ISLAND_EAR_SIZE = 12;
const CONTENT_WIDTH = 460;
const PAGE_WIDTHS = {
    media: 460,
    lyrics: 740,
    focus: 680,
    shelf: 640,
    tasks: 600,
    clipboard: 600,
    today: 900,
    notifications: 560,
    settings: 640,
};
const OPEN_HEIGHT = 256;
const HEADER_HEIGHT = 42;
const TABBAR_HEIGHT = 46;
const PAGE_INSET = 28;
const MEDIA_ART_SIZE = 58;
const MEDIA_COPY_GAP = 22;
const MEDIA_COPY_RIGHT_INSET = 38;
const PAGES = [
    {key: 'media', label: 'Music', icon: 'audio-x-generic-symbolic'},
    {key: 'lyrics', label: 'Lyrics', icon: 'text-x-generic-symbolic'},
    {key: 'focus', label: 'Focus', icon: 'alarm-symbolic'},
    {key: 'shelf', label: 'Shelf', icon: 'folder-symbolic'},
    {key: 'tasks', label: 'To-do', icon: 'view-list-symbolic'},
    {key: 'clipboard', label: 'Clipboard', icon: 'edit-copy-symbolic'},
    {key: 'today', label: 'Today', icon: 'x-office-calendar-symbolic'},
    {key: 'notifications', label: 'Notifications', icon: 'preferences-system-notifications-symbolic'},
    {key: 'settings', label: 'Settings', icon: 'preferences-system-symbolic'},
];

function unpack(value) {
    return value instanceof GLib.Variant ? value.deep_unpack() : value;
}

function formatTime(totalSeconds) {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function normalizeHexColor(value) {
    const match = String(value || '').trim().match(/^#?([a-f\d]{6})$/i);
    return match ? `#${match[1].toUpperCase()}` : null;
}

function hexColorToRgb(value) {
    const normalized = normalizeHexColor(value) || DEFAULT_ACCENT_COLOR;
    return [1, 3, 5].map(offset => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255);
}

function isoWeekNumber(date) {
    const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const weekday = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - weekday);
    const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    return Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
}

const CLIPBOARD_EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const CLIPBOARD_URL_PATTERN = /\b(?:(?:https?|ftp|file):\/\/|www\.)[^\s<>"']+/gi;
const CLIPBOARD_DOMAIN_PATTERN = /(^|[^\w@.-])((?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/[^\s<>"']*)?)/gi;

function maskClipboardPart(value) {
    const text = String(value || '');
    if (text.length <= 1)
        return `${text || '•'}•••`;
    return `${text[0]}•••${text.length > 2 ? text.at(-1) : ''}`;
}

function maskClipboardDomain(value) {
    const labels = String(value || '').split('.');
    if (labels.length < 2)
        return maskClipboardPart(value);

    const last = labels.length - 1;
    const suffixLength = labels.length > 2 && labels[last].length === 2 && labels[last - 1].length <= 3
        ? 2
        : 1;
    return labels.map((label, index) => index >= labels.length - suffixLength
        ? label
        : maskClipboardPart(label)).join('.');
}

function maskClipboardEmail(value) {
    const at = value.lastIndexOf('@');
    if (at < 0)
        return maskClipboardPart(value);
    return `${maskClipboardPart(value.slice(0, at))}@${maskClipboardDomain(value.slice(at + 1))}`;
}

function maskClipboardLink(value) {
    let link = String(value || '');
    const punctuation = link.match(/[.,!?;:)\]}]+$/)?.[0] || '';
    if (punctuation)
        link = link.slice(0, -punctuation.length);

    const prefix = link.match(/^(?:(?:https?|ftp|file):\/\/|www\.)/i)?.[0] || '';
    if (prefix.toLowerCase() === 'file://')
        return `${prefix}•••${punctuation}`;

    const remainder = link.slice(prefix.length);
    const authorityEnd = remainder.search(/[/?#]/);
    const authority = authorityEnd < 0 ? remainder : remainder.slice(0, authorityEnd);
    const suffix = authorityEnd < 0 ? '' : remainder.slice(authorityEnd);
    const host = authority.slice(authority.lastIndexOf('@') + 1);
    const port = host.match(/:(\d+)$/)?.[1] || '';
    const hostname = port ? host.slice(0, -(port.length + 1)) : host;
    const maskedHost = maskClipboardDomain(hostname);
    return `${prefix}${maskedHost}${port ? ':•••' : ''}${suffix ? '/•••' : ''}${punctuation}`;
}

function maskClipboardPreview(value) {
    const links = [];
    const emails = [];
    const marker = (kind, index) => `\uE000${kind}${index}\uE001`;
    let preview = String(value || '').replace(CLIPBOARD_URL_PATTERN, link => {
        const index = links.push(maskClipboardLink(link)) - 1;
        return marker('L', index);
    });
    preview = preview.replace(CLIPBOARD_DOMAIN_PATTERN, (match, boundary, link) => {
        const index = links.push(maskClipboardLink(link)) - 1;
        return `${boundary}${marker('L', index)}`;
    });
    preview = preview.replace(CLIPBOARD_EMAIL_PATTERN, email => {
        const index = emails.push(maskClipboardEmail(email)) - 1;
        return marker('E', index);
    });
    return preview.replace(/\uE000([LE])(\d+)\uE001/g, (_match, kind, index) =>
        (kind === 'L' ? links : emails)[Number(index)]);
}

function isPasswordLikeClipboardText(value) {
    const text = String(value || '').trim();
    if (!text)
        return false;

    if (/(?:^|[\s,{;])['"]?\b(?:password|passwd|pwd|passphrase|secret|(?:api|access|refresh)[ _-]?token)\b['"]?\s*[:=]\s*['"]?\S+/i.test(text)
        || /-----BEGIN [A-Z ]*PRIVATE KEY-----/i.test(text)
        || /\bBearer\s+[A-Z0-9._~+/-]{16,}/i.test(text)
        || /^eyJ[A-Z0-9_-]{8,}\.eyJ[A-Z0-9_-]{8,}\.[A-Z0-9_-]{8,}$/i.test(text)
        || /^(?:gh[pousr]_|github_pat_|glpat-|xox[baprs]-|sk-(?:proj-)?|AIzaSy)[A-Z0-9_-]{16,}/i.test(text)
        || /\bhttps?:\/\/[^/@\s]+:[^/@\s]+@/i.test(text)
        || /[?&](?:access[_-]?token|refresh[_-]?token|id[_-]?token|token|api[_-]?key|password|passwd|secret|session|signature|auth|code)=[^&#\s]{8,}/i.test(text)) {
        return true;
    }

    if (/\s|@|(?:https?|ftp|file):\/\/|\bwww\./i.test(text)
        || /\b[a-z0-9-]+\.[a-z]{2,}(?:\/|$)/i.test(text)) {
        return false;
    }

    const hasLower = /[a-z]/.test(text);
    const hasUpper = /[A-Z]/.test(text);
    const hasDigit = /\d/.test(text);
    const hasSymbol = /[^a-z0-9]/i.test(text);
    const classes = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
    const frequencies = new Map();
    for (const character of text)
        frequencies.set(character, (frequencies.get(character) || 0) + 1);
    const entropy = [...frequencies.values()].reduce((sum, count) => {
        const probability = count / text.length;
        return sum - probability * Math.log2(probability);
    }, 0);
    return (text.length >= 16 && classes >= 3 && entropy >= 3.8)
        || (text.length >= 24 && entropy >= 3.2);
}

function makeLabel(text, styleClass = '') {
    const label = new St.Label({
        text,
        style_class: styleClass,
        y_align: Clutter.ActorAlign.CENTER,
    });
    label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return label;
}

function makeIconButton(iconName, accessibleName, callback, styleClass = '') {
    const icon = new St.Icon({icon_name: iconName, style_class: 'perdana-island__icon'});
    const button = new St.Button({
        child: icon,
        can_focus: true,
        reactive: true,
        track_hover: true,
        style_class: `perdana-button ${styleClass}`.trim(),
        accessible_name: accessibleName,
    });
    button.connect('clicked', callback);
    return button;
}

function makeTextButton(label, accessibleName, callback, styleClass = '') {
    const button = new St.Button({
        label,
        can_focus: true,
        reactive: true,
        track_hover: true,
        style_class: `perdana-button ${styleClass}`.trim(),
        accessible_name: accessibleName,
    });
    button.connect('clicked', callback);
    return button;
}

function place(parent, actor, x, y, width, height) {
    actor.set_position(x, y);
    actor.set_size(width, height);
    parent.add_child(actor);
    return actor;
}

function makeActionButton(iconName, label, accessibleName, callback, styleClass = '') {
    const contents = new St.BoxLayout({style_class: 'perdana-action__contents'});
    const icon = new St.Icon({icon_name: iconName, style_class: 'perdana-island__icon'});
    const text = makeLabel(label, 'perdana-action__label');
    contents.add_child(icon);
    contents.add_child(text);
    const button = new St.Button({
        child: contents,
        can_focus: true,
        reactive: true,
        track_hover: true,
        style_class: `perdana-button perdana-action ${styleClass}`.trim(),
        accessible_name: accessibleName,
    });
    button.connect('clicked', callback);
    button._perdanaActionIcon = icon;
    button._perdanaActionLabel = text;
    return button;
}

export default class PerdanaIslandExtension extends Extension {
    enable() {
        this._enabled = true;
        this._uiActorsAlive = false;
        this._motionSettings = Gio.Settings.new('org.gnome.desktop.interface');
        this._reducedMotion = !this._motionSettings.get_boolean('enable-animations');
        this._motionSignal = this._motionSettings.connect('changed::enable-animations', () => {
            this._reducedMotion = !this._motionSettings.get_boolean('enable-animations');
            this._updateReducedMotion();
        });
        this._players = new Map();
        this._selectedPlayerName = null;
        this._equalizers = new Set();
        this._expanded = false;
        this._closing = false;
        this._userHidden = false;
        this._keybindingSettings = this.getSettings();
        this._pageBody = null;
        this._outgoingPageBodies = new Set();
        this._tabSwitching = false;
        this._mediaPositionLabel = null;
        this._mediaDurationLabel = null;
        this._progressTrack = null;
        this._progressLine = null;
        this._progressFill = null;
        this._mediaEqualizer = null;
        this._progressSeeking = false;
        this._progressSeekRatio = 0;
        this._progressCanSeek = false;
        this._lyricsSession = null;
        this._lyricsCancellable = null;
        this._artworkSession = new Soup.Session();
        this._artworkSession.timeout = 10;
        this._artworkRequests = new Map();
        this._artworkCache = new Map();
        this._roundedArtworkCache = new Map();
        this._artworkCacheDirectory = null;
        this._artworkFiles = new Set();
        this._artworkEvictionSources = new Set();
        this._lyricsFallbackSource = 0;
        this._lyricsRetrySource = 0;
        this._lyricsCache = new Map();
        this._lyricsRetryAt = 0;
        this._lyricsBackoffUntil = 0;
        this._lyricsLastRequestAt = 0;
        this._lyricsCurrentTrackKey = null;
        this._lyricsRequestKey = null;
        this._lyricsData = null;
        this._lyricsStatus = 'Start playback to find lyrics';
        this._lyricsDisplayedIndex = -1;
        this._lyricsDisplayGap = false;
        this._lyricsStatusLabel = null;
        this._lyricsViewport = null;
        this._lyricsRail = null;
        this._lyricsWaitLabel = null;
        this._lyricsRenderedLines = null;
        this._lyricsLineLabels = [];
        this._lyricsLayoutWidth = 0;
        this._lyricsLayoutHeight = 0;
        this._lyricsPlaybackButton = null;
        this._lyricsRestingToggle = null;
        this._restingLyricsWidth = RESTING_LYRICS_WIDTH;
        this._compactTrackPendingText = null;
        this._compactTextTransitionGeneration = 0;
        this._compactTrackLayoutMode = null;
        this._compactLyricsFitKey = null;
        this._compactLyricsFitClass = null;
        this._compactLyricsAppliedFitClass = null;
        this._collapsedTargetSize = null;
        this._pinned = false;
        this._activePage = 'media';
        this._calendarMonthOffset = 0;
        this._calendarDateKey = '';
        this._notificationItems = [];
        this._notificationSources = new Map();
        this._notificationSourceAddedSignal = 0;
        this._notificationSourceRemovedSignal = 0;
        this._notificationTray = null;
        this._notificationSequence = 0;
        this._clearingNotifications = false;
        this._islandEars = [];
        this._islandShapeStyleKey = null;
        this._clipboardItems = [];
        this._clipboardNotice = null;
        this._clipboardSuppressedValue = null;
        this._shelfItems = [];
        this._shelfNotice = null;
        this._shelfNoticeSource = 0;
        this._previousPageIndex = 0;
        this._focusRemaining = DEFAULT_FOCUS_SECONDS;
        this._focusDuration = DEFAULT_FOCUS_SECONDS;
        this._focusSessionsToday = 0;
        this._focusMode = 'focus';
        this._focusCustomDuration = 30;
        this._focusCustomValue = '30';
        this._focusCustomUnit = 'seconds';
        this._focusCustomEditing = false;
        this._focusWasStarted = false;
        this._focusDeadline = 0;
        this._focusSource = 0;
        this._focusNoticeSource = 0;
        this._focusCustomEntry = null;
        this._focusCustomUnitButton = null;
        this._focusCustomUnitLabel = null;
        this._focusCompact = null;
        this._focusCompactLabel = null;
        this._focusCompactTime = null;
        this._clockSource = 0;
        this._mediaSource = 0;
        this._mediaTickerInterval = 0;
        this._todaySource = 0;
        this._chargingSource = 0;
        this._noticeDismissSource = 0;
        this._blinkSource = 0;
        this._clipboardSource = 0;
        this._systemNoticeActive = false;
        this._systemNoticeType = null;
        this._noticeNotificationItem = null;
        this._noticeBanner = null;
        this._volumeControl = null;
        this._volumeStream = null;
        this._batteryState = this._readBatteryState();
        this._todayTiles = [];
        this._cpuTicks = null;
        this._cpuPercent = null;
        this._hoverOpenSource = 0;
        this._hoverCloseSource = 0;
        this._taskDirectory = GLib.build_filenamev([
            GLib.get_user_data_dir(),
            'perdana.island',
        ]);
        this._taskFile = GLib.build_filenamev([this._taskDirectory, 'tasks.json']);
        this._clipboardFile = GLib.build_filenamev([this._taskDirectory, 'clipboard.json']);
        this._preferencesFile = GLib.build_filenamev([this._taskDirectory, 'preferences.json']);
        this._legacyTaskFile = GLib.build_filenamev([
            GLib.get_user_data_dir(),
            LEGACY_DATA_DIRECTORY,
            'tasks.json',
        ]);
        this._shelfDirectory = GLib.build_filenamev([this._taskDirectory, 'shelf']);
        this._migrateLegacyData();
        this._preferences = this._loadPreferences();
        if (!this._visiblePages().some(page => page.key === this._activePage))
            this._activePage = this._visiblePages()[0]?.key || 'settings';
        this._tasks = this._loadTasks();
        this._clipboardItems = this._loadClipboardItems();
        this._shelfItems = this._loadShelfItems();
        this._shelfMonitorSignal = 0;
        this._shelfMonitor = this._monitorShelfDirectory();
        this._shelfRefreshSource = 0;
        this._taskFocusSource = 0;
        this._playersLoaded = false;
        this._playersError = false;

        this._buildInterface();
        this._uiActorsAlive = true;
        Main.wm.addKeybinding(
            'toggle-island-visibility',
            this._keybindingSettings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this._toggleIslandVisibility()
        );
        this._applyGlassPreference();
        this._monitorSignal = Main.layoutManager.connect('monitors-changed', () => {
            if (this._expanded)
                this._root.set_size(this._expandedWidth(), this._expandedHeight());
            this._layoutIsland();
            this._positionIsland();
        });
        this._allocationSignal = this._root.connect('notify::allocation', () => this._layoutIsland());
        this._positionIsland();
        this._stageSignal = global.stage.connect('captured-event', (_stage, event) => this._onStageEvent(event));
        this._volumeControl = VolumeStatus.getMixerControl();
        this._volumeControl.connectObject(
            'state-changed', () => this._syncVolumeStream(),
            'default-sink-changed', () => this._syncVolumeStream(),
            this
        );
        this._syncVolumeStream();
        this._clockSource = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 30, () => {
            if (!this._enabled)
                return GLib.SOURCE_REMOVE;
            this._updateHeaderClock();
            return GLib.SOURCE_CONTINUE;
        });
        this._chargingSource = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            if (!this._enabled)
                return GLib.SOURCE_REMOVE;
            this._pollChargingState();
            return GLib.SOURCE_CONTINUE;
        });

        this._connectNotifications();

        this._busSignal = Gio.DBus.session.signal_subscribe(
            'org.freedesktop.DBus',
            'org.freedesktop.DBus',
            'NameOwnerChanged',
            '/org/freedesktop/DBus',
            null,
            Gio.DBusSignalFlags.NONE,
            (_connection, _sender, _path, _interface, _signal, parameters) => {
                const [name] = parameters.deep_unpack();
                if (name.startsWith(MPRIS_PREFIX))
                    this._discoverPlayers();
            }
        );
        this._discoverPlayers();
    }

    _loadPreferences() {
        const visiblePages = Object.fromEntries(PAGES.map(page => [page.key, true]));
        const defaults = {
            glass: false,
            accentColor: DEFAULT_ACCENT_COLOR,
            restingStyle: 'hover-clock',
            showRestingLyrics: false,
            systemNotices: true,
            shelfView: 'grid',
            visiblePages,
        };
        try {
            const stored = JSON.parse(this._readText(this._preferencesFile) || '{}');
            const savedPages = stored.visiblePages && typeof stored.visiblePages === 'object'
                ? stored.visiblePages
                : {};
            for (const page of PAGES) {
                if (typeof savedPages[page.key] === 'boolean')
                    defaults.visiblePages[page.key] = savedPages[page.key];
            }
            defaults.glass = Boolean(stored.glass);
            defaults.accentColor = normalizeHexColor(stored.accentColor) || defaults.accentColor;
            defaults.restingStyle = ['hover-clock', 'eyes-clock'].includes(stored.restingStyle)
                ? stored.restingStyle
                : 'hover-clock';
            defaults.showRestingLyrics = stored.showRestingLyrics === true;
            defaults.systemNotices = stored.systemNotices !== false;
            defaults.shelfView = ['grid', 'list'].includes(stored.shelfView)
                ? stored.shelfView
                : 'grid';
        } catch (_error) {
            // Corrupt or missing preferences fall back to the default appearance.
        }
        defaults.visiblePages.settings = true;
        return defaults;
    }

    _savePreferences() {
        try {
            GLib.mkdir_with_parents(this._taskDirectory, 0o755);
            GLib.file_set_contents(this._preferencesFile, JSON.stringify(this._preferences, null, 2));
        } catch (error) {
            logError(error, 'Perdana Island could not save preferences');
        }
    }

    _visiblePages() {
        return PAGES.filter(page => page.key === 'settings'
            || this._preferences?.visiblePages?.[page.key] !== false);
    }

    _setPreference(key, value) {
        this._preferences[key] = value;
        this._savePreferences();
        if (key === 'systemNotices' && !value && this._systemNoticeActive)
            this._dismissSystemNotice(true);
        if (key === 'glass')
            this._applyGlassPreference();
        if (key === 'accentColor') {
            this._focusRing?.queue_repaint();
            this._applyAccentStyles();
        }
        if (key === 'restingStyle') {
            this._compactVisualState = null;
            this._layoutCompactCenter();
            this._updateCollapsedLabel();
        }
        if (key === 'showRestingLyrics') {
            this._restingLyricsWidth = value ? this._restingLyricsPillWidth() : PLAYING_WIDTH;
            this._compactLyricsFitKey = null;
            this._compactLyricsFitClass = null;
            this._updateLyricsRestingToggle();
            if (value)
                this._syncSelectedPlayerLyrics();
            this._updateMediaTicker();
            this._updateCollapsedLabel();
        }
        if (['settings', 'shelf'].includes(this._activePage))
            this._renderPanel();
    }

    _applyAccentStyles(actor = this._root) {
        if (!actor || !this._preferences)
            return;
        const color = normalizeHexColor(this._preferences.accentColor) || DEFAULT_ACCENT_COLOR;
        const [red, green, blue] = hexColorToRgb(color).map(value => Math.round(value * 255));
        const channel = value => {
            const normalized = value / 255;
            return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        };
        const luminance = 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
        const foreground = luminance > 0.179 ? '#111111' : '#ffffff';
        const soft = `rgba(${red}, ${green}, ${blue}, 0.24)`;
        const styles = new Map([
            ['perdana-island__focus-compact-icon', `color: ${color};`],
            ['perdana-island__clipboard-notice', `color: ${color};`],
            ['perdana-island__today-weekday', `color: ${color};`],
            ['perdana-island__calendar-day--today', `color: ${color};`],
            ['perdana-button--nav-active', `background-color: ${soft}; color: #ffffff;`],
            ['perdana-button--segment-active', `background-color: ${soft}; color: #ffffff;`],
            ['perdana-button--lyrics-resting-active', `background-color: ${soft}; color: #ffffff;`],
            ['perdana-island__setting-option--active', `background-color: ${soft}; color: #ffffff;`],
            ['perdana-button--focus-apply', `background-color: ${color}; color: ${foreground};`],
            ['perdana-action--primary', `background-color: ${color}; color: ${foreground};`],
        ]);
        const visit = current => {
            const classNames = (current.get_style_class_name?.() || '').split(/\s+/);
            for (const [className, style] of styles) {
                if (current.has_style_class_name?.(className) || classNames.includes(className))
                    current.set_style(style);
            }
            for (const child of current.get_children?.() || [])
                visit(child);
        };
        visit(actor);
    }

    _setPageVisible(key, visible) {
        if (key === 'settings')
            return;
        this._preferences.visiblePages[key] = Boolean(visible);
        this._savePreferences();
        if (!this._visiblePages().some(page => page.key === this._activePage))
            this._activePage = 'settings';
        if (this._activePage !== 'today')
            this._stopTodayTicker();
        if (this._activePage !== 'clipboard')
            this._stopClipboardTicker();
        this._layoutTabs(this._expandedWidth());
        this._renderPanel();
    }

    _applyGlassPreference() {
        if (!this._root || !this._surface)
            return;
        const enabled = Boolean(this._preferences?.glass);
        if (enabled) {
            this._root.add_style_class_name('perdana-island--glass');
        } else {
            this._root.remove_style_class_name('perdana-island--glass');
        }
        for (const ear of this._islandEars) {
            ear.visible = !enabled;
            ear.queue_repaint();
        }
        this._updateIslandShapeStyle();
        // Shell.BlurEffect paints the background into rectangular actor bounds.
        // It cannot follow this custom rounded Cairo silhouette on GNOME 50,
        // so using it creates dark rectangular patches during hover and resize.
        this._surface.queue_repaint();
    }

    _connectNotifications() {
        this._notificationTray = Main.messageTray;
        if (!this._notificationTray)
            return;
        this._notificationSourceAddedSignal = this._notificationTray.connect(
            'source-added', (_tray, source) => this._connectNotificationSource(source)
        );
        this._notificationSourceRemovedSignal = this._notificationTray.connect(
            'source-removed', (_tray, source) => this._disconnectNotificationSource(source)
        );
        for (const source of this._notificationTray.getSources())
            this._connectNotificationSource(source);
    }

    _connectNotificationSource(source) {
        if (!source || this._notificationSources.has(source))
            return;
        const addedSignal = source.connect('notification-added', (_source, notification) =>
            this._trackNotification(source, notification));
        const removedSignal = source.connect('notification-removed', (_source, notification) =>
            this._untrackNotification(notification));
        const bannerSignal = source.connect('notification-request-banner', (_source, notification) =>
            this._trackNotification(source, notification, true));
        this._notificationSources.set(source, {addedSignal, removedSignal, bannerSignal});
        for (const notification of source.notifications || [])
            this._trackNotification(source, notification);
    }

    _disconnectNotificationSource(source) {
        const signals = this._notificationSources.get(source);
        if (signals) {
            if (signals.addedSignal)
                source.disconnect(signals.addedSignal);
            if (signals.removedSignal)
                source.disconnect(signals.removedSignal);
            if (signals.bannerSignal)
                source.disconnect(signals.bannerSignal);
            this._notificationSources.delete(source);
        }
        this._notificationItems = this._notificationItems.filter(item => item.source !== source);
        this._renderNotificationsIfVisible();
    }

    _trackNotification(source, notification, fresh = false) {
        if (!notification)
            return;
        let item = this._notificationItems.find(entry => entry.notification === notification);
        if (item) {
            item.app = String(source.title || source.app?.get_name?.() || 'Application');
            item.title = String(notification.title || source.title || 'Notification');
            item.body = String(notification.body || '');
        } else {
            item = {
                id: ++this._notificationSequence,
                source,
                notification,
                app: String(source.title || source.app?.get_name?.() || 'Application'),
                title: String(notification.title || source.title || 'Notification'),
                body: String(notification.body || ''),
            };
            this._notificationItems.unshift(item);
            this._notificationItems = this._notificationItems.slice(0, 100);
        }
        this._renderNotificationsIfVisible();
        if (fresh && source.policy?.showBanners !== false)
            this._showSystemNotice('application', item);
    }

    _untrackNotification(notification) {
        this._notificationItems = this._notificationItems.filter(item => item.notification !== notification);
        this._renderNotificationsIfVisible();
    }

    _renderNotificationsIfVisible() {
        if (!this._clearingNotifications && this._enabled
            && this._activePage === 'notifications' && this._pageViewport)
            this._renderPanel();
    }

    _clearNotifications() {
        this._clearingNotifications = true;
        for (const item of [...this._notificationItems]) {
            try {
                item.notification.destroy(MessageTray.NotificationDestroyedReason.DISMISSED);
            } catch (_error) {
                this._untrackNotification(item.notification);
            }
        }
        this._notificationItems = [];
        this._clearingNotifications = false;
        this._renderNotificationsIfVisible();
    }

    _disconnectNotifications() {
        const tray = this._notificationTray;
        if (tray) {
            if (this._notificationSourceAddedSignal)
                tray.disconnect(this._notificationSourceAddedSignal);
            if (this._notificationSourceRemovedSignal)
                tray.disconnect(this._notificationSourceRemovedSignal);
        }
        for (const [source, signals] of this._notificationSources) {
            if (signals.addedSignal)
                source.disconnect(signals.addedSignal);
            if (signals.removedSignal)
                source.disconnect(signals.removedSignal);
            if (signals.bannerSignal)
                source.disconnect(signals.bannerSignal);
        }
        this._notificationSources.clear();
        this._notificationItems = [];
        this._notificationTray = null;
        this._notificationSourceAddedSignal = 0;
        this._notificationSourceRemovedSignal = 0;
    }

    disable() {
        this._enabled = false;
        this._uiActorsAlive = false;
        Main.wm.removeKeybinding('toggle-island-visibility');
        this._keybindingSettings = null;
        if (this._stageSignal) {
            global.stage.disconnect(this._stageSignal);
            this._stageSignal = 0;
        }
        this._hoverOpenSource && GLib.source_remove(this._hoverOpenSource);
        this._hoverOpenSource = 0;
        this._hoverCloseSource && GLib.source_remove(this._hoverCloseSource);
        this._hoverCloseSource = 0;
        this._focusSource && GLib.source_remove(this._focusSource);
        this._focusSource = 0;
        this._focusNoticeSource && GLib.source_remove(this._focusNoticeSource);
        this._focusNoticeSource = 0;
        this._clockSource && GLib.source_remove(this._clockSource);
        this._clockSource = 0;
        this._mediaSource && GLib.source_remove(this._mediaSource);
        this._mediaSource = 0;
        this._mediaTickerInterval = 0;
        this._lyricsFallbackSource && GLib.source_remove(this._lyricsFallbackSource);
        this._lyricsFallbackSource = 0;
        this._lyricsRetrySource && GLib.source_remove(this._lyricsRetrySource);
        this._lyricsRetrySource = 0;
        this._todaySource && GLib.source_remove(this._todaySource);
        this._todaySource = 0;
        this._chargingSource && GLib.source_remove(this._chargingSource);
        this._chargingSource = 0;
        this._noticeDismissSource && GLib.source_remove(this._noticeDismissSource);
        this._noticeDismissSource = 0;
        this._blinkSource && GLib.source_remove(this._blinkSource);
        this._blinkSource = 0;
        this._clipboardSource && GLib.source_remove(this._clipboardSource);
        this._clipboardSource = 0;
        this._shelfRefreshSource && GLib.source_remove(this._shelfRefreshSource);
        this._shelfRefreshSource = 0;
        this._shelfNoticeSource && GLib.source_remove(this._shelfNoticeSource);
        this._shelfNoticeSource = 0;
        this._taskFocusSource && GLib.source_remove(this._taskFocusSource);
        this._taskFocusSource = 0;
        this._disconnectNotifications();
        this._lyricsCancellable?.cancel();
        this._lyricsCancellable = null;
        if (this._lyricsSession)
            this._lyricsSession.abort();
        this._lyricsSession = null;
        for (const request of this._artworkRequests.values())
            request.cancellable.cancel();
        this._artworkRequests.clear();
        this._artworkSession?.abort();
        this._artworkSession = null;
        for (const source of this._artworkEvictionSources)
            GLib.source_remove(source);
        this._artworkEvictionSources.clear();
        for (const path of this._artworkFiles) {
            try {
                Gio.File.new_for_path(path).delete(null);
            } catch (_error) {
                // The cache entry may already have been evicted.
            }
        }
        this._artworkFiles.clear();
        this._artworkCache.clear();
        this._roundedArtworkCache.clear();
        if (this._artworkCacheDirectory) {
            try {
                Gio.File.new_for_path(this._artworkCacheDirectory).delete(null);
            } catch (_error) {
                // The temporary directory can already be gone.
            }
            this._artworkCacheDirectory = null;
        }

        if (this._shelfMonitor) {
            if (this._shelfMonitorSignal) {
                this._shelfMonitor.disconnect(this._shelfMonitorSignal);
                this._shelfMonitorSignal = 0;
            }
            this._shelfMonitor.cancel();
            this._shelfMonitor = null;
        }

        this._volumeStream?.disconnectObject(this);
        this._volumeControl?.disconnectObject(this);
        this._volumeStream = null;
        this._volumeControl = null;

        for (const body of this._outgoingPageBodies) {
            body.remove_all_transitions();
            if (body.get_parent())
                body.destroy();
        }
        this._outgoingPageBodies.clear();

        for (const equalizer of this._equalizers)
            this._setEqualizerPlaying(equalizer, false);
        this._equalizers.clear();

        if (this._busSignal) {
            Gio.DBus.session.signal_unsubscribe(this._busSignal);
            this._busSignal = 0;
        }

        for (const [name, entry] of this._players) {
            if (entry.signalId)
                entry.proxy.disconnect(entry.signalId);
            if (entry.seekedSignalId)
                entry.proxy.disconnect(entry.seekedSignalId);
            this._players.delete(name);
        }

        if (this._monitorSignal) {
            Main.layoutManager.disconnect(this._monitorSignal);
            this._monitorSignal = 0;
        }
        if (this._shelfChooser) {
            Gio.DBus.session.signal_unsubscribe(this._shelfChooser);
            this._shelfChooser = 0;
        }
        if (this._shelfChooserRequestPath) {
            Gio.DBus.session.call(
                'org.freedesktop.portal.Desktop',
                this._shelfChooserRequestPath,
                'org.freedesktop.portal.Request',
                'Close',
                null,
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null,
                () => {}
            );
            this._shelfChooserRequestPath = null;
        }

        if (this._motionSignal) {
            this._motionSettings.disconnect(this._motionSignal);
            this._motionSignal = 0;
        }
        this._motionSettings = null;

        if (this._root) {
            // Widget signals belong to this actor tree; destroying its root
            // releases all page actors and their signal handlers together.
            if (this._allocationSignal) {
                this._root.disconnect(this._allocationSignal);
                this._allocationSignal = 0;
            }
            Main.layoutManager.removeChrome(this._root);
            this._root.destroy();
            this._root = null;
        }
        this._islandEars = [];
        this._pageBody = null;
        this._mediaPositionLabel = null;
        this._mediaDurationLabel = null;
        this._progressTrack = null;
        this._progressLine = null;
        this._progressFill = null;
        this._mediaEqualizer = null;
        this._lyricsStatusLabel = null;
        this._lyricsViewport = null;
        this._lyricsRail = null;
        this._lyricsWaitLabel = null;
        this._lyricsRenderedLines = null;
        this._lyricsLineLabels = [];
        this._lyricsLayoutWidth = 0;
        this._lyricsLayoutHeight = 0;
        this._lyricsPlaybackButton = null;
        this._pageButtons?.clear();
        this._todayTiles = [];
        this._lyricsLineLabels = [];
        for (const property of Object.keys(this)) {
            if (this[property] instanceof Clutter.Actor)
                this[property] = null;
        }

    }

    _buildInterface() {
        this._root = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            reactive: true,
            track_hover: true,
            can_focus: false,
            clip_to_allocation: false,
            style_class: 'perdana-island',
        });
        this._root.connect('destroy', () => {
            this._uiActorsAlive = false;
        });
        this._root.add_style_class_name('perdana-island--custom-shape');
        this._root.add_style_class_name('perdana-island--v12');
        if (this._reducedMotion)
            this._root.add_style_class_name('perdana-island--reduced-motion');
        Main.layoutManager.addChrome(this._root, {
            affectsStruts: false,
            trackFullscreen: true,
        });
        this._islandEars = [false, true].map(isRight => {
            const ear = new St.DrawingArea({reactive: false, visible: false});
            ear.connect('repaint', area => this._paintIslandEar(area, isRight));
            this._root.add_child(ear);
            return ear;
        });
        this._surface = new St.DrawingArea();
        this._surface.connect('repaint', area => this._paintIslandShape(area));
        this._root.add_child(this._surface);

        this._content = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            reactive: false,
            clip_to_allocation: true,
        });
        this._root.add_child(this._content);
        this._root.set_size(COLLAPSED_WIDTH, COLLAPSED_HEIGHT);
        this._root.connect('notify::hover', () => this._onHoverChanged());
        this._compactButton = new St.Button({
            can_focus: true,
            reactive: true,
            track_hover: true,
            style_class: 'perdana-island__compact-button',
            accessible_name: 'Open Perdana Island',
        });
        this._compactButton.connect('clicked', () => {
            this._pinned = true;
            this._setExpanded(true);
        });

        this._compactContents = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
            reactive: false,
        });
        this._compact = new St.BoxLayout({
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
            style_class: 'perdana-island__compact',
        });
        this._compactLeading = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            y_expand: true,
            y_align: Clutter.ActorAlign.FILL,
            style_class: 'perdana-island__compact-leading',
        });
        this._compactArtwork = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            clip_to_allocation: true,
            style_class: 'perdana-island__compact-artwork',
        });
        this._compactArtwork.set_position(0, 7);
        this._compactArtwork.set_size(24, 24);
        this._compactArtworkIcon = new St.Icon({
            icon_name: 'audio-x-generic-symbolic',
            style_class: 'perdana-island__compact-artwork-icon',
        });
        this._compactArtwork.add_child(this._compactArtworkIcon);
        this._compactArtworkKey = null;
        this._compactLeading.add_child(this._compactArtwork);

        this._compactTrackTitle = makeLabel('', 'perdana-island__compact-track-title');
        this._compactTrackTitle.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this._compactTrackTitle.clutter_text.line_wrap = false;
        this._compactTrackTitle.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        this._compactTrackTitle.x_expand = true;
        this._compactTrackTitle.y_align = Clutter.ActorAlign.CENTER;
        this._compactTrackTitle.visible = false;

        this._compactCenter = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            reactive: false,
            style_class: 'perdana-island__compact-center',
        });
        this._idleEyes = new St.BoxLayout({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'perdana-island__idle-eyes',
        });
        this._idleEyes.connect('destroy', () => {
            this._uiActorsAlive = false;
        });
        this._idleEyes.set_pivot_point(0.5, 0.5);
        for (let index = 0; index < 2; index++) {
            this._idleEyes.add_child(new St.Widget({style_class: 'perdana-island__eye'}));
        }
        this._compactClockLabel = makeLabel('', 'perdana-island__compact-clock');
        this._compactClockLabel.set_pivot_point(0.5, 0.5);
        this._compactClockLabel.opacity = 0;
        this._compactClockLabel.scale_x = 0.8;
        this._compactClockLabel.scale_y = 0.8;
        this._compactCenter.add_child(this._idleEyes);
        this._compactCenter.add_child(this._compactClockLabel);
        this._compactCenter.connect('notify::allocation', () => this._layoutCompactCenter());
        this._compactContents.add_child(this._compact);
        this._compactContents.add_child(this._compactCenter);
        this._equalizer = this._makeEqualizer();
        this._compact.add_child(this._compactLeading);
        this._compact.add_child(this._compactTrackTitle);
        this._focusCompact = new St.BoxLayout({
            visible: false,
            x_expand: true,
            y_expand: true,
            style_class: 'perdana-island__focus-compact',
        });
        this._focusCompactIcon = new St.Icon({
            icon_name: 'alarm-symbolic',
            style_class: 'perdana-island__focus-compact-icon',
        });
        this._focusCompactLabel = makeLabel('Focus', 'perdana-island__focus-compact-label');
        this._focusCompactLabel.x_expand = true;
        this._focusCompactTime = makeLabel(formatTime(DEFAULT_FOCUS_SECONDS), 'perdana-island__focus-compact-time');
        this._focusCompact.add_child(this._focusCompactIcon);
        this._focusCompact.add_child(this._focusCompactLabel);
        this._focusCompact.add_child(this._focusCompactTime);
        this._compact.add_child(this._focusCompact);
        this._compact.add_child(this._equalizer);
        this._compactButton.set_child(this._compactContents);
        this._content.add_child(this._compactButton);
        this._header = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            style_class: 'perdana-island__header',
            visible: false,
            reactive: true,
        });
        this._header.connect('scroll-event', (_actor, event) => {
            const direction = event.get_scroll_direction();
            if (direction === Clutter.ScrollDirection.UP)
                this._stepPage(-1);
            else if (direction === Clutter.ScrollDirection.DOWN)
                this._stepPage(1);
            else
                return Clutter.EVENT_PROPAGATE;
            return Clutter.EVENT_STOP;
        });
        this._header.connect('button-press-event', () => {
            this._pinned = false;
            this._setExpanded(false);
            return Clutter.EVENT_STOP;
        });
        this._dateLabel = makeLabel('', 'perdana-island__date');
        this._header.add_child(this._dateLabel);
        this._clockLabel = makeLabel('', 'perdana-island__clock');
        this._header.add_child(this._clockLabel);
        this._content.add_child(this._header);

        this._panel = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            visible: false,
            opacity: 0,
            style_class: 'perdana-island__panel',
        });
        this._content.add_child(this._panel);
        this._pageViewport = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            clip_to_allocation: true,
            style_class: 'perdana-island__page-viewport',
        });
        this._panel.add_child(this._pageViewport);
        this._tabBar = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            style_class: 'perdana-island__tabs',
        });
        this._panel.add_child(this._tabBar);
        this._pageButtons = new Map();
        this._buildTabs();
        this._uiActorsAlive = true;
        this._renderPanel();
        this._updateHeaderClock();
        this._updateCollapsedLabel();
        this._layoutIsland();
        this._scheduleBlink();
    }

    _layoutIsland() {
        if (!this._uiActorsAlive || !this._root || !this._content)
            return;
        const width = Math.max(1, this._root.width);
        const height = Math.max(1, this._root.height);
        this._updateIslandShapeStyle();
        this._surface.set_position(0, 0);
        if (Math.round(this._surface.width) !== width || Math.round(this._surface.height) !== height) {
            this._surface.set_size(width, height);
            this._surface.queue_repaint();
        }
        this._content.set_position(0, 0);
        this._content.set_size(width, height);
        const restingLyricsShape = !this._expanded && !this._closing
            && !this._focusSource && this._preferences?.showRestingLyrics
            && height > COLLAPSED_HEIGHT && height <= RESTING_LYRICS_HEIGHT;
        if (this._root.has_style_class_name('perdana-island--resting-lyrics') !== restingLyricsShape) {
            if (restingLyricsShape)
                this._root.add_style_class_name('perdana-island--resting-lyrics');
            else
                this._root.remove_style_class_name('perdana-island--resting-lyrics');
        }
        for (const [index, ear] of this._islandEars.entries()) {
            ear.set_position(index === 0 ? -ISLAND_EAR_SIZE : width, 0);
            if (Math.round(ear.width) !== ISLAND_EAR_SIZE || Math.round(ear.height) !== ISLAND_EAR_SIZE)
                ear.set_size(ISLAND_EAR_SIZE, ISLAND_EAR_SIZE);
        }
        if (this._compactButton) {
            this._compactButton.set_position(0, 0);
            this._compactButton.set_size(width, height);
        }
        if (this._compactContents) {
            this._compactContents.set_position(0, 0);
            this._compactContents.set_size(width, height);
        }
        if (this._compact) {
            this._compact.set_position(0, 0);
            this._compact.set_size(width, height);
        }
        if (this._compactCenter) {
            this._compactCenter.set_position(0, 0);
            this._compactCenter.set_size(width, height);
        }
        if (this._compactLeading) {
            this._compactLeading.set_size(24, height);
            this._compactArtwork.set_position(0, Math.round((height - 24) / 2));
        }
        if (this._header) {
            this._header.set_position(0, 0);
            this._header.set_size(width, HEADER_HEIGHT);
            this._dateLabel.set_size(170, 22);
            this._clockLabel.set_size(58, 22);
            this._dateLabel.set_position(28, 8);
            this._clockLabel.set_position(Math.max(28, width - 86), 8);
        }
        if (this._panel) {
            const panelY = HEADER_HEIGHT;
            this._panel.set_position(0, panelY);
            this._panel.set_size(width, Math.max(1, height - panelY));
        }
        this._layoutPanel(width);
        this._layoutCompactCenter();
        this._positionIsland();
    }

    _layoutPanel(width = CONTENT_WIDTH) {
        if (!this._uiActorsAlive || !this._panel || !this._pageViewport || !this._tabBar)
            return;
        const pageHeight = Math.max(1, this._root.height - HEADER_HEIGHT - TABBAR_HEIGHT);
        this._pageViewport.set_position(PAGE_INSET, 0);
        this._pageViewport.set_size(Math.max(1, width - 2 * PAGE_INSET), pageHeight);
        this._tabBar.set_position(0, pageHeight);
        this._tabBar.set_size(width, TABBAR_HEIGHT);
        if (this._pageBody)
            this._pageBody.set_size(this._pageWidth(), this._bodyHeight());
        this._layoutTabs(width);
    }

    _layoutCompactCenter() {
        if (!this._uiActorsAlive || !this._compactCenter || !this._idleEyes || !this._compactClockLabel)
            return;
        const width = Math.max(0, Math.round(this._compactCenter.width));
        const height = Math.max(0, Math.round(this._compactCenter.height));
        const eyesWidth = 34;
        const eyesHeight = 20;
        const clockWidth = 56;
        const clockHeight = 24;
        this._idleEyes.set_size(eyesWidth, eyesHeight);
        this._compactClockLabel.set_size(clockWidth, clockHeight);
        if (this._preferences?.restingStyle === 'eyes-clock') {
            const groupWidth = eyesWidth + 12 + clockWidth;
            const left = Math.round((width - groupWidth) / 2);
            this._idleEyes.set_position(left, Math.round((height - eyesHeight) / 2));
            this._compactClockLabel.set_position(left + eyesWidth + 12, Math.round((height - clockHeight) / 2));
        } else {
            this._idleEyes.set_position(
                Math.round((width - eyesWidth) / 2),
                Math.round((height - eyesHeight) / 2)
            );
            this._compactClockLabel.set_position(
                Math.round((width - clockWidth) / 2),
                Math.round((height - clockHeight) / 2)
            );
        }
    }

    _makeEqualizer() {
        const equalizer = new St.BoxLayout({
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'perdana-island__equalizer',
        });
        equalizer._perdanaBars = [];
        equalizer._perdanaPlaying = false;
        equalizer._perdanaAnimating = false;
        for (let index = 0; index < 4; index++) {
            const bar = new St.Widget({
                style_class: `perdana-island__bar perdana-island__bar--${index + 1}`,
            });
            bar.set_pivot_point(0.5, 1);
            bar.scale_y = 0.22;
            equalizer._perdanaBars.push(bar);
            equalizer.add_child(bar);
        }
        this._equalizers.add(equalizer);
        return equalizer;
    }

    _setEqualizerPlaying(equalizer, playing) {
        if (!equalizer)
            return;

        const shouldAnimate = Boolean(playing && this._enabled && !this._reducedMotion);
        equalizer._perdanaPlaying = Boolean(playing);
        if (equalizer._perdanaAnimating === shouldAnimate)
            return;

        equalizer._perdanaAnimating = shouldAnimate;
        for (const bar of equalizer._perdanaBars) {
            if (bar._perdanaAnimSource) {
                GLib.source_remove(bar._perdanaAnimSource);
                bar._perdanaAnimSource = 0;
            }
            bar.remove_all_transitions();
            if (!shouldAnimate) {
                bar.ease({
                    scale_y: playing ? 0.52 : 0.22,
                    duration: this._motionDuration(130),
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            }
        }

        if (shouldAnimate) {
            equalizer._perdanaBars.forEach((bar, index) =>
                this._animateEqualizerBar(equalizer, bar, index));
        }
    }

    _animateEqualizerBar(equalizer, bar, index) {
        if (!this._enabled || !equalizer._perdanaAnimating)
            return;

        const target = 0.22 + Math.random() * 0.78;
        const duration = 170 + Math.floor(Math.random() * 250) + index * 24;
        bar.ease({
            scale_y: target,
            duration: this._motionDuration(duration),
            mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
            onComplete: () => {
                if (!this._enabled || !equalizer._perdanaAnimating)
                    return;
                bar._perdanaAnimSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 60, () => {
                    bar._perdanaAnimSource = 0;
                    this._animateEqualizerBar(equalizer, bar, index);
                    return GLib.SOURCE_REMOVE;
                });
            },
        });
    }

    _islandRadius(width, height) {
        return Math.min(
            34,
            Math.max(1, 19 + (height - COLLAPSED_HEIGHT) * 15 / (OPEN_HEIGHT - COLLAPSED_HEIGHT)),
            height / 2,
            width / 2
        );
    }

    _updateIslandShapeStyle() {
        if (!this._root)
            return;
        // The Cairo surface paints the island silhouette and its animated
        // radius. Keep the widget itself transparent so its static CSS
        // background cannot fill the rounded corners during size transitions.
        const key = 'painted-surface';
        if (key === this._islandShapeStyleKey)
            return;
        this._islandShapeStyleKey = key;
        this._root.set_style('background-color: transparent;');
    }

    _paintIslandEar(area, isRight) {
        const [surfaceWidth, surfaceHeight] = area.get_surface_size();
        if (surfaceWidth <= 0 || surfaceHeight <= 0 || area.width <= 0 || area.height <= 0)
            return;
        const cr = area.get_context();
        cr.scale(surfaceWidth / area.width, surfaceHeight / area.height);
        cr.newPath();
        if (isRight) {
            cr.moveTo(0, 0);
            cr.lineTo(ISLAND_EAR_SIZE, 0);
            cr.arcNegative(
                ISLAND_EAR_SIZE,
                ISLAND_EAR_SIZE,
                ISLAND_EAR_SIZE,
                -Math.PI / 2,
                -Math.PI
            );
            cr.lineTo(0, 0);
        } else {
            cr.moveTo(0, 0);
            cr.lineTo(ISLAND_EAR_SIZE, 0);
            cr.lineTo(ISLAND_EAR_SIZE, ISLAND_EAR_SIZE);
            cr.arcNegative(0, ISLAND_EAR_SIZE, ISLAND_EAR_SIZE, 0, -Math.PI / 2);
        }
        cr.closePath();
        cr.setSourceRGBA(0, 0, 0, 1);
        cr.fill();
        cr.$dispose();
    }

    _paintIslandShape(area) {
        const [surfaceWidth, surfaceHeight] = area.get_surface_size();
        if (surfaceWidth <= 0 || surfaceHeight <= 0 || area.width <= 0 || area.height <= 0)
            return;
        const cr = area.get_context();
        cr.scale(surfaceWidth / area.width, surfaceHeight / area.height);
        const width = area.width;
        const height = area.height;
        const radius = this._islandRadius(width, height);
        cr.newPath();
        cr.moveTo(0, 0);
        cr.lineTo(width, 0);
        cr.lineTo(width, height - radius);
        cr.arc(width - radius, height - radius, radius, 0, Math.PI / 2);
        cr.lineTo(radius, height);
        cr.arc(radius, height - radius, radius, Math.PI / 2, Math.PI);
        cr.lineTo(0, 0);
        cr.closePath();
        if (this._preferences?.glass) {
            const gradient = new Cairo.LinearGradient(0, 0, 0, height);
            gradient.addColorStopRGBA(0, 0.08, 0.12, 0.2, 0.38);
            gradient.addColorStopRGBA(1, 0.04, 0.08, 0.15, 0.58);
            cr.setSource(gradient);
        } else {
            cr.setSourceRGBA(0, 0, 0, 1);
        }
        cr.fill();
        cr.$dispose();
    }

    _updateReducedMotion() {
        if (!this._root)
            return;
        if (this._reducedMotion)
            this._root.add_style_class_name('perdana-island--reduced-motion');
        else
            this._root.remove_style_class_name('perdana-island--reduced-motion');
        if (this._reducedMotion)
            this._clearTimeout('_blinkSource');
        else if (!this._expanded && !this._isPlaying())
            this._scheduleBlink();
        for (const equalizer of this._equalizers)
            this._setEqualizerPlaying(equalizer, equalizer._perdanaPlaying);
    }

    _motionDuration(milliseconds) {
        return this._reducedMotion ? 1 : milliseconds;
    }

    _positionIsland() {
        if (!this._uiActorsAlive || !this._root || !Main.layoutManager.primaryMonitor)
            return;

        const monitor = Main.layoutManager.primaryMonitor;
        const width = this._root.width || this._root.get_preferred_width(-1)[1];
        const x = monitor.x + (monitor.width - width) / 2;
        if (this._root.x !== x || this._root.y !== monitor.y)
            this._root.set_position(x, monitor.y);
    }

    _restingLyricsPillWidth() {
        const monitorWidth = Main.layoutManager.primaryMonitor?.width;
        if (!monitorWidth)
            return RESTING_LYRICS_WIDTH;
        return Math.max(PLAYING_WIDTH, Math.min(RESTING_LYRICS_WIDTH, monitorWidth - 32));
    }

    _collapsedWidth() {
        if (this._focusSource)
            return PLAYING_WIDTH;
        if (this._isPlaying()) {
            return this._preferences?.showRestingLyrics
                ? this._restingLyricsPillWidth()
                : PLAYING_WIDTH;
        }
        return COLLAPSED_WIDTH;
    }

    _collapsedHeight() {
        return !this._focusSource && this._isPlaying()
            && this._preferences?.showRestingLyrics
            ? RESTING_LYRICS_HEIGHT
            : COLLAPSED_HEIGHT;
    }

    _expandedWidth() {
        const preferred = PAGE_WIDTHS[this._activePage] || CONTENT_WIDTH;
        const monitorWidth = Main.layoutManager.primaryMonitor?.width;
        return monitorWidth ? Math.max(1, Math.min(preferred, monitorWidth - 32)) : preferred;
    }

    _expandedHeight() {
        return OPEN_HEIGHT;
    }

    _pageWidth() {
        return this._expandedWidth() - 2 * PAGE_INSET;
    }

    _onHoverChanged() {
        if (this._root.hover) {
            this._root.add_style_class_name('perdana-island--hot');
            this._clearTimeout('_hoverCloseSource');
            this._updateCollapsedLabel();
        } else if (this._expanded && !this._pinned) {
            this._root.remove_style_class_name('perdana-island--hot');
            this._updateCollapsedLabel();
            this._clearTimeout('_hoverOpenSource');
            this._clearTimeout('_hoverCloseSource');
            this._hoverCloseSource = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                320,
                () => {
                    this._hoverCloseSource = 0;
                    if (!this._root?.hover)
                        this._setExpanded(false);
                    return GLib.SOURCE_REMOVE;
                }
            );
        } else {
            this._root.remove_style_class_name('perdana-island--hot');
            this._updateCollapsedLabel();
        }
    }

    _toggleIslandVisibility() {
        if (!this._enabled || !this._root)
            return;

        this._userHidden = !this._userHidden;
        if (this._userHidden) {
            this._cancelCompactTrackTextTransition();
            this._pinned = false;
            this._clearTimeout('_hoverOpenSource');
            this._clearTimeout('_hoverCloseSource');
            this._clearTimeout('_noticeDismissSource');
            this._clearTimeout('_blinkSource');
            if (this._expanded) {
                this._expanded = false;
                this._closing = false;
                this._stopTodayTicker();
                this._stopClipboardTicker();
                this._root.remove_all_transitions();
                this._header.remove_all_transitions();
                this._panel.remove_all_transitions();
                this._compactButton.remove_all_transitions();
                this._root.remove_style_class_name('perdana-island--expanded');
                this._panel.hide();
                this._panel.opacity = 255;
                this._header.hide();
                this._header.opacity = 255;
                this._compactButton.show();
                this._compactButton.opacity = 255;
            }
            if (this._systemNoticeActive)
                this._dismissSystemNotice(false);
            this._root.remove_style_class_name('perdana-island--hot');
            this._root.hide();
            return;
        }

        this._root.remove_all_transitions();
        this._root.set_size(this._collapsedWidth(), this._collapsedHeight());
        this._root.opacity = 255;
        this._root.show();
        this._layoutIsland();
        this._positionIsland();
        this._updateCollapsedLabel();
        if (!this._isPlaying() && !this._focusSource)
            this._scheduleBlink();
    }

    _setExpanded(expanded) {
        if (!this._enabled || !this._root || !this._panel)
            return;
        if (expanded && this._userHidden)
            return;
        if (this._expanded === expanded) {
            if (expanded && this._activePage === 'today')
                this._startTodayTicker();
            return;
        }

        this._expanded = expanded;
        this._closing = !expanded;
        if (expanded) {
            this._resetRestingEyes();
            this._cancelCompactTrackTextTransition();
        }
        this._clearTimeout('_hoverOpenSource');
        this._clearTimeout('_hoverCloseSource');
        this._root.set_pivot_point(0.5, 0);
        this._panel.remove_all_transitions();
        this._header.remove_all_transitions();
        this._compactButton.remove_all_transitions();
        this._root.remove_all_transitions();
        this._collapsedTargetSize = null;

        if (expanded) {
            this._closing = false;
            this._root.add_style_class_name('perdana-island--expanded');
            this._compactButton.show();
            this._compactButton.opacity = 255;
            this._header.show();
            this._header.opacity = 0;
            this._updateClockLabel();
            this._panel.show();
            this._renderPanel();
            this._panel.opacity = 0;
            this._root.set_size(this._collapsedWidth(), this._collapsedHeight());
            this._layoutIsland();
            this._positionIsland();
            this._root.ease({
                width: this._expandedWidth(),
                height: this._expandedHeight(),
                duration: this._motionDuration(500),
                mode: this._reducedMotion ? Clutter.AnimationMode.LINEAR : Clutter.AnimationMode.EASE_OUT_CUBIC,
                onComplete: () => {
                    this._layoutIsland();
                },
            });
            this._compactButton.ease({
                opacity: 0,
                duration: this._motionDuration(130),
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onComplete: () => {
                    if (this._expanded)
                        this._compactButton.hide();
                },
            });
            this._header.ease({
                opacity: 255,
                duration: this._motionDuration(150),
                delay: this._motionDuration(365),
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
            this._panel.ease({
                opacity: 255,
                duration: this._motionDuration(150),
                delay: this._motionDuration(365),
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
            if (this._activePage === 'today')
                this._startTodayTicker();
            if (this._activePage === 'clipboard')
                this._startClipboardTicker();
            this._clearTimeout('_blinkSource');
        } else {
            this._stopTodayTicker();
            this._stopClipboardTicker();
            this._setEqualizerPlaying(this._mediaEqualizer, false);
            this._compactButton.show();
            this._compactButton.opacity = 0;
            this._compactButton.ease({
                opacity: 255,
                duration: this._motionDuration(140),
                delay: this._motionDuration(360),
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
            this._header.ease({
                opacity: 0,
                duration: this._motionDuration(125),
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
            });
            this._panel.ease({
                opacity: 0,
                duration: this._motionDuration(125),
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
            });
            const collapsedWidth = this._collapsedWidth();
            const collapsedHeight = this._collapsedHeight();
            const targetSize = `${collapsedWidth}x${collapsedHeight}`;
            this._collapsedTargetSize = targetSize;
            this._root.ease({
                width: collapsedWidth,
                height: collapsedHeight,
                duration: this._motionDuration(500),
                delay: 70,
                mode: this._reducedMotion ? Clutter.AnimationMode.LINEAR : Clutter.AnimationMode.EASE_IN_CUBIC,
                onComplete: () => {
                    if (this._expanded || !this._enabled || !this._root
                        || this._collapsedTargetSize !== targetSize)
                        return;
                    this._header.hide();
                    this._header.opacity = 255;
                    this._panel.hide();
                    this._panel.opacity = 255;
                    this._compactButton.opacity = 255;
                    this._root.remove_style_class_name('perdana-island--expanded');
                    this._closing = false;
                    this._root.set_size(this._collapsedWidth(), this._collapsedHeight());
                    this._layoutIsland();
                    this._positionIsland();
                    this._compactVisualState = null;
                    this._updateHeaderClock();
                    this._updateCollapsedLabel();
                    if (!this._isPlaying() && !this._focusSource)
                        this._scheduleBlink();
                },
            });
        }
        this._positionIsland();
        this._updateMediaTicker();
    }

    _updateClockLabel() {
        this._updateHeaderClock();
    }

    _updateHeaderClock() {
        if (!this._uiActorsAlive)
            return;
        const now = new Date();
        const compactFormatter = new Intl.DateTimeFormat('en-US', {
            hour: 'numeric', minute: '2-digit', hour12: true,
        });
        const headerFormatter = new Intl.DateTimeFormat('en-US', {
            hour: 'numeric', minute: '2-digit', hour12: true,
        });
        if (this._compactClockLabel)
            this._compactClockLabel.text = compactFormatter.format(now).replace(/\s?[AP]M$/i, '');
        if (!this._dateLabel || !this._clockLabel)
            return;
        const formatter = new Intl.DateTimeFormat('en-US', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
        });
        this._dateLabel.text = formatter.format(now);
        this._clockLabel.text = headerFormatter.format(now);
    }

    _selectPage(key) {
        if (!this._visiblePages().some(page => page.key === key))
            return;
        if (this._activePage === key)
            return;
        const pages = this._visiblePages();
        const previousIndex = pages.findIndex(page => page.key === this._activePage);
        const nextIndex = pages.findIndex(page => page.key === key);
        this._previousPageIndex = previousIndex;
        const forward = (nextIndex - previousIndex + pages.length) % pages.length;
        const backward = (previousIndex - nextIndex + pages.length) % pages.length;
        const direction = forward <= backward ? 1 : -1;
        this._activePage = key;
        this._updateMediaTicker();
        this._tabSwitching = true;
        try {
            this._renderPanel(true, direction);
        } finally {
            this._tabSwitching = false;
        }
        if (this._expanded) {
            this._root.ease({
                width: this._expandedWidth(),
                height: this._expandedHeight(),
                duration: this._motionDuration(320),
                mode: this._reducedMotion ? Clutter.AnimationMode.LINEAR : Clutter.AnimationMode.EASE_OUT_CUBIC,
                onComplete: () => this._layoutIsland(),
            });
            this._layoutIsland();
        }
        if (key === 'today' && this._expanded)
            this._startTodayTicker();
        else
            this._stopTodayTicker();
        if (key === 'clipboard' && this._expanded)
            this._startClipboardTicker();
        else
            this._stopClipboardTicker();
    }

    _pageHeight() {
        return this._expandedHeight() - HEADER_HEIGHT - TABBAR_HEIGHT;
    }

    _bodyHeight() {
        return this._pageHeight();
    }

    _stepPage(delta) {
        const pages = this._visiblePages();
        const index = pages.findIndex(page => page.key === this._activePage);
        const nextIndex = (index + delta + pages.length) % pages.length;
        this._selectPage(pages[nextIndex].key);
    }

    _isPlaying() {
        const player = this._getSelectedPlayer();
        return Boolean(player && this._getProperty(player.proxy, 'PlaybackStatus') === 'Playing');
    }

    _trackRestingEyes(event) {
        if (!this._uiActorsAlive || !this._idleEyes || !this._compactCenter
            || !this._idleEyes.visible || this._isPlaying() || this._expanded || this._closing)
            return Clutter.EVENT_PROPAGATE;

        const [pointerX, pointerY] = event.get_coords();
        const [centerX, centerY] = this._compactCenter.get_transformed_position();
        const dx = pointerX - centerX - this._compactCenter.width / 2;
        const dy = pointerY - centerY - this._compactCenter.height / 2;
        this._idleEyes.translation_x = Math.max(-7, Math.min(7, dx * 0.17));
        this._idleEyes.translation_y = Math.max(-3.5, Math.min(3.5, dy * 0.22));
        return Clutter.EVENT_PROPAGATE;
    }

    _resetRestingEyes() {
        if (!this._uiActorsAlive || !this._idleEyes)
            return;
        this._idleEyes.remove_all_transitions();
        this._idleEyes.ease({
            translation_x: 0,
            translation_y: 0,
            duration: this._motionDuration(180),
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        });
    }

    _onStageEvent(event) {
        if (!this._enabled || !this._uiActorsAlive)
            return Clutter.EVENT_PROPAGATE;
        if (event.type() === Clutter.EventType.MOTION) {
            this._trackRestingEyes(event);
        } else if (event.type() === Clutter.EventType.KEY_PRESS) {
            const key = event.get_key_symbol();
            if (this._expanded && key === Clutter.KEY_Escape) {
                this._pinned = false;
                this._setExpanded(false);
                return Clutter.EVENT_STOP;
            }
            if (this._expanded && !this._taskAdding && !this._focusCustomEditing
                && (key === Clutter.KEY_Left || key === Clutter.KEY_Right)) {
                this._stepPage(key === Clutter.KEY_Left ? -1 : 1);
                return Clutter.EVENT_STOP;
            }
        } else if (event.type() === Clutter.EventType.BUTTON_PRESS && this._expanded) {
            const [pointerX, pointerY] = event.get_coords();
            const [x, y] = this._root.get_transformed_position();
            const [width, height] = this._root.get_transformed_size();
            if (pointerX < x || pointerX > x + width || pointerY < y || pointerY > y + height) {
                this._pinned = false;
                this._setExpanded(false);
            }
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _scheduleBlink() {
        this._clearTimeout('_blinkSource');
        if (!this._enabled || this._userHidden || this._reducedMotion || this._expanded || this._root?.hover
            || this._isPlaying() || this._focusSource)
            return;
        const delay = 2500 + Math.floor(Math.random() * 3500);
        this._blinkSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._blinkSource = 0;
            if (!this._enabled || this._userHidden || this._reducedMotion || this._expanded || this._root?.hover
                || this._isPlaying() || this._focusSource)
                return GLib.SOURCE_REMOVE;
            for (const eye of this._idleEyes.get_children()) {
                eye.remove_all_transitions();
                eye.ease({scale_y: 0.08, duration: 85, mode: Clutter.AnimationMode.EASE_IN_QUAD,
                    onComplete: () => eye.ease({scale_y: 1, duration: 110, mode: Clutter.AnimationMode.EASE_OUT_QUAD})});
            }
            this._scheduleBlink();
            return GLib.SOURCE_REMOVE;
        });
    }

    _buildTabs() {
        for (const page of PAGES) {
            const contents = new St.BoxLayout({
                style_class: 'perdana-island__tab-content',
                y_align: Clutter.ActorAlign.CENTER,
            });
            const icon = new St.Icon({
                icon_name: page.icon,
                style_class: 'perdana-island__tab-icon',
            });
            icon.set_size(18, 18);
            const label = makeLabel(page.label, 'perdana-island__tab-label');
            label.visible = false;
            contents.add_child(icon);
            contents.add_child(label);
            const button = new St.Button({
                child: contents,
                can_focus: true,
                reactive: true,
                track_hover: true,
                style_class: 'perdana-button perdana-button--nav',
                accessible_name: `${page.label} page`,
            });
            button.connect('clicked', () => this._selectPage(page.key));
            button.visible = page.key === 'settings'
                || this._preferences.visiblePages[page.key] !== false;
            this._tabBar.add_child(button);
            this._pageButtons.set(page.key, {button, icon, label, selected: undefined});
        }
        this._layoutTabs(this._expandedWidth());
    }

    _layoutTabs(width) {
        if (!this._pageButtons)
            return;
        const pages = this._visiblePages();
        const inactiveWidth = 34;
        const buttonHeight = 30;
        const inset = 8;
        const gap = 4;
        const widths = pages.map(page => {
            const entry = this._pageButtons.get(page.key);
            if (page.key !== this._activePage || !entry)
                return inactiveWidth;
            const naturalWidth = entry.label.get_preferred_width(-1)[1];
            const labelWidth = Math.ceil(Math.max(naturalWidth, page.label.length * 7));
            return labelWidth + 18 + 6 + inset * 2;
        });
        const totalWidth = widths.reduce((total, item) => total + item, 0) + gap * (pages.length - 1);
        let x = Math.round((width - totalWidth) / 2);
        for (const page of PAGES) {
            const entry = this._pageButtons.get(page.key);
            if (!entry)
                continue;
            const visibleIndex = pages.findIndex(visiblePage => visiblePage.key === page.key);
            const shown = visibleIndex >= 0;
            entry.button.visible = shown;
            if (!shown)
                continue;
            const active = page.key === this._activePage;
            const buttonWidth = widths[visibleIndex];
            entry.button.set_position(x, Math.round((TABBAR_HEIGHT - buttonHeight) / 2));
            entry.button.set_size(buttonWidth, buttonHeight);
            entry.button.accessible_name = active ? `${page.label}, selected` : page.label;
            if (entry.selected !== active) {
                entry.selected = active;
                if (active) {
                    entry.button.add_style_class_name('perdana-button--nav-active');
                } else {
                    entry.button.remove_style_class_name('perdana-button--nav-active');
                    entry.button.set_style('');
                }
                entry.label.visible = active;
            }
            entry.label.set_opacity(active ? 255 : 0);
            x += buttonWidth + gap;
        }
        this._applyAccentStyles();
    }

    _renderPanel(animate = false, direction = 1) {
        if (!this._pageViewport)
            return;

        this._clearTimeout('_taskFocusSource');

        for (const outgoing of this._outgoingPageBodies) {
            outgoing.remove_all_transitions();
            if (outgoing.get_parent())
                outgoing.destroy();
        }
        this._outgoingPageBodies.clear();

        if (this._mediaEqualizer) {
            this._setEqualizerPlaying(this._mediaEqualizer, false);
            this._equalizers.delete(this._mediaEqualizer);
        }

        this._focusLabel = null;
        this._focusStatusLabel = null;
        this._focusToggleButton = null;
        this._focusRing = null;
        this._focusCustomEntry = null;
        this._focusCustomUnitButton = null;
        this._focusCustomUnitLabel = null;
        this._focusSessionsLabel = null;
        this._focusCustomEditing = false;
        this._mediaPositionLabel = null;
        this._mediaDurationLabel = null;
        this._progressTrack = null;
        this._progressLine = null;
        this._progressFill = null;
        this._mediaEqualizer = null;
        this._progressSeeking = false;
        this._progressCanSeek = false;
        this._lyricsStatusLabel = null;
        this._lyricsViewport = null;
        this._lyricsRail = null;
        this._lyricsWaitLabel = null;
        this._lyricsRenderedLines = null;
        this._lyricsLineLabels = [];
        this._lyricsLayoutWidth = 0;
        this._lyricsLayoutHeight = 0;
        this._lyricsPlaybackButton = null;
        this._lyricsRestingToggle = null;
        this._lyricsDisplayedIndex = -1;
        this._lyricsDisplayGap = false;
        const previous = this._pageBody;
        const body = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            style_class: 'perdana-island__page',
        });
        body.set_position(0, 0);
        body.set_size(this._pageWidth(), this._bodyHeight());
        if (this._activePage === 'media')
            this._renderMediaPage(body);
        else if (this._activePage === 'lyrics')
            this._renderLyricsPage(body);
        else if (this._activePage === 'focus')
            this._renderFocusPage(body);
        else if (this._activePage === 'tasks')
            this._renderTasksPage(body);
        else if (this._activePage === 'shelf')
            this._renderShelfPage(body);
        else if (this._activePage === 'clipboard')
            this._renderClipboardPage(body);
        else if (this._activePage === 'today')
            this._renderTodayPage(body);
        else
            this._renderInfoPage(body, this._activePage);
        this._pageBody = body;
        this._pageViewport.add_child(body);
        this._layoutPanel(this._content?.width || CONTENT_WIDTH);
        this._setEqualizerPlaying(
            this._mediaEqualizer,
            Boolean(this._expanded && ['media', 'lyrics'].includes(this._activePage) && this._isPlaying())
        );
        if (previous && previous !== body) {
            previous.remove_all_transitions();
            if (animate && !this._reducedMotion) {
                const distance = Math.min(30, Math.round(this._pageWidth() * 0.06));
                this._outgoingPageBodies.add(previous);
                previous.ease({
                    translation_x: -direction * distance,
                    opacity: 0,
                    duration: 240,
                    mode: Clutter.AnimationMode.EASE_IN_CUBIC,
                    onComplete: () => {
                        this._outgoingPageBodies.delete(previous);
                        if (previous.get_parent())
                            previous.destroy();
                    },
                });
                body.translation_x = direction * distance;
                body.opacity = 0;
                body.ease({
                    translation_x: 0,
                    opacity: 255,
                    duration: 280,
                    mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                });
            } else {
                previous.destroy();
                body.opacity = 255;
            }
        }
        this._positionIsland();
        this._updateMediaProgress();
        this._applyAccentStyles();
    }


    _renderMediaPage(body) {
        const player = this._getSelectedPlayer();
        if (!player) {
            place(body, makeLabel('Nothing playing right now', 'perdana-island__empty-media'), 0, 70, this._pageWidth(), 28);
            return;
        }

        const metadata = this._getMetadata(player.proxy);
        const artwork = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            clip_to_allocation: true,
            style_class: 'perdana-island__album-art',
        });
        const artworkIcon = new St.Icon({
            icon_name: 'audio-x-generic-symbolic',
            style_class: 'perdana-island__album-art-icon',
        });
        const art = this._localArtIcon(metadata.artUrl);
        if (art)
            artworkIcon.gicon = art;
        artwork.add_child(artworkIcon);
        this._loadArtwork(artwork, artworkIcon, metadata.artUrl, MEDIA_ART_SIZE, 14);
        place(body, artwork, 0, 16, MEDIA_ART_SIZE, MEDIA_ART_SIZE);

        const title = makeLabel(metadata.title || player.name.replace(MPRIS_PREFIX, ''), 'perdana-island__track-title');
        title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        const mediaCopyX = MEDIA_ART_SIZE + MEDIA_COPY_GAP;
        const mediaCopyWidth = Math.max(0, this._pageWidth() - mediaCopyX - MEDIA_COPY_RIGHT_INSET);
        place(body, title, mediaCopyX, 21, mediaCopyWidth, 24);
        const artist = makeLabel(metadata.artist || '', 'perdana-island__artist');
        artist.clutter_text.max_width = mediaCopyWidth;
        place(body, artist, mediaCopyX, 44, mediaCopyWidth, 20);
        const equalizer = this._makeEqualizer();
        equalizer.add_style_class_name('perdana-island__page-equalizer');
        equalizer.visible = this._isPlaying();
        this._mediaEqualizer = equalizer;
        place(body, equalizer, this._pageWidth() - 24, 36, 24, 18);

        this._mediaPositionLabel = makeLabel('0:00', 'perdana-island__track-time');
        this._mediaDurationLabel = makeLabel('0:00', 'perdana-island__track-time');
        place(body, this._mediaPositionLabel, 0, 84, 38, 18);
        place(body, this._mediaDurationLabel, this._pageWidth() - 38, 84, 38, 18);

        const progressWidth = this._pageWidth() - 96;
        this._createProgressControl(body, 48, 91, progressWidth);

        const playback = this._getProperty(player.proxy, 'PlaybackStatus') || 'Paused';
        const isPlaying = playback === 'Playing';
        const playbackMethod = isPlaying ? 'Pause' : 'Play';
        const center = Math.round(this._pageWidth() / 2);
        place(body, this._mediaButton(
            'media-skip-backward-symbolic',
            'Previous track',
            player.proxy,
            'Previous',
            this._canControl(player.proxy, 'CanGoPrevious')
        ), center - 51, 116, 32, 32);
        place(body, this._mediaButton(
            isPlaying ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic',
            playbackMethod,
            player.proxy,
            playbackMethod,
            this._canControl(player.proxy, isPlaying ? 'CanPause' : 'CanPlay'),
            true
        ), center - 18, 114, 36, 36);
        place(body, this._mediaButton(
            'media-skip-forward-symbolic',
            'Next track',
            player.proxy,
            'Next',
            this._canControl(player.proxy, 'CanGoNext')
        ), center + 18, 116, 32, 32);
    }

    _renderLyricsPage(body) {
        const player = this._getSelectedPlayer();
        const width = this._pageWidth();
        const bodyHeight = this._bodyHeight();
        if (!player) {
            place(body, makeLabel('Start playback to find lyrics', 'perdana-island__empty-media'),
                0, Math.round((bodyHeight - 24) / 2), width, 24);
            return;
        }

        const metadata = this._getMetadata(player.proxy);
        const leftWidth = Math.min(250, Math.max(210, Math.floor(width * 0.33)));
        const lyricsX = leftWidth + 24;
        const lyricsWidth = width - lyricsX;
        const artwork = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            clip_to_allocation: true,
            style_class: 'perdana-island__album-art perdana-island__lyrics-art',
        });
        const artworkIcon = new St.Icon({
            icon_name: 'audio-x-generic-symbolic',
            icon_size: 64,
            style_class: 'perdana-island__album-art-icon',
        });
        artwork.add_child(artworkIcon);
        const art = this._localArtIcon(metadata.artUrl);
        if (art)
            artworkIcon.gicon = art;
        this._loadArtwork(artwork, artworkIcon, metadata.artUrl, 64, 12);
        place(body, artwork, 0, 18, 64, 64);

        const title = makeLabel(metadata.title || player.name.replace(MPRIS_PREFIX, ''),
            'perdana-island__track-title perdana-island__lyrics-title');
        title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        place(body, title, 78, 28, leftWidth - 82, 23);
        const artist = makeLabel(metadata.artist || '', 'perdana-island__artist');
        artist.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        place(body, artist, 78, 52, leftWidth - 82, 18);

        const playback = this._getProperty(player.proxy, 'PlaybackStatus') || 'Paused';
        const isPlaying = playback === 'Playing';
        const center = Math.round(leftWidth / 2);
        const previousButton = this._mediaButton('media-skip-backward-symbolic', 'Previous track',
            player.proxy, 'Previous', this._canControl(player.proxy, 'CanGoPrevious'));
        previousButton.add_style_class_name('perdana-button--lyrics-transport');
        place(body, previousButton, center - 55, 103, 28, 28);
        this._lyricsPlaybackButton = makeIconButton(
            isPlaying ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic',
            isPlaying ? 'Pause' : 'Play',
            () => {
                const currentPlayer = this._getSelectedPlayer();
                if (!currentPlayer)
                    return;
                const currentlyPlaying = this._getProperty(currentPlayer.proxy, 'PlaybackStatus') === 'Playing';
                const capability = currentlyPlaying ? 'CanPause' : 'CanPlay';
                if (this._canControl(currentPlayer.proxy, capability))
                    this._callPlayer(currentPlayer.proxy, 'PlayPause');
            },
            'perdana-button--play perdana-button--lyrics-play'
        );
        this._lyricsPlaybackButton.reactive = this._canControl(
            player.proxy, isPlaying ? 'CanPause' : 'CanPlay');
        this._lyricsPlaybackButton.can_focus = this._lyricsPlaybackButton.reactive;
        place(body, this._lyricsPlaybackButton, center - 17, 100, 34, 34);
        const nextButton = this._mediaButton('media-skip-forward-symbolic', 'Next track',
            player.proxy, 'Next', this._canControl(player.proxy, 'CanGoNext'));
        nextButton.add_style_class_name('perdana-button--lyrics-transport');
        place(body, nextButton, center + 27, 103, 28, 28);
        this._lyricsRestingToggle = makeIconButton(
            'chat-message-new-symbolic',
            'Show synchronized lyrics in the resting island',
            () => this._setPreference('showRestingLyrics', !this._preferences?.showRestingLyrics),
            'perdana-button--lyrics-resting-toggle'
        );
        place(body, this._lyricsRestingToggle, center + 60, 100, 34, 34);
        this._updateLyricsRestingToggle();

        this._mediaPositionLabel = makeLabel('0:00', 'perdana-island__track-time');
        this._mediaDurationLabel = makeLabel('0:00', 'perdana-island__track-time');
        const progressY = bodyHeight - 24;
        place(body, this._mediaPositionLabel, 0, progressY, 38, 18);
        place(body, this._mediaDurationLabel, width - 38, progressY, 38, 18);
        this._createProgressControl(body, 48, progressY + 2, width - 96);

        const viewportHeight = bodyHeight - 58;
        this._lyricsViewport = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            clip_to_allocation: true,
            style_class: 'perdana-island__lyrics-viewport',
        });
        place(body, this._lyricsViewport, lyricsX, 8, lyricsWidth, viewportHeight);
        this._lyricsRail = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            style_class: 'perdana-island__lyrics-rail',
        });
        this._lyricsViewport.add_child(this._lyricsRail);
        this._lyricsWaitLabel = makeLabel('···', 'perdana-island__lyrics-wait');
        place(this._lyricsViewport, this._lyricsWaitLabel,
            0, Math.max(0, (viewportHeight - 22) / 2), lyricsWidth, 22);
        this._lyricsStatusLabel = makeLabel('', 'perdana-island__lyrics-empty');
        place(this._lyricsViewport, this._lyricsStatusLabel, 0, 0, lyricsWidth, viewportHeight);

        this._ensureLyrics(metadata, player.name);
        this._updateLyricsLines(this._positionForPlayer(player));
    }

    _updateLyricsPlaybackButton() {
        const player = this._getSelectedPlayer();
        if (!player || !this._lyricsPlaybackButton)
            return;
        const isPlaying = this._getProperty(player.proxy, 'PlaybackStatus') === 'Playing';
        this._lyricsPlaybackButton.set_child(new St.Icon({
            icon_name: isPlaying ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic',
            style_class: 'perdana-island__icon',
        }));
        this._lyricsPlaybackButton.accessible_name = isPlaying ? 'Pause' : 'Play';
        this._lyricsPlaybackButton.reactive = this._canControl(player.proxy, isPlaying ? 'CanPause' : 'CanPlay');
        this._lyricsPlaybackButton.can_focus = this._lyricsPlaybackButton.reactive;
    }

    _cleanLyricsMetadata(metadata, playerName) {
        const rawTitle = (metadata.title || '').trim();
        let title = rawTitle;
        let artist = (metadata.artist || '').trim();
        const isYouTube = /youtube/i.test(playerName || '') || /\byoutube(?: music)?\s*$/i.test(rawTitle);

        title = title
            .replace(/\s*[|–—-]\s*(?:youtube(?: music)?|official (?:music )?(?:audio|video)|lyrics? video)\s*$/i, '')
            .replace(/\s*\[(?:official (?:music )?(?:audio|video)|lyrics?|subtitles?|4k|hd|visuali[sz]er)[^\]]*\]\s*/gi, ' ')
            .replace(/\s*\((?:official (?:music )?(?:audio|video)|lyrics?|subtitles?|4k|hd|visuali[sz]er)[^)]*\)\s*/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const artistTitlePrefix = title.match(/^(.+?)\s+[–—-]\s+/);
        if (artist && artistTitlePrefix?.[1].toLowerCase() === artist.toLowerCase())
            title = title.slice(artistTitlePrefix[0].length).trim();

        if (isYouTube && !artist) {
            const parts = title.split(/\s+[–—-]\s+/);
            if (parts.length > 1) {
                artist = parts.pop().trim();
                title = parts.join(' - ').trim();
            }
        }

        return {title, artist};
    }

    _parseLyricsText(text, source) {
        const lines = [];
        let synced = false;
        for (const rawLine of String(text || '').split(/\r?\n/)) {
            const stamps = [...rawLine.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
            const lyricText = rawLine.replace(/\[[^\]]+\]/g, '').trim();
            if (stamps.length) {
                synced = true;
                for (const stamp of stamps) {
                    const fraction = stamp[3] || '';
                    const seconds = Number(stamp[1]) * 60 + Number(stamp[2])
                        + (fraction ? Number(`0.${fraction}`) : 0);
                    if (lyricText)
                        lines.push({time: seconds, text: lyricText});
                }
            } else if (lyricText) {
                lines.push({time: null, text: lyricText});
            }
        }
        if (synced) {
            const timedLines = lines.filter(line => line.time !== null);
            timedLines.sort((a, b) => a.time - b.time);
            return {lines: timedLines, synced: timedLines.length > 0, source};
        }
        return {lines, synced: false, source};
    }

    _ensureLyrics(metadata, playerName) {
        const track = this._cleanLyricsMetadata(metadata, playerName);
        if (!track.title) {
            this._lyricsCancellable?.cancel();
            this._lyricsCancellable = null;
            this._clearTimeout('_lyricsFallbackSource');
            this._clearTimeout('_lyricsRetrySource');
            this._lyricsCurrentTrackKey = null;
            this._lyricsRequestKey = null;
            this._lyricsData = null;
            this._lyricsRetryAt = 0;
            this._lyricsStatus = 'Track information is unavailable';
            return;
        }

        const key = [playerName, track.title, track.artist, metadata.album || '', metadata.length || 0]
            .join('\u0000').toLowerCase();
        if (key === this._lyricsCurrentTrackKey) {
            if (!this._lyricsRetryAt || Date.now() < this._lyricsRetryAt)
                return;
            this._clearTimeout('_lyricsRetrySource');
            this._lyricsRetryAt = 0;
        }

        this._lyricsCancellable?.cancel();
        this._lyricsCancellable = null;
        this._clearTimeout('_lyricsFallbackSource');
        this._clearTimeout('_lyricsRetrySource');
        this._lyricsCurrentTrackKey = key;
        this._lyricsRequestKey = null;
        this._lyricsData = null;
        this._lyricsDisplayedIndex = -1;
        this._lyricsRetryAt = 0;

        if (metadata.lyrics?.trim()) {
            const playerLyrics = this._parseLyricsText(metadata.lyrics, 'Player');
            if (playerLyrics.synced && playerLyrics.lines.length) {
                this._lyricsData = playerLyrics;
                this._lyricsStatus = '';
                return;
            }
        }

        if (this._lyricsCache.has(key)) {
            this._lyricsData = this._lyricsCache.get(key);
            this._lyricsStatus = this._lyricsData?.lines?.length
                ? ''
                : (this._lyricsData?.instrumental ? 'Instrumental track' : 'No lyrics found');
            return;
        }

        if (Date.now() < this._lyricsRetryAt) {
            this._lyricsStatus = 'Lyrics service is busy; try again shortly';
            return;
        }

        this._lyricsStatus = 'Finding lyrics…';
        this._lyricsRequestKey = key;
        this._lookupLyrics(track, metadata, key);
    }

    _scheduleLyricsRetry() {
        this._clearTimeout('_lyricsRetrySource');
        const delay = Math.max(1, this._lyricsRetryAt - Date.now());
        this._lyricsRetrySource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._lyricsRetrySource = 0;
            if (!this._enabled)
                return GLib.SOURCE_REMOVE;
            this._syncSelectedPlayerLyrics();
            return GLib.SOURCE_REMOVE;
        });
    }

    _syncSelectedPlayerLyrics() {
        const player = this._getSelectedPlayer();
        if (!player) {
            this._lyricsCancellable?.cancel();
            this._lyricsCancellable = null;
            this._clearTimeout('_lyricsFallbackSource');
            this._clearTimeout('_lyricsRetrySource');
            this._lyricsCurrentTrackKey = null;
            this._lyricsRequestKey = null;
            this._lyricsData = null;
            this._lyricsRetryAt = 0;
            this._lyricsStatus = 'Start playback to find lyrics';
            return;
        }
        this._ensureLyrics(this._getMetadata(player.proxy), player.name);
    }

    _lookupLyrics(track, metadata, key) {
        if (!this._lyricsSession)
            this._lyricsSession = new Soup.Session();
        this._lyricsSession.set_user_agent('Perdana Island/63 (https://github.com/txtperdana/perdana.island)');
        this._lyricsCancellable = new Gio.Cancellable();

        const params = {track_name: track.title};
        if (track.artist)
            params.artist_name = track.artist;
        if (metadata.album)
            params.album_name = metadata.album;
        const duration = Math.round((metadata.length || 0) / MICROSECONDS_PER_SECOND);
        if (duration > 0 && duration <= 3600)
            params.duration = String(duration);
        const encodeQuery = values => Object.entries(values)
            .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
            .join('&');
        const directUrl = `https://lrclib.net/api/get?${encodeQuery(params)}`;

        let plainFallback = null;
        const current = () => this._enabled && this._lyricsRequestKey === key;
        const complete = data => {
            if (!current())
                return;
            this._lyricsData = data;
            this._lyricsStatus = data?.lines?.length
                ? ''
                : (data?.instrumental ? 'Instrumental track' : 'No lyrics found');
            this._lyricsRetryAt = 0;
            this._clearTimeout('_lyricsRetrySource');
            this._lyricsCache.set(key, data);
            if (this._lyricsCache.size > 30)
                this._lyricsCache.delete(this._lyricsCache.keys().next().value);
            this._lyricsCancellable = null;
            this._lyricsRequestKey = key;
            if (this._expanded && this._activePage === 'lyrics') {
                const selected = this._getSelectedPlayer();
                this._updateLyricsLines(selected ? this._positionForPlayer(selected) : 0);
            }
            this._updateCollapsedLabel();
        };
        const failed = (message, status) => {
            if (!current())
                return;
            if (status === Soup.Status.TOO_MANY_REQUESTS) {
                const retryHeader = message?.get_response_headers()?.get_one('Retry-After');
                const retrySeconds = Number(retryHeader);
                const retryDate = retryHeader ? Date.parse(retryHeader) : NaN;
                const retryAfter = Number.isFinite(retrySeconds)
                    ? retrySeconds
                    : (Number.isFinite(retryDate) ? Math.ceil((retryDate - Date.now()) / 1000) : 10);
                this._lyricsBackoffUntil = Date.now() + Math.max(1, retryAfter) * 1000;
                this._lyricsRetryAt = this._lyricsBackoffUntil;
                this._lyricsStatus = 'Lyrics service is busy; try again shortly';
            } else {
                this._lyricsRetryAt = Date.now() + 30000;
                this._lyricsStatus = 'Could not load lyrics';
            }
            this._scheduleLyricsRetry();
            this._lyricsCancellable = null;
            this._lyricsRequestKey = null;
            const selected = this._getSelectedPlayer();
            if (this._expanded && this._activePage === 'lyrics')
                this._updateLyricsLines(selected ? this._positionForPlayer(selected) : 0);
        };
        const parseResult = json => {
            if (!json || typeof json !== 'object')
                return null;
            const synced = this._parseLyricsText(json.syncedLyrics || '', 'LRCLIB');
            if (synced.lines.length)
                return synced;
            const plain = this._parseLyricsText(json.plainLyrics || '', 'LRCLIB');
            if (plain.lines.length)
                return plain;
            return json.instrumental ? {lines: [], synced: false, source: 'LRCLIB', instrumental: true} : null;
        };
        const searchFallback = () => {
            if (!current())
                return;
            this._clearTimeout('_lyricsFallbackSource');
            this._lyricsFallbackSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 350, () => {
                this._lyricsFallbackSource = 0;
                if (!current())
                    return GLib.SOURCE_REMOVE;
                const search = {track_name: track.title};
                if (track.artist)
                    search.artist_name = track.artist;
                this._sendLyricsRequest(`https://lrclib.net/api/search?${encodeQuery(search)}`, key, (error, status, body, message) => {
                    if (!current())
                        return;
                    if (error || status < 200 || status >= 300) {
                        failed(message, status);
                        return;
                    }
                    let records;
                    try {
                        records = JSON.parse(body);
                    } catch (_error) {
                        failed(message, status);
                        return;
                    }
                    const normalizedTitle = track.title.toLowerCase();
                    const normalizedArtist = track.artist.toLowerCase();
                    const ranked = (Array.isArray(records) ? records : [])
                        .map(record => {
                            let score = 0;
                            const resultTitle = String(record.trackName || '').toLowerCase();
                            const resultArtist = String(record.artistName || '').toLowerCase();
                            if (resultTitle === normalizedTitle) score += 4;
                            else if (resultTitle.includes(normalizedTitle) || normalizedTitle.includes(resultTitle)) score += 2;
                            if (normalizedArtist && resultArtist === normalizedArtist) score += 4;
                            else if (normalizedArtist && resultArtist.includes(normalizedArtist)) score += 2;
                            if (metadata.album && String(record.albumName || '').toLowerCase() === metadata.album.toLowerCase()) score += 1;
                            return {record, score};
                        })
                        .sort((a, b) => b.score - a.score);
                    const matching = ranked.filter(item => item.score >= 2);
                    const candidates = matching.map(item => parseResult(item.record));
                    const result = candidates.find(candidate => candidate?.synced)
                        || candidates.find(Boolean);
                    complete(result || plainFallback || {lines: [], synced: false, source: 'LRCLIB'});
                });
                return GLib.SOURCE_REMOVE;
            });
        };

        if (!track.artist) {
            searchFallback();
            return;
        }
        this._sendLyricsRequest(directUrl, key, (error, status, body, message) => {
            if (!current())
                return;
            if (!error && status >= 200 && status < 300) {
                try {
                    const result = parseResult(JSON.parse(body));
                    if (result?.synced || result?.instrumental) {
                        complete(result);
                        return;
                    }
                    plainFallback = result;
                } catch (_error) {
                    // Try search below if the direct response is missing or malformed.
                }
            } else if (status === Soup.Status.TOO_MANY_REQUESTS) {
                failed(message, status);
                return;
            }
            searchFallback();
        });
    }

    _sendLyricsRequest(uri, key, callback) {
        if (!this._lyricsSession || !this._lyricsCancellable || this._lyricsRequestKey !== key)
            return;
        const now = Date.now();
        const spacingDelay = Math.max(0, 350 - (now - this._lyricsLastRequestAt));
        const backoffDelay = Math.max(0, this._lyricsBackoffUntil - now);
        const delay = Math.max(spacingDelay, backoffDelay);
        if (delay > 0) {
            this._lyricsFallbackSource && GLib.source_remove(this._lyricsFallbackSource);
            this._lyricsFallbackSource = 0;
            this._lyricsFallbackSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
                this._lyricsFallbackSource = 0;
                this._sendLyricsRequest(uri, key, callback);
                return GLib.SOURCE_REMOVE;
            });
            return;
        }
        const message = Soup.Message.new('GET', uri);
        if (!message) {
            callback(new Error('Invalid LRCLIB request'), 0, '', null);
            return;
        }
        this._lyricsLastRequestAt = now;
        this._lyricsSession.send_and_read_async(
            message,
            GLib.PRIORITY_DEFAULT,
            this._lyricsCancellable,
            (session, result) => {
                try {
                    const bytes = session.send_and_read_finish(result);
                    const body = new TextDecoder().decode(bytes.get_data());
                    callback(null, message.get_status(), body, message);
                } catch (error) {
                    callback(error, message.get_status(), '', message);
                }
            }
        );
    }

    _updateLyricsLines(position) {
        if (!this._lyricsStatusLabel || !this._lyricsRail || !this._lyricsViewport)
            return;
        const data = this._lyricsData;
        const lines = data?.lines || [];
        if (lines.length && !data.synced) {
            this._lyricsStatusLabel.text = 'Timed lyrics unavailable for this track';
            this._lyricsStatusLabel.visible = true;
            this._hideLyricsRail();
            return;
        }
        if (!lines.length) {
            this._lyricsStatusLabel.text = this._lyricsStatus || 'No lyrics found';
            this._lyricsStatusLabel.visible = true;
            this._hideLyricsRail();
            return;
        }

        this._lyricsStatusLabel.visible = false;
        const width = this._lyricsViewport.width;
        const viewportHeight = this._lyricsViewport.height || this._bodyHeight() - 16;
        const linesChanged = this._lyricsRenderedLines !== lines;

        if (linesChanged) {
            this._lyricsRail.remove_all_children();
            this._lyricsLineLabels = lines.map(line => {
                const label = makeLabel(line.text, 'perdana-island__lyrics-line perdana-island__lyrics-line--far');
                label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
                label.clutter_text.line_wrap = true;
                label.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
                label.opacity = 0;
                label.set_position(0, 0);
                label.set_size(width, 24);
                this._lyricsRail.add_child(label);
                return label;
            });
            this._lyricsRail.set_size(width, 0);
            this._lyricsRenderedLines = lines;
        }

        let activeIndex = 0;
        let displayGap = false;
        if (data.synced) {
            activeIndex = -1;
            for (let index = 0; index < lines.length; index++) {
                if (lines[index].time <= position)
                    activeIndex = index;
                else
                    break;
            }
            // LRC timestamps mark lyric starts, not when the current line ends.
            if (activeIndex < 0)
                displayGap = true;
        }
        const layoutChanged = linesChanged
            || width !== this._lyricsLayoutWidth
            || viewportHeight !== this._lyricsLayoutHeight;
        const changed = activeIndex !== this._lyricsDisplayedIndex
            || displayGap !== this._lyricsDisplayGap
            || layoutChanged;
        this._lyricsDisplayedIndex = activeIndex;
        this._lyricsDisplayGap = displayGap;
        if (!changed)
            return;

        this._lyricsRail.visible = activeIndex >= 0;
        this._lyricsWaitLabel.visible = displayGap;
        this._lyricsLayoutWidth = width;
        this._lyricsLayoutHeight = viewportHeight;
        const offsets = [];
        const heights = [];
        let railHeight = 0;
        for (let index = 0; index < this._lyricsLineLabels.length; index++) {
            const label = this._lyricsLineLabels[index];
            const distance = activeIndex < 0 ? Infinity : Math.abs(index - activeIndex);
            const style = distance === 0
                ? 'perdana-island__lyrics-line--current'
                : (distance === 1 ? 'perdana-island__lyrics-line--near' : 'perdana-island__lyrics-line--far');
            for (const candidate of [
                'perdana-island__lyrics-line--current',
                'perdana-island__lyrics-line--near',
                'perdana-island__lyrics-line--far',
            ]) {
                if (candidate !== style)
                    label.remove_style_class_name(candidate);
            }
            label.add_style_class_name(style);
            label.set_width(width);
            const [, naturalHeight] = label.get_preferred_height(width);
            const height = Math.max(24, Math.ceil(naturalHeight));
            offsets[index] = railHeight;
            heights[index] = height;
            label.set_position(0, railHeight);
            label.set_size(width, height);
            railHeight += height + 5;
        }
        if (this._lyricsLineLabels.length)
            railHeight -= 5;
        this._lyricsRail.set_size(width, railHeight);
        const targetY = activeIndex < 0
            ? (viewportHeight - 24) / 2
            : viewportHeight / 2 - offsets[activeIndex] - heights[activeIndex] / 2;
        const duration = this._reducedMotion ? 160 : 560;
        if (this._reducedMotion) {
            const rail = this._lyricsRail;
            rail.remove_all_transitions();
            rail.ease({
                opacity: 0,
                duration: 80,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                onComplete: () => {
                    if (this._lyricsRail !== rail)
                        return;
                    rail.translation_y = targetY;
                    rail.ease({
                        opacity: displayGap ? 112 : 255,
                        duration: 100,
                        mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                    });
                },
            });
        } else {
            this._lyricsRail.ease({
                translation_y: targetY,
                opacity: displayGap ? 112 : 255,
                duration,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            });
        }
        this._lyricsWaitLabel.ease({
            opacity: displayGap ? 220 : 0,
            duration: this._reducedMotion ? 160 : 260,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        });
        for (let index = 0; index < this._lyricsLineLabels.length; index++) {
            const label = this._lyricsLineLabels[index];
            const distance = activeIndex < 0 ? Infinity : Math.abs(index - activeIndex);
            label.ease({
                opacity: distance === 0 ? 255 : (distance === 1 ? 176 : 74),
                duration: this._reducedMotion ? 160 : 320,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            });
        }
    }

    _hideLyricsRail() {
        if (this._lyricsRail) {
            this._lyricsRail.visible = false;
            this._lyricsRail.remove_all_transitions();
            this._lyricsRail.opacity = 0;
            this._lyricsRail.translation_y = 0;
        }
        if (this._lyricsWaitLabel) {
            this._lyricsWaitLabel.visible = false;
            this._lyricsWaitLabel.remove_all_transitions();
            this._lyricsWaitLabel.opacity = 0;
        }
        for (const label of this._lyricsLineLabels) {
            label.remove_all_transitions();
            label.opacity = 0;
        }
        this._lyricsDisplayedIndex = -1;
        this._lyricsDisplayGap = false;
    }

    _createProgressControl(body, x, y, width) {
        this._progressTrack = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            reactive: true,
            track_hover: true,
            can_focus: true,
            style_class: 'perdana-island__progress-hitarea',
            accessible_name: 'Seek through track',
        });
        this._progressLine = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            style_class: 'perdana-island__progress-track',
        });
        this._progressFill = new St.Widget({style_class: 'perdana-island__progress-fill'});
        this._progressLine.add_child(this._progressFill);
        this._progressFill.set_position(0, 0);
        this._progressFill.set_size(1, 4);
        this._progressTrack.add_child(this._progressLine);
        this._progressLine.set_position(0, 5);
        this._progressLine.set_size(width, 4);
        this._progressTrack.connect('notify::allocation', () => {
            this._progressLine.set_size(this._progressTrack.width, 4);
            this._updateMediaProgress();
        });
        this._progressTrack.connect('button-press-event', (_actor, event) => {
            if (!this._progressCanSeek)
                return Clutter.EVENT_PROPAGATE;
            this._progressSeeking = true;
            this._progressSeekRatio = this._progressRatioFromEvent(event);
            this._updateMediaProgress();
            return Clutter.EVENT_STOP;
        });
        this._progressTrack.connect('motion-event', (_actor, event) => {
            if (!this._progressSeeking)
                return Clutter.EVENT_PROPAGATE;
            this._progressSeekRatio = this._progressRatioFromEvent(event);
            this._updateMediaProgress();
            return Clutter.EVENT_STOP;
        });
        this._progressTrack.connect('button-release-event', (_actor, event) => {
            if (!this._progressSeeking)
                return Clutter.EVENT_PROPAGATE;
            this._progressSeekRatio = this._progressRatioFromEvent(event);
            this._commitProgressSeek();
            return Clutter.EVENT_STOP;
        });
        place(body, this._progressTrack, x, y, width, 14);
    }

    _progressRatioFromEvent(event) {
        const [pointerX] = event.get_coords();
        const [trackX] = this._progressTrack.get_transformed_position();
        return Math.max(0, Math.min(1,
            (pointerX - trackX) / Math.max(1, this._progressTrack.width)));
    }

    _commitProgressSeek() {
        const ratio = this._progressSeekRatio;
        this._progressSeeking = false;
        const player = this._getSelectedPlayer();
        if (!player) {
            this._updateMediaProgress();
            return;
        }
        const metadata = this._getMetadata(player.proxy);
        if (!metadata.trackId || metadata.length <= 0) {
            this._updateMediaProgress();
            return;
        }
        const position = Math.round(metadata.length * ratio);
        const entry = this._players.get(player.name);
        if (entry) {
            entry.positionBase = position;
            entry.positionStamp = GLib.get_monotonic_time();
        }
        this._updateMediaProgress();
        player.proxy.call(
            'SetPosition',
            new GLib.Variant('(ox)', [metadata.trackId, position]),
            Gio.DBusCallFlags.NONE,
            3000,
            null,
            (proxy, result) => {
                try {
                    proxy.call_finish(result);
                } catch (_error) {
                    if (entry) {
                        entry.positionBase = Number(this._getProperty(player.proxy, 'Position')) || 0;
                        entry.positionStamp = GLib.get_monotonic_time();
                    }
                    this._updateMediaProgress();
                }
            }
        );
    }

    _renderEmptyMedia(body) {
        place(body, makeLabel('Nothing playing right now', 'perdana-island__empty-media'), 0, 70, this._pageWidth(), 28);
    }

    _mediaButton(iconName, accessibleName, proxy, method, enabled, primary = false) {
        const button = makeIconButton(
            iconName,
            accessibleName,
            () => this._callPlayer(proxy, method),
            primary ? 'perdana-button--play' : 'perdana-button--media'
        );
        button.reactive = enabled;
        button.can_focus = enabled;
        return button;
    }

    _canControl(proxy, capability) {
        return this._getProperty(proxy, capability) !== false
            && this._getProperty(proxy, 'CanControl') !== false;
    }

    _focusModeLabel(mode = this._focusMode) {
        switch (mode) {
        case 'short':
            return 'Short break';
        case 'long':
            return 'Long break';
        case 'custom':
            return 'Custom';
        default:
            return 'Focus';
        }
    }

    _renderFocusPage(body) {
        const controlsX = 184;
        const controlsWidth = this._pageWidth() - controlsX - 8;
        const dial = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            style_class: 'perdana-island__focus-dial',
        });
        this._focusRing = new St.DrawingArea({style_class: 'perdana-island__focus-ring'});
        this._focusRing.connect('repaint', area => this._paintFocusRing(area));
        this._focusRing.set_size(124, 124);
        dial.add_child(this._focusRing);

        const remaining = this._focusSource
            ? Math.max(0, Math.ceil(this._focusDeadline - GLib.get_monotonic_time() / MICROSECONDS_PER_SECOND))
            : this._focusRemaining;
        this._focusLabel = makeLabel(formatTime(remaining), 'perdana-island__timer');
        this._focusStatusLabel = makeLabel(
            remaining === 0 ? 'Complete' : this._focusModeLabel(),
            'perdana-island__timer-subtitle'
        );
        const timer = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'perdana-island__timer-block',
        });
        timer.add_child(this._focusLabel);
        timer.add_child(this._focusStatusLabel);
        dial.add_child(timer);
        place(body, dial, 22, 39, 124, 124);

        const modeOptions = [
            {label: 'Focus', duration: DEFAULT_FOCUS_SECONDS, mode: 'focus'},
            {label: 'Short', duration: DEFAULT_BREAK_SECONDS, mode: 'short'},
            {label: 'Long', duration: 15 * 60, mode: 'long'},
            {label: 'Custom', duration: this._focusCustomDuration, mode: 'custom'},
        ];
        const modeGap = 8;
        const modeWidth = (controlsWidth - modeGap * 3) / 4;
        modeOptions.forEach((option, index) => {
            const active = this._focusMode === option.mode;
            const button = makeTextButton(
                option.label,
                option.label + ' timer',
                () => this._setFocusDuration(option.duration, option.mode),
                'perdana-button--segment' + (active ? ' perdana-button--segment-active' : '')
            );
            place(body, button, controlsX + index * (modeWidth + modeGap), 18, modeWidth, 34);
        });

        this._focusCustomEntry = new St.Entry({
            hint_text: '30',
            can_focus: true,
            style_class: 'perdana-island__focus-custom-entry',
        });
        this._focusCustomEntry.set_text(this._focusCustomValue);
        this._focusCustomEntry.clutter_text.connect('text-changed', () => {
            this._focusCustomValue = this._focusCustomEntry.get_text();
        });
        this._focusCustomEntry.clutter_text.connect('key-focus-in', () => {
            this._focusCustomEditing = true;
        });
        this._focusCustomEntry.clutter_text.connect('key-focus-out', () => {
            this._focusCustomEditing = false;
        });
        this._focusCustomEntry.clutter_text.connect('activate', () => this._applyCustomFocusDuration());
        const entryWidth = Math.round(controlsWidth * 0.25);
        const unitWidth = Math.round(controlsWidth * 0.37);
        const applyWidth = controlsWidth - entryWidth - unitWidth - 20;
        place(body, this._focusCustomEntry, controlsX, 64, entryWidth, 34);
        const unitContents = new St.BoxLayout({style_class: 'perdana-island__focus-unit-content'});
        this._focusCustomUnitLabel = makeLabel(
            this._focusCustomUnit,
            'perdana-island__focus-unit-label'
        );
        this._focusCustomUnitLabel.x_expand = true;
        unitContents.add_child(this._focusCustomUnitLabel);
        unitContents.add_child(new St.Icon({
            icon_name: 'pan-down-symbolic',
            style_class: 'perdana-island__focus-unit-arrow',
        }));
        this._focusCustomUnitButton = new St.Button({
            child: unitContents,
            can_focus: true,
            reactive: true,
            track_hover: true,
            style_class: 'perdana-button perdana-button--focus-unit',
            accessible_name: 'Toggle duration between seconds and minutes',
        });
        this._focusCustomUnitButton.connect('clicked', () => {
            this._focusCustomUnit = this._focusCustomUnit === 'seconds' ? 'minutes' : 'seconds';
            this._focusCustomUnitLabel.text = this._focusCustomUnit;
        });
        place(body, this._focusCustomUnitButton, controlsX + entryWidth + 10, 64, unitWidth, 34);
        place(body, makeTextButton(
            'Apply',
            'Apply custom focus duration',
            () => this._applyCustomFocusDuration(),
            'perdana-button--focus-apply'
        ), controlsX + entryWidth + unitWidth + 20, 64, applyWidth, 34);

        this._focusToggleButton = makeActionButton(
            this._focusSource ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic',
            this._focusSource ? 'Pause' : this._focusWasStarted ? 'Resume' : 'Start',
            this._focusSource ? 'Pause focus session' : 'Start focus session',
            () => this._toggleFocus(),
            'perdana-action--primary'
        );
        const actionGap = 10;
        const actionWidth = (controlsWidth - 2 * actionGap) / 3;
        place(body, this._focusToggleButton, controlsX, 112, actionWidth, 36);
        place(body, makeActionButton(
            'view-refresh-symbolic',
            'Reset',
            'Reset timer',
            () => this._resetFocus(),
            'perdana-action--neutral'
        ), controlsX + actionWidth + actionGap, 112, actionWidth, 36);
        place(body, makeActionButton(
            'media-skip-forward-symbolic',
            'Skip',
            'Skip to the next timer phase',
            () => this._setFocusDuration(
                this._focusMode === 'focus' || this._focusMode === 'custom'
                    ? DEFAULT_BREAK_SECONDS
                    : DEFAULT_FOCUS_SECONDS,
                this._focusMode === 'focus' || this._focusMode === 'custom' ? 'short' : 'focus'
            ),
            'perdana-action--neutral'
        ), controlsX + 2 * (actionWidth + actionGap), 112, actionWidth, 36);
        this._focusSessionsLabel = makeLabel(
            this._focusSessionsToday + ' focus sessions today',
            'perdana-island__focus-stats-label'
        );
        place(body, this._focusSessionsLabel, controlsX, 166, controlsWidth, 20);
        this._focusRing.queue_repaint();
    }

    _renderTasksPage(body) {
        const done = this._tasks.filter(task => task.done).length;
        const open = this._tasks.filter(task => !task.done);
        const completed = this._tasks.filter(task => task.done);
        const ordered = [...open, ...completed];
        const rightX = 190;
        const rightWidth = this._pageWidth() - rightX;
        place(body, makeLabel('To-do', 'perdana-island__todo-heading'), 0, 8, 160, 22);
        place(body, makeLabel(done + '/' + this._tasks.length, 'perdana-island__todo-count'), 0, 34, 160, 48);
        place(body, makeLabel('Task done today', 'perdana-island__todo-subtitle'), 2, 82, 170, 20);

        if (this._taskAdding) {
            const entry = new St.Entry({
                hint_text: 'Add a task',
                can_focus: true,
                style_class: 'perdana-island__task-entry',
            });
            entry.clutter_text.connect('activate', () => {
                const text = entry.get_text();
                this._taskAdding = false;
                if (text.trim())
                    this._addTask(text);
                else
                    this._renderPanel();
            });
            place(body, entry, 0, 116, 178, 30);
            this._taskFocusSource = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                this._taskFocusSource = 0;
                if (entry.get_stage())
                    entry.grab_key_focus();
                return GLib.SOURCE_REMOVE;
            });
        } else {
            const actions = new St.BoxLayout({style_class: 'perdana-island__todo-actions'});
            actions.add_child(makeActionButton(
                'list-add-symbolic', 'Add task', 'Add a task', () => {
                    this._taskAdding = true;
                    this._renderPanel();
                }, 'perdana-action--todo'
            ));
            actions.add_child(makeActionButton(
                this._taskEditing ? 'object-select-symbolic' : 'document-edit-symbolic',
                this._taskEditing ? 'Done' : 'Edit',
                this._taskEditing ? 'Finish editing tasks' : 'Edit tasks',
                () => {
                    this._taskEditing = !this._taskEditing;
                    this._renderPanel();
                },
                'perdana-action--todo'
            ));
            place(body, actions, 0, 119, 180, 30);
        }

        if (!ordered.length) {
            place(body, makeLabel('Your list is clear', 'perdana-island__muted'), rightX, 16, rightWidth, 20);
            return;
        }

        const rowHeight = 36;
        const rowGap = 7;
        const listHeight = ordered.length * (rowHeight + rowGap) - rowGap;
        const listWidth = Math.max(1, rightWidth - 16);
        const scroll = new St.ScrollView({
            overlay_scrollbars: false,
            style_class: 'perdana-island__task-scroll',
        });
        scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        const list = new St.BoxLayout({
            vertical: true,
            style_class: 'perdana-island__task-list',
        });
        list.set_size(listWidth, listHeight);
        ordered.forEach(task => {
            const row = new St.BoxLayout({style_class: task.done
                ? 'perdana-island__task-row perdana-island__task-row--done'
                : 'perdana-island__task-row'});
            row.set_size(listWidth, rowHeight);
            const marker = new St.Bin({
                child: task.done
                    ? new St.Icon({icon_name: 'object-select-symbolic', style_class: 'perdana-island__task-check'})
                    : null,
                style_class: task.done
                    ? 'perdana-island__task-marker perdana-island__task-marker--done'
                    : 'perdana-island__task-marker',
            });
            const checkbox = new St.Button({
                child: marker,
                can_focus: true,
                reactive: true,
                track_hover: true,
                style_class: 'perdana-button perdana-island__task-check-button',
                accessible_name: task.done ? 'Uncheck ' + task.text : 'Complete ' + task.text,
            });
            checkbox.connect('clicked', () => this._toggleTask(task.id));
            row.add_child(checkbox);
            const label = makeLabel(
                task.text,
                task.done ? 'perdana-island__task-text perdana-island__task-text--done' : 'perdana-island__task-text'
            );
            label.clutter_text.max_width = listWidth - (this._taskEditing ? 84 : 56);
            label.x_expand = true;
            row.add_child(label);
            if (this._taskEditing)
                row.add_child(makeIconButton('user-trash-symbolic', 'Delete ' + task.text, () => this._removeTask(task.id), 'perdana-button--task-delete'));
            list.add_child(row);
        });
        scroll.add_child(list);
        place(body, scroll, rightX, 4, rightWidth, this._bodyHeight() - 8);
    }

    _renderInfoPage(body, key) {
        if (key === 'shelf')
            this._renderShelfPage(body);
        else if (key === 'clipboard')
            this._renderClipboardPage(body);
        else if (key === 'today')
            this._renderTodayPage(body);
        else if (key === 'notifications')
            this._renderNotificationsPage(body);
        else if (key === 'settings')
            this._renderSettingsPage(body);
    }

    _makeProgressRing(size, progress, color) {
        const ring = new St.DrawingArea({style_class: 'perdana-island__progress-ring'});
        ring._perdanaProgress = progress;
        ring._perdanaColor = color;
        ring.connect('repaint', area => this._paintSmallRing(area, ring._perdanaProgress, ring._perdanaColor));
        ring.set_size(size, size);
        return ring;
    }

    _paintSmallRing(area, progress, color) {
        const [width, height] = area.get_surface_size();
        if (width <= 0 || height <= 0)
            return;
        const cr = area.get_context();
        const scale = width / Math.max(1, area.width);
        const lineWidth = Math.max(2, area.width * 0.09 * scale);
        const radius = Math.min(width, height) / 2 - lineWidth / 2 - scale;
        const cx = width / 2;
        const cy = height / 2;
        cr.setLineWidth(lineWidth);
        cr.setLineCap(1);
        cr.setSourceRGBA(1, 1, 1, 0.14);
        cr.arc(cx, cy, radius, 0, Math.PI * 2);
        cr.stroke();
        if (progress > 0) {
            cr.setSourceRGBA(color[0], color[1], color[2], 1);
            cr.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, progress));
            cr.stroke();
        }
        cr.$dispose();
    }

    _renderShelfPage(body) {
        const cardWidth = this._pageWidth();
        const cardHeight = this._bodyHeight() - 8;
        const card = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            style_class: 'perdana-island__shelf-card',
        });
        const view = this._preferences.shelfView;
        const titleText = this._shelfItems.length > MAX_SHELF_ITEMS
            ? `${MAX_SHELF_ITEMS} of ${this._shelfItems.length} files`
            : `${this._shelfItems.length} ${this._shelfItems.length === 1 ? 'file' : 'files'}`;
        const compactControls = cardWidth < 480;
        const shelfTitle = makeLabel(
            this._shelfNotice || (this._shelfItems.length ? titleText : 'Shelf'),
            'perdana-island__shelf-title'
        );
        const addWidth = compactControls ? 72 : 86;
        const folderWidth = 30;
        const viewWidth = compactControls ? 84 : 140;
        const buttonGap = 6;
        const addX = cardWidth - 10 - addWidth;
        const folderX = addX - buttonGap - folderWidth;
        const viewX = folderX - buttonGap - viewWidth;
        const titleWidth = Math.max(0, Math.min(130, viewX - 18));
        place(card, shelfTitle, 12, 12, titleWidth, 22);

        const viewGroup = new St.BoxLayout({
            style_class: 'perdana-island__shelf-view-toggle',
            y_align: Clutter.ActorAlign.CENTER,
        });
        for (const [key, label, iconName, width] of [
            ['grid', 'Grid', 'view-grid-symbolic', compactControls ? 38 : 68],
            ['list', 'List', 'view-list-symbolic', compactControls ? 38 : 64],
        ]) {
            const contents = new St.BoxLayout({
                style_class: 'perdana-island__shelf-view-content',
                y_align: Clutter.ActorAlign.CENTER,
            });
            contents.add_child(new St.Icon({
                icon_name: iconName,
                style_class: 'perdana-island__shelf-view-icon',
            }));
            const viewLabel = makeLabel(label, 'perdana-island__shelf-view-label');
            viewLabel.visible = !compactControls;
            contents.add_child(viewLabel);
            const selected = view === key;
            const button = new St.Button({
                child: contents,
                can_focus: true,
                reactive: true,
                track_hover: true,
                style_class: `perdana-button perdana-button--segment${selected ? ' perdana-button--segment-active' : ''}`,
                accessible_name: `${label} view${selected ? ', selected' : ''}`,
            });
            button.set_size(width, 28);
            button.connect('clicked', () => this._setPreference('shelfView', key));
            viewGroup.add_child(button);
        }
        place(card, viewGroup, viewX, 8, viewWidth, 30);

        const folderButton = makeIconButton(
            'folder-open-symbolic',
            'Open Shelf folder',
            () => this._openShelfDirectory(),
            'perdana-button--shelf-folder'
        );
        place(card, folderButton, folderX, 8, folderWidth, 30);

        const atLimit = this._shelfItems.length >= MAX_SHELF_ITEMS;
        const addButton = makeTextButton(
            compactControls ? 'Add' : 'Add files',
            atLimit ? 'Shelf limit reached, 10 files maximum' : 'Add files to Shelf',
            () => this._chooseShelfFiles(),
            'perdana-button--segment'
        );
        addButton.reactive = !atLimit;
        addButton.can_focus = !atLimit;
        addButton.opacity = atLimit ? 150 : 255;
        place(card, addButton, addX, 8, addWidth, 30);

        const visibleFiles = this._shelfItems.slice(0, MAX_SHELF_ITEMS);
        if (!visibleFiles.length) {
            place(card, makeLabel(
                'Open the Shelf folder, then add files here',
                'perdana-island__muted'
            ), 12, 56, cardWidth - 24, 24);
        } else {
            const scroll = new St.ScrollView({
                overlay_scrollbars: true,
                style_class: 'perdana-island__shelf-scroll',
            });
            scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
            const content = new St.BoxLayout({
                vertical: true,
                style_class: `perdana-island__shelf-content--${view}`,
            });
            const itemHeight = view === 'grid' ? 96 : 34;
            const innerWidth = cardWidth - 34;
            if (view === 'grid') {
                const columns = 3;
                const columnGap = 8;
                const cellWidth = Math.floor((innerWidth - columnGap * (columns - 1)) / columns);
                for (let start = 0; start < visibleFiles.length; start += columns) {
                    const row = new St.BoxLayout({
                        style_class: 'perdana-island__shelf-grid-row',
                    });
                    row.set_size(innerWidth, itemHeight);
                    visibleFiles.slice(start, start + columns).forEach(file => {
                        row.add_child(this._createShelfFileButton(file, view, cellWidth, itemHeight));
                    });
                    content.add_child(row);
                }
                content.set_size(innerWidth,
                    Math.ceil(visibleFiles.length / columns) * itemHeight
                    + (Math.ceil(visibleFiles.length / columns) - 1) * 8);
            } else {
                visibleFiles.forEach(file => {
                    content.add_child(this._createShelfFileButton(file, view, innerWidth, itemHeight));
                });
                content.set_size(innerWidth, visibleFiles.length * itemHeight + (visibleFiles.length - 1) * 4);
            }
            scroll.add_child(content);
            place(card, scroll, 8, 46, cardWidth - 16, cardHeight - 54);
        }
        place(body, card, 0, 4, cardWidth, cardHeight);
    }

    _createShelfFileButton(item, view, width, height) {
        const contentType = item.contentType || 'application/octet-stream';
        const fileIcon = new St.Icon({
            gicon: Gio.content_type_get_icon(contentType),
            icon_size: 18,
            style_class: 'perdana-island__shelf-file-icon',
        });
        const button = new St.Button({
            can_focus: true,
            reactive: true,
            track_hover: true,
            style_class: `perdana-button perdana-island__shelf-file perdana-island__shelf-file--${view}`,
            accessible_name: `Open ${item.name}`,
        });
        button.set_size(width, height);
        if (view === 'grid') {
            const tile = new St.Widget({
                layout_manager: new Clutter.FixedLayout(),
                style_class: 'perdana-island__shelf-grid-tile',
            });
            const preview = new St.Widget({
                layout_manager: new Clutter.BinLayout(),
                clip_to_allocation: true,
                style_class: 'perdana-island__shelf-thumbnail',
            });
            preview.add_child(fileIcon);
            if (contentType.startsWith('image/')) {
                try {
                    const themeContext = St.ThemeContext.get_for_stage(global.stage);
                    const previewHeight = 62;
                    const texture = St.TextureCache.get_default().load_file_async(
                        Gio.File.new_for_path(item.path),
                        -1,
                        previewHeight,
                        themeContext.scale_factor,
                        preview.get_resource_scale()
                    );
                    texture.content_gravity = Clutter.ContentGravity.RESIZE_ASPECT;
                    texture.x_align = Clutter.ActorAlign.CENTER;
                    texture.y_align = Clutter.ActorAlign.CENTER;
                    texture.x_expand = false;
                    texture.y_expand = false;
                    preview.add_child(texture);
                } catch (error) {
                    logError(error, `Perdana Island could not preview ${item.name}`);
                }
            }
            const label = makeLabel(item.name, 'perdana-island__shelf-file-name');
            label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            place(tile, preview, 7, 6, width - 14, 62);
            place(tile, label, 7, 72, width - 14, 18);
            button.set_child(tile);
        } else {
            const row = new St.BoxLayout({
                style_class: 'perdana-island__shelf-list-row',
                y_align: Clutter.ActorAlign.CENTER,
            });
            row.add_child(fileIcon);
            const label = makeLabel(item.name, 'perdana-island__shelf-file-name');
            label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            label.x_expand = true;
            row.add_child(label);
            button.set_child(row);
        }
        button.connect('clicked', () => this._openShelfFile(item));
        return button;
    }

    _renderClipboardPage(body) {
        place(body, makeLabel('Clipboard', 'perdana-island__todo-heading'), 0, 5, 240, 22);
        const hint = this._clipboardNotice || 'Email/link masked';
        const hintStyle = this._clipboardNotice
            ? 'perdana-island__clipboard-notice'
            : 'perdana-island__muted';
        place(body, makeLabel(hint, hintStyle), 244, 7, this._pageWidth() - 244, 20);
        if (!this._clipboardItems.length) {
            place(body, makeLabel('Copy text while this page is open', 'perdana-island__empty-media'), 0, 66, this._pageWidth(), 24);
            return;
        }
        this._clipboardItems.slice(0, 4).forEach((item, index) => {
            const preview = maskClipboardPreview(item);
            const hasMaskedValue = preview !== item;
            const row = new St.BoxLayout({style_class: 'perdana-island__clip-row'});
            const contents = new St.BoxLayout({style_class: 'perdana-island__clip-contents'});
            contents.add_child(new St.Icon({icon_name: 'edit-copy-symbolic', style_class: 'perdana-island__icon'}));
            const label = makeLabel(preview, 'perdana-island__clip-text');
            label.clutter_text.max_width = Math.max(0, this._pageWidth() - 90);
            label.x_expand = true;
            contents.add_child(label);
            contents.x_expand = true;
            const button = new St.Button({
                child: contents,
                can_focus: true,
                reactive: true,
                track_hover: true,
                style_class: 'perdana-button perdana-island__clip-item',
                accessible_name: hasMaskedValue
                    ? 'Copy masked email or link again'
                    : 'Copy text again',
            });
            button.x_expand = true;
            button.connect('clicked', () => {
                St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, item);
            });
            row.add_child(button);
            row.add_child(makeIconButton(
                'user-trash-symbolic',
                'Delete clipboard item',
                () => this._deleteClipboardItem(item),
                'perdana-island__clip-delete'
            ));
            place(body, row, 0, 30 + index * 34, this._pageWidth(), 32);
        });
    }

    _renderTodayPage(body) {
        const now = new Date();
        const month = new Date(now.getFullYear(), now.getMonth() + this._calendarMonthOffset, 1);
        this._calendarDateKey = now.toDateString();
        const pageWidth = this._pageWidth();
        const scale = Math.min(1, pageWidth / 884);
        const dateWidth = Math.round(130 * scale);
        const calendarX = Math.round(146 * scale);
        const calendarWidth = Math.round(220 * scale);
        const tileX = Math.round(382 * scale);
        const monthName = new Intl.DateTimeFormat('en-US', {month: 'long', year: 'numeric'}).format(month);
        const todayMonth = new Intl.DateTimeFormat('en-US', {month: 'long', year: 'numeric'}).format(now);
        const weekday = new Intl.DateTimeFormat('en-US', {weekday: 'long'}).format(now).toUpperCase();
        place(body, makeLabel(weekday, 'perdana-island__today-weekday'), 0, 14, dateWidth, 18);
        place(body, makeLabel(String(now.getDate()), 'perdana-island__today-day'), 0, 35, dateWidth, 70);
        place(body, makeLabel(todayMonth, 'perdana-island__today-month'), 0, 111, dateWidth, 23);
        place(body, makeLabel(`Week ${isoWeekNumber(now)}`, 'perdana-island__today-week'), 0, 137, dateWidth, 18);
        const monthLabel = makeLabel(monthName, 'perdana-island__calendar-month');
        place(body, monthLabel, calendarX, 2, calendarWidth - 55, 22);
        place(body, makeIconButton('go-previous-symbolic', 'Previous month', () => {
            this._calendarMonthOffset--;
            this._renderPanel();
        }, 'perdana-island__calendar-arrow'), calendarX + calendarWidth - 48, 1, 22, 22);
        place(body, makeIconButton('go-next-symbolic', 'Next month', () => {
            this._calendarMonthOffset++;
            this._renderPanel();
        }, 'perdana-island__calendar-arrow'), calendarX + calendarWidth - 23, 1, 22, 22);

        const dayWidth = calendarWidth / 7;
        const weekdayNames = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
        weekdayNames.forEach((weekday, index) =>
            place(body, makeLabel(weekday, 'perdana-island__calendar-weekday'), calendarX + index * dayWidth, 29, dayWidth, 14));
        const firstDay = (month.getDay() + 6) % 7;
        const dayCount = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
        for (let day = 1; day <= dayCount; day++) {
            const cell = firstDay + day - 1;
            const column = cell % 7;
            const row = Math.floor(cell / 7);
            const isToday = this._calendarMonthOffset === 0 && day === now.getDate();
            const dayLabel = makeLabel(
                String(day),
                isToday ? 'perdana-island__calendar-day perdana-island__calendar-day--today'
                    : 'perdana-island__calendar-day'
            );
            dayLabel.clutter_text.x_align = Clutter.ActorAlign.CENTER;
            place(body, dayLabel, calendarX + column * dayWidth, 46 + row * 17, dayWidth, 17);
        }

        const gap = 7;
        const tileWidth = (pageWidth - tileX - gap) / 2;
        const tileHeight = 70;
        this._todayTiles = [];
        const metrics = [
            {key: 'cpu', title: 'Processor', color: [1, 0.624, 0.263]},
            {key: 'memory', title: 'Memory', color: [0.46, 0.7, 1]},
            {key: 'disk', title: 'Disk free', color: [0.76, 0.65, 1]},
            {key: 'battery', title: 'Battery', color: [0.25, 0.84, 0.57]},
        ];
        metrics.forEach((metric, index) => {
            const column = index % 2;
            const row = Math.floor(index / 2);
            const x = tileX + column * (tileWidth + gap);
            const y = 7 + row * (tileHeight + 6);
            const tile = new St.Widget({
                layout_manager: new Clutter.FixedLayout(),
                style_class: 'perdana-island__today-tile',
            });
            const ring = this._makeProgressRing(34, 0, metric.color);
            const value = makeLabel('—', 'perdana-island__today-value');
            const title = makeLabel(metric.title, 'perdana-island__today-title');
            const detail = makeLabel('', 'perdana-island__today-detail');
            place(tile, ring, 8, 17, 34, 34);
            place(tile, title, 47, 9, tileWidth - 51, 16);
            place(tile, value, 47, 25, tileWidth - 51, 22);
            place(tile, detail, 47, 48, tileWidth - 51, 16);
            this._todayTiles.push({key: metric.key, ring, value, detail});
            place(body, tile, x, y, tileWidth, tileHeight);
        });
        this._updateTodayMetrics();
    }

    _renderNotificationsPage(body) {
        const contentWidth = this._pageWidth();
        const cardWidth = contentWidth - 18;
        place(body, makeLabel('Notifications', 'perdana-island__todo-heading'), 0, 3, 220, 22);
        const clearButton = makeTextButton('Clear', 'Clear notifications', () => this._clearNotifications(),
            'perdana-island__notification-clear');
        clearButton.reactive = this._notificationItems.length > 0;
        clearButton.opacity = this._notificationItems.length > 0 ? 255 : 110;
        place(body, clearButton, contentWidth - 58, 0, 58, 26);

        if (!this._notificationItems.length) {
            place(body, makeLabel('No notifications yet', 'perdana-island__empty-media'), 0, 66, contentWidth, 24);
            return;
        }
        const list = new St.BoxLayout({
            vertical: true,
            style_class: 'perdana-island__notification-list',
        });
        list.set_size(cardWidth, this._notificationItems.length * 41 - 3);
        this._notificationItems.forEach(item => {
            const card = new St.Widget({
                layout_manager: new Clutter.FixedLayout(),
                style_class: 'perdana-island__notification-card',
            });
            const title = makeLabel(item.title, 'perdana-island__notification-title');
            const app = makeLabel(item.app, 'perdana-island__notification-app');
            app.clutter_text.x_align = Clutter.ActorAlign.END;
            const bodyText = makeLabel(item.body || item.title, 'perdana-island__notification-body');
            place(card, title, 10, 3, cardWidth - 126, 15);
            place(card, app, cardWidth - 110, 3, 100, 15);
            place(card, bodyText, 10, 18, cardWidth - 20, 15);
            const button = new St.Button({
                child: card,
                can_focus: true,
                reactive: true,
                track_hover: true,
                style_class: 'perdana-button perdana-island__notification-button',
                accessible_name: `Open ${item.app}: ${item.title}`,
            });
            button.connect('clicked', () => {
                try {
                    item.notification.activate();
                } catch (error) {
                    logError(error, 'Perdana Island could not activate a notification');
                    try {
                        item.source.open();
                    } catch (_error) {
                        // The source may have disappeared after its notification was listed.
                    }
                }
                this._pinned = false;
                this._setExpanded(false);
            });
            button.set_size(cardWidth, 38);
            list.add_child(button);
        });
        const scroll = new St.ScrollView({
            overlay_scrollbars: true,
            style_class: 'perdana-island__notification-scroll',
        });
        scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        scroll.add_child(list);
        place(body, scroll, 0, 31, contentWidth, this._bodyHeight() - 31);
    }

    _renderSettingsPage(body) {
        const columnGap = 12;
        const settingsWidth = Math.max(0, this._pageWidth() - 16);
        const halfWidth = (settingsWidth - columnGap) / 2;
        const scroll = new St.ScrollView({
            overlay_scrollbars: false,
            style_class: 'perdana-island__settings-scroll',
        });
        scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        const scrollContent = new St.BoxLayout({
            vertical: true,
            style_class: 'perdana-island__settings-scroll-content',
        });
        scrollContent.set_size(settingsWidth, 360);
        const content = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            style_class: 'perdana-island__settings-content',
        });
        content.set_size(settingsWidth, 360);
        scrollContent.add_child(content);
        scroll.set_child(scrollContent);
        place(body, scroll, 0, 0, this._pageWidth(), this._bodyHeight());
        const heading = (label, y) => {
            const text = makeLabel(label, 'perdana-island__settings-heading-label');
            text.x_expand = true;
            text.x_align = Clutter.ActorAlign.FILL;
            text.clutter_text.line_alignment = Pango.Alignment.RIGHT;
            place(content, text, 0, y, Math.max(0, settingsWidth - 12), 18);
        };
        const settingButton = (label, selected, x, y, width, callback, iconName) => {
            const contents = new St.BoxLayout({
                style_class: 'perdana-island__setting-option-content',
                y_align: Clutter.ActorAlign.CENTER,
                x_expand: true,
                x_align: Clutter.ActorAlign.FILL,
            });
            contents.add_child(new St.Icon({
                icon_name: iconName,
                style_class: 'perdana-island__setting-option-icon',
            }));
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
            button.connect('clicked', callback);
            place(content, button, x, y, width, 30);
        };

        const shortcutWidth = Math.min(140, Math.max(96, settingsWidth * 0.36));
        const shortcutX = settingsWidth - shortcutWidth;
        place(content, makeLabel('Settings', 'perdana-island__settings-title-label'),
            0, 3, Math.max(72, shortcutX - 8), 22);
        place(content, makeLabel('Ctrl+Alt+X hide/show', 'perdana-island__settings-shortcut'),
            shortcutX, 5, shortcutWidth, 18);

        heading('Resting island', 28);
        settingButton('Clock on hover', this._preferences.restingStyle === 'hover-clock', 0, 49, halfWidth,
            () => this._setPreference('restingStyle', 'hover-clock'), 'alarm-symbolic');
        settingButton('Eyes + clock', this._preferences.restingStyle === 'eyes-clock', halfWidth + columnGap, 49, halfWidth,
            () => this._setPreference('restingStyle', 'eyes-clock'), 'preferences-system-symbolic');

        heading('Appearance & notices', 84);
        settingButton(this._preferences.glass ? 'Glass on' : 'Glass off', this._preferences.glass, 0, 105, halfWidth,
            () => this._setPreference('glass', !this._preferences.glass), 'preferences-desktop-appearance-symbolic');
        settingButton(this._preferences.systemNotices ? 'Notices on' : 'Notices off', this._preferences.systemNotices, halfWidth + columnGap, 105, halfWidth,
            () => this._setPreference('systemNotices', !this._preferences.systemNotices), 'preferences-system-notifications-symbolic');

        heading('Accent color', 143);
        const palette = [
            ['Navy', '#5577B8'], ['Ocean', '#35A7C8'], ['Blue', '#4C83E2'],
            ['Plum', '#A579D4'], ['Forest', '#43A778'], ['Bronze', '#D89651'], ['Slate', '#98A6B8'],
        ];
        palette.forEach(([name, color], index) => {
            const selected = this._preferences.accentColor === color;
            const swatch = new St.Button({
                child: selected ? new St.Icon({icon_name: 'object-select-symbolic'}) : null,
                can_focus: true,
                reactive: true,
                track_hover: true,
                style_class: 'perdana-button perdana-island__color-swatch',
                accessible_name: `${name} ${color}`,
            });
            swatch.set_style(`background-color: ${color}; border: 2px solid ${selected ? '#ffffff' : 'rgba(255,255,255,0.18)'}; border-radius: 10px; padding: 0;`);
            swatch.connect('clicked', () => this._setPreference('accentColor', color));
            place(content, swatch, index * 42, 165, 34, 32);
        });

        const colorEntry = new St.Entry({
            hint_text: DEFAULT_ACCENT_COLOR,
            can_focus: true,
            style_class: 'perdana-island__color-entry',
        });
        colorEntry.set_text(this._preferences.accentColor);
        colorEntry.clutter_text.connect('text-changed', () =>
            colorEntry.remove_style_class_name('perdana-island__color-entry--invalid'));
        colorEntry.clutter_text.connect('activate', () => {
            const color = normalizeHexColor(colorEntry.get_text());
            if (color)
                this._setPreference('accentColor', color);
            else
                colorEntry.add_style_class_name('perdana-island__color-entry--invalid');
        });
        place(content, colorEntry, 0, 203, 132, 32);
        place(content, makeTextButton('Apply', 'Apply accent color', () => {
            const color = normalizeHexColor(colorEntry.get_text());
            if (color)
                this._setPreference('accentColor', color);
            else
                colorEntry.add_style_class_name('perdana-island__color-entry--invalid');
        }, 'perdana-island__color-apply'), 142, 203, 82, 32);

        heading('Visible tabs', 243);
        const pages = PAGES.filter(page => page.key !== 'settings');
        const gap = 8;
        const itemWidth = (settingsWidth - gap * 3) / 4;
        pages.forEach((page, index) => {
            const row = Math.floor(index / 4);
            const column = index % 4;
            const label = page.key === 'notifications' ? 'Alerts' : page.label;
            settingButton(label, this._preferences.visiblePages[page.key] !== false,
                column * (itemWidth + gap), 265 + row * 34, itemWidth, () =>
                    this._setPageVisible(page.key, this._preferences.visiblePages[page.key] === false), page.icon);
        });
    }

    _paintFocusRing(area) {
        const [width, height] = area.get_surface_size();
        const cr = area.get_context();
        const radius = Math.min(width, height) / 2 - 5;
        const cx = width / 2;
        const cy = height / 2;
        const remaining = this._focusSource
            ? Math.max(0, this._focusDeadline - GLib.get_monotonic_time() / MICROSECONDS_PER_SECOND)
            : this._focusRemaining;
        const duration = Math.max(1, this._focusDuration || DEFAULT_FOCUS_SECONDS);
        const progress = Math.max(0, Math.min(1, 1 - remaining / duration));
        const color = hexColorToRgb(this._preferences?.accentColor);
        cr.setLineWidth(7);
        cr.setLineCap(1);
        cr.setSourceRGBA(1, 1, 1, 0.14);
        cr.arc(cx, cy, radius, 0, Math.PI * 2);
        cr.stroke();
        if (progress > 0) {
            cr.setSourceRGBA(color[0], color[1], color[2], 1);
            cr.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
            cr.stroke();
        }
        cr.$dispose();
    }

    _focusEndClock(remaining) {
        const end = new Date(Date.now() + remaining * 1000);
        return new Intl.DateTimeFormat(undefined, {hour: '2-digit', minute: '2-digit'}).format(end);
    }

    _toggleFocus() {
        if (this._focusSource) {
            this._focusRemaining = Math.max(
                0,
                Math.ceil(this._focusDeadline - GLib.get_monotonic_time() / MICROSECONDS_PER_SECOND)
            );
            this._clearTimeout('_focusSource');
            this._focusDeadline = 0;
            this._renderPanel();
            this._updateCollapsedLabel();
            return;
        }

        if (this._focusRemaining <= 0) {
            this._focusRemaining = this._focusDuration;
        }
        this._focusWasStarted = true;
        this._focusDeadline = GLib.get_monotonic_time() / MICROSECONDS_PER_SECOND + this._focusRemaining;
        this._focusSource = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            const remaining = Math.ceil(this._focusDeadline - GLib.get_monotonic_time() / MICROSECONDS_PER_SECOND);
            if (remaining <= 0) {
                const completedMode = this._focusMode;
                const completedDuration = this._focusDuration;
                if (completedMode === 'focus' || completedMode === 'custom')
                    this._focusSessionsToday++;
                this._focusRemaining = 0;
                this._focusDeadline = 0;
                this._focusSource = 0;
                if (this._activePage === 'focus')
                    this._renderPanel();
                this._updateCollapsedLabel();
                this._showFocusCompleteNotice(completedMode, completedDuration);
                return GLib.SOURCE_REMOVE;
            }
            this._updateFocusPage(remaining);
            this._updateCollapsedLabel();
            return GLib.SOURCE_CONTINUE;
        });
        this._renderPanel();
        this._updateCollapsedLabel();
    }

    _setFocusDuration(seconds, mode = null) {
        this._clearTimeout('_focusSource');
        this._focusDeadline = 0;
        this._focusDuration = seconds;
        this._focusMode = mode || (seconds === DEFAULT_FOCUS_SECONDS
            ? 'focus'
            : seconds === 15 * 60 ? 'long' : 'short');
        this._focusWasStarted = false;
        this._focusRemaining = seconds;
        this._renderPanel();
        this._updateCollapsedLabel();
    }

    _applyCustomFocusDuration() {
        const entryValue = this._focusCustomEntry?.get_text() ?? this._focusCustomValue;
        const entered = Number(entryValue);
        const maximum = this._focusCustomUnit === 'minutes' ? 1440 : 86400;
        const amount = Number.isFinite(entered) ? Math.min(maximum, Math.max(1, Math.floor(entered))) : 1;
        this._focusCustomValue = String(amount);
        this._focusCustomDuration = amount * (this._focusCustomUnit === 'minutes' ? 60 : 1);
        if (this._focusCustomEntry)
            this._focusCustomEntry.set_text(this._focusCustomValue);
        this._setFocusDuration(this._focusCustomDuration, 'custom');
    }

    _resetFocus() {
        this._setFocusDuration(this._focusDuration, this._focusMode);
    }

    _updateFocusPage(remaining) {
        if (!this._focusLabel)
            return;
        this._focusLabel.text = formatTime(remaining);
        this._focusStatusLabel.text = remaining === 0 ? 'Complete' : this._focusModeLabel();
        if (this._focusSessionsLabel)
            this._focusSessionsLabel.text = `${this._focusSessionsToday} focus sessions today`;
        this._focusToggleButton._perdanaActionIcon.icon_name = this._focusSource
            ? 'media-playback-pause-symbolic'
            : 'media-playback-start-symbolic';
        this._focusToggleButton._perdanaActionLabel.text = this._focusSource ? 'Pause' : 'Resume';
        this._focusToggleButton.accessible_name = this._focusSource
            ? 'Pause focus session'
            : 'Resume focus session';
        this._focusRing?.queue_repaint();
    }

    _discoverPlayers() {
        Gio.DBus.session.call(
            'org.freedesktop.DBus',
            '/org/freedesktop/DBus',
            'org.freedesktop.DBus',
            'ListNames',
            null,
            new GLib.VariantType('(as)'),
            Gio.DBusCallFlags.NONE,
            3000,
            null,
            (connection, result) => {
                if (!this._enabled)
                    return;
                try {
                    const names = connection.call_finish(result).deep_unpack()[0]
                        .filter(name => name.startsWith(MPRIS_PREFIX));
                    this._playersLoaded = true;
                    this._playersError = false;
                    this._setPlayers(names);
                } catch (_error) {
                    this._playersLoaded = true;
                    this._playersError = true;
                    if (this._expanded && ['media', 'lyrics'].includes(this._activePage))
                        this._renderPanel();
                }
            }
        );
    }

    _setPlayers(names) {
        const wanted = new Set(names);
        for (const [name, entry] of this._players) {
            if (!wanted.has(name)) {
                if (entry.signalId)
                    entry.proxy.disconnect(entry.signalId);
                if (entry.seekedSignalId)
                    entry.proxy.disconnect(entry.seekedSignalId);
                this._players.delete(name);
            }
        }

        for (const name of wanted) {
            if (this._players.has(name))
                continue;
            try {
                const proxy = Gio.DBusProxy.new_sync(
                    Gio.DBus.session,
                    Gio.DBusProxyFlags.DO_NOT_AUTO_START,
                    null,
                    name,
                    MPRIS_PATH,
                    MPRIS_PLAYER_IFACE,
                    null
                );
                const metadata = this._getMetadata(proxy);
                const entry = {
                    name,
                    proxy,
                    positionBase: Number(this._getProperty(proxy, 'Position')) || 0,
                    positionStamp: GLib.get_monotonic_time(),
                    playbackStatus: this._getProperty(proxy, 'PlaybackStatus') || 'Paused',
                    trackKey: `${metadata.trackId || ''}\u0000${metadata.title}\u0000${metadata.artist}`,
                    visualKey: `${metadata.trackId || ''}\u0000${metadata.title}\u0000${metadata.artist}\u0000${metadata.artUrl || ''}`,
                    signalId: 0,
                    seekedSignalId: 0,
                };
                entry.signalId = proxy.connect('g-properties-changed', (_proxy, changed, invalidated) => {
                    const changedProperties = changed.deep_unpack();
                    const changedNames = new Set([
                        ...Object.keys(changedProperties),
                        ...invalidated,
                    ]);
                    const now = GLib.get_monotonic_time();
                    const positionChanged = Object.prototype.hasOwnProperty.call(changedProperties, 'Position');
                    const playbackChanged = changedNames.has('PlaybackStatus');
                    const metadataChanged = changedNames.has('Metadata');
                    const metadata = metadataChanged ? this._getMetadata(proxy) : null;
                    const trackKey = metadata
                        ? `${metadata.trackId || ''}\u0000${metadata.title}\u0000${metadata.artist}`
                        : entry.trackKey;
                    const trackChanged = metadataChanged && trackKey !== entry.trackKey;
                    const visualKey = metadata
                        ? `${trackKey}\u0000${metadata.artUrl || ''}` : entry.visualKey;
                    const visualChanged = metadataChanged && visualKey !== entry.visualKey;
                    if (visualChanged)
                        entry.visualKey = visualKey;

                    if (trackChanged) {
                        entry.trackKey = trackKey;
                        const position = Number(this._getProperty(proxy, 'Position'));
                        entry.positionBase = positionChanged && Number.isFinite(position)
                            ? Math.max(0, position)
                            : 0;
                        entry.positionStamp = now;
                    } else if (positionChanged) {
                        const position = Number(this._getProperty(proxy, 'Position'));
                        if (Number.isFinite(position)) {
                            entry.positionBase = Math.max(0, position);
                            entry.positionStamp = now;
                        }
                    } else if (playbackChanged) {
                        // Position is not required to update on pause/resume. Keep the
                        // locally estimated position instead of snapping to a stale cache.
                        if (entry.playbackStatus === 'Playing') {
                            entry.positionBase += Math.max(0, now - entry.positionStamp);
                        }
                        entry.positionStamp = now;
                    }
                    if (playbackChanged) {
                        entry.playbackStatus = this._getProperty(proxy, 'PlaybackStatus') || 'Paused';
                        this._updateMediaTicker();
                    }
                    if (metadataChanged || playbackChanged)
                        this._syncSelectedPlayerLyrics();
                    this._updateCollapsedLabel();
                    if (this._expanded && this._activePage === 'lyrics' && playbackChanged && !metadataChanged)
                        this._updateLyricsPlaybackButton();
                    if (this._expanded && ['media', 'lyrics'].includes(this._activePage)
                        && (visualChanged || (playbackChanged && this._activePage === 'media')))
                        this._renderPanel();
                    else if (this._expanded && ['media', 'lyrics'].includes(this._activePage))
                        this._updateMediaProgress();
                });
                entry.seekedSignalId = proxy.connect('g-signal', (_proxy, _sender, signalName, parameters) => {
                    if (signalName !== 'Seeked')
                        return;
                    entry.positionBase = Number(parameters.deep_unpack()[0]) || 0;
                    entry.positionStamp = GLib.get_monotonic_time();
                    if (this._expanded && ['media', 'lyrics'].includes(this._activePage))
                        this._updateMediaProgress();
                });
                this._players.set(name, entry);
            } catch (_error) {
                // A player can disappear between ListNames and proxy creation.
            }
        }

        this._updateMediaTicker();
        this._syncSelectedPlayerLyrics();
        this._updateCollapsedLabel();
        if (this._expanded && ['media', 'lyrics'].includes(this._activePage))
            this._renderPanel();
    }

    _updateMediaTicker() {
        const player = this._getSelectedPlayer();
        const playing = player
            && this._getProperty(player.proxy, 'PlaybackStatus') === 'Playing';
        const smoothLyrics = this._preferences?.showRestingLyrics
            || (this._expanded && this._activePage === 'lyrics');
        const interval = smoothLyrics ? 250 : 1000;
        if (playing && (!this._mediaSource || this._mediaTickerInterval !== interval)) {
            this._clearTimeout('_mediaSource');
            this._mediaTickerInterval = interval;
            this._mediaSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, () => {
                if (!this._enabled)
                    return GLib.SOURCE_REMOVE;
                this._updateMediaProgress();
                this._updateCollapsedLabel();
                return GLib.SOURCE_CONTINUE;
            });
        } else if (!playing) {
            this._clearTimeout('_mediaSource');
            this._mediaTickerInterval = 0;
        }
    }

    _getSelectedPlayer() {
        const players = [...this._players.values()];
        const playing = players.find(player => this._getProperty(player.proxy, 'PlaybackStatus') === 'Playing');
        if (playing) {
            this._selectedPlayerName = playing.name;
            return playing;
        }
        const remembered = this._players.get(this._selectedPlayerName);
        if (remembered)
            return remembered;
        const fallback = players[0] || null;
        this._selectedPlayerName = fallback?.name || null;
        return fallback;
    }

    _getProperty(proxy, property) {
        return unpack(proxy.get_cached_property(property));
    }

    _getMetadata(proxy) {
        const metadata = unpack(proxy.get_cached_property('Metadata')) || {};
        const title = unpack(metadata['xesam:title']);
        const rawArtist = unpack(metadata['xesam:artist']);
        const album = unpack(metadata['xesam:album']);
        const lyrics = unpack(metadata['xesam:asText']);
        const artist = Array.isArray(rawArtist) ? rawArtist.join(', ') : rawArtist;
        return {
            title: typeof title === 'string' ? title : '',
            artist: typeof artist === 'string' ? artist : '',
            album: typeof album === 'string' ? album : '',
            lyrics: typeof lyrics === 'string' ? lyrics : '',
            artUrl: unpack(metadata['mpris:artUrl']),
            trackId: unpack(metadata['mpris:trackid']),
            length: Number(unpack(metadata['mpris:length'])) || 0,
        };
    }

    _localArtIcon(artUrl) {
        if (typeof artUrl !== 'string' || !artUrl.startsWith('file://'))
            return null;
        try {
            return Gio.icon_new_for_string(artUrl);
        } catch (_error) {
            return null;
        }
    }

    _clearArtwork(container, fallbackIcon, fallbackGicon) {
        container._perdanaArtworkUrl = null;
        for (const child of container.get_children()) {
            if (child !== fallbackIcon)
                child.destroy();
        }
        fallbackIcon.gicon = fallbackGicon;
        fallbackIcon.show();
    }

    _loadArtwork(container, fallbackIcon, artUrl, size, radius) {
        const source = typeof artUrl === 'string' ? artUrl.trim() : '';
        if (!source || source.length > 4096)
            return;

        container._perdanaArtworkUrl = source;
        const showArtwork = file => {
            let isCurrent = false;
            try {
                isCurrent = this._enabled
                    && container._perdanaArtworkUrl === source
                    && Boolean(container.get_stage());
            } catch (_error) {
                return;
            }
            if (!isCurrent || !file)
                return;

            try {
                const roundedFile = this._roundedArtworkFile(file, size, radius);
                const artworkFile = roundedFile || file;
                const themeContext = St.ThemeContext.get_for_stage(global.stage);
                const texture = St.TextureCache.get_default().load_file_async(
                    artworkFile,
                    size,
                    size,
                    themeContext.scale_factor,
                    container.get_resource_scale()
                );
                texture.content_gravity = Clutter.ContentGravity.RESIZE_ASPECT;
                texture.x_align = Clutter.ActorAlign.CENTER;
                texture.y_align = Clutter.ActorAlign.CENTER;
                texture.set_size(size, size);
                texture.reactive = false;
                const revealArtwork = () => {
                    if (texture.content && container._perdanaArtworkUrl === source
                        && container.get_stage())
                        fallbackIcon.hide();
                };
                texture.connect('notify::content', revealArtwork);
                container.add_child(texture);
                revealArtwork();
            } catch (_error) {
                // Keep the generic artwork icon if the image cannot be decoded.
            }
        };

        if (source.toLowerCase().startsWith('file://')) {
            try {
                const file = Gio.File.new_for_uri(source);
                GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                    showArtwork(file);
                    return GLib.SOURCE_REMOVE;
                });
            } catch (_error) {
                // Keep the generic artwork icon for invalid local artwork URIs.
            }
            return;
        }
        if (!source.toLowerCase().startsWith('https://'))
            return;

        const cached = this._artworkCache.get(source);
        if (cached && cached.query_exists(null)) {
            this._artworkCache.delete(source);
            this._artworkCache.set(source, cached);
            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                showArtwork(cached);
                return GLib.SOURCE_REMOVE;
            });
            return;
        }

        let request = this._artworkRequests.get(source);
        if (request) {
            request.callbacks.push(showArtwork);
            return;
        }

        request = {cancellable: new Gio.Cancellable(), callbacks: [showArtwork]};
        this._artworkRequests.set(source, request);
        const message = Soup.Message.new('GET', source);
        if (!message) {
            this._finishArtworkRequest(source, null);
            return;
        }
        message.get_request_headers().append('Accept', 'image/jpeg,image/png,image/webp');
        this._artworkSession.send_async(
            message,
            GLib.PRIORITY_DEFAULT,
            request.cancellable,
            (session, result) => {
                let stream;
                try {
                    stream = session.send_finish(result);
                } catch (_error) {
                    this._finishArtworkRequest(source, null);
                    return;
                }

                const headers = message.get_response_headers();
                const contentType = (headers.get_one('Content-Type') || '')
                    .split(';', 1)[0].trim().toLowerCase();
                const contentLength = Number(headers.get_content_length());
                const finalUri = message.get_uri();
                const isHttps = finalUri?.get_scheme()?.toLowerCase() === 'https';
                if (message.get_status() < 200 || message.get_status() >= 300 || !isHttps
                    || !['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(contentType)
                    || (Number.isFinite(contentLength) && contentLength > 8 * 1024 * 1024)) {
                    try {
                        stream.close(null);
                    } catch (_error) {
                        // The response stream may already be closed.
                    }
                    this._finishArtworkRequest(source, null);
                    return;
                }

                this._readArtworkStream(source, contentType, stream, request, [], 0);
            }
        );
    }

    _roundedArtworkFile(file, size, radius) {
        const path = file.get_path();
        if (!path || size < 2)
            return null;

        const key = `${path}\u001f${size}\u001f${radius}`;
        const cached = this._roundedArtworkCache.get(key);
        if (cached?.query_exists(null)) {
            this._roundedArtworkCache.delete(key);
            this._roundedArtworkCache.set(key, cached);
            return cached;
        }

        try {
            const source = GdkPixbuf.Pixbuf.new_from_file_at_scale(path, size, size, true);
            const rounded = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, true, 8, size, size);
            rounded.fill(0);
            const sourcePixels = source.get_pixels();
            const roundedPixels = rounded.get_pixels();
            const sourceChannels = source.n_channels;
            const sourceHasAlpha = source.get_has_alpha();
            const offsetX = Math.floor((size - source.width) / 2);
            const offsetY = Math.floor((size - source.height) / 2);

            for (let y = 0; y < source.height; y++) {
                for (let x = 0; x < source.width; x++) {
                    const sourceIndex = y * source.rowstride + x * sourceChannels;
                    const roundedIndex = (offsetY + y) * rounded.rowstride + (offsetX + x) * 4;
                    roundedPixels[roundedIndex] = sourcePixels[sourceIndex];
                    roundedPixels[roundedIndex + 1] = sourcePixels[sourceIndex + 1];
                    roundedPixels[roundedIndex + 2] = sourcePixels[sourceIndex + 2];
                    roundedPixels[roundedIndex + 3] = sourceHasAlpha
                        ? sourcePixels[sourceIndex + 3]
                        : 255;
                }
            }

            const corner = Math.min(Math.round(radius), Math.floor(size / 2));
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    let centerX;
                    let centerY;
                    if (x < corner && y < corner) {
                        centerX = corner;
                        centerY = corner;
                    } else if (x >= size - corner && y < corner) {
                        centerX = size - corner;
                        centerY = corner;
                    } else if (x < corner && y >= size - corner) {
                        centerX = corner;
                        centerY = size - corner;
                    } else if (x >= size - corner && y >= size - corner) {
                        centerX = size - corner;
                        centerY = size - corner;
                    } else {
                        continue;
                    }

                    const distance = Math.hypot(x + 0.5 - centerX, y + 0.5 - centerY);
                    const coverage = Math.max(0, Math.min(1, corner - distance + 0.5));
                    const alphaIndex = y * rounded.rowstride + x * 4 + 3;
                    roundedPixels[alphaIndex] = Math.round(roundedPixels[alphaIndex] * coverage);
                }
            }

            if (!this._artworkCacheDirectory)
                this._artworkCacheDirectory = GLib.dir_make_tmp('perdana-island-art-XXXXXX');
            const digest = GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, key, -1);
            const roundedPath = GLib.build_filenamev([
                this._artworkCacheDirectory,
                `${digest}.png`,
            ]);
            if (!rounded.savev(roundedPath, 'png', [], []))
                return null;

            const roundedFile = Gio.File.new_for_path(roundedPath);
            this._artworkFiles.add(roundedPath);
            this._roundedArtworkCache.set(key, roundedFile);
            while (this._roundedArtworkCache.size > 72) {
                const [oldKey, oldFile] = this._roundedArtworkCache.entries().next().value;
                this._roundedArtworkCache.delete(oldKey);
                try {
                    oldFile.delete(null);
                } catch (_error) {
                    // The texture cache may already have released the file.
                }
                this._artworkFiles.delete(oldFile.get_path());
            }
            return roundedFile;
        } catch (_error) {
            return null;
        }
    }

    _readArtworkStream(artUrl, contentType, stream, request, chunks, totalSize) {
        stream.read_bytes_async(
            64 * 1024,
            GLib.PRIORITY_DEFAULT,
            request.cancellable,
            (input, result) => {
                let bytes;
                try {
                    bytes = input.read_bytes_finish(result);
                } catch (_error) {
                    try {
                        stream.close(null);
                    } catch (_closeError) {
                        // A cancelled response may already be closed.
                    }
                    this._finishArtworkRequest(artUrl, null);
                    return;
                }

                const data = bytes.get_data();
                if (!data.length) {
                    try {
                        stream.close(null);
                        if (!totalSize) {
                            this._finishArtworkRequest(artUrl, null);
                            return;
                        }
                        if (!this._artworkCacheDirectory)
                            this._artworkCacheDirectory = GLib.dir_make_tmp('perdana-island-art-XXXXXX');
                        const image = new Uint8Array(totalSize);
                        let offset = 0;
                        for (const chunk of chunks) {
                            const part = chunk.get_data();
                            image.set(part, offset);
                            offset += part.length;
                        }
                        const digest = GLib.compute_checksum_for_string(
                            GLib.ChecksumType.SHA256, artUrl, -1);
                        const extension = contentType === 'image/png' ? 'png'
                            : (contentType === 'image/webp' ? 'webp' : 'jpg');
                        const file = Gio.File.new_for_path(GLib.build_filenamev([
                            this._artworkCacheDirectory,
                            `${digest}.${extension}`,
                        ]));
                        file.replace_contents(
                            image,
                            null,
                            false,
                            Gio.FileCreateFlags.REPLACE_DESTINATION,
                            null
                        );
                        this._artworkFiles.add(file.get_path());
                        this._artworkCache.set(artUrl, file);
                        while (this._artworkCache.size > 24) {
                            const [oldUrl, oldFile] = this._artworkCache.entries().next().value;
                            this._artworkCache.delete(oldUrl);
                            let source = 0;
                            source = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
                                this._artworkEvictionSources.delete(source);
                                if (![...this._artworkCache.values()].some(cached => cached.equal(oldFile))) {
                                    try {
                                        oldFile.delete(null);
                                    } catch (_error) {
                                        // The file may already have been removed during shutdown.
                                    }
                                    this._artworkFiles.delete(oldFile.get_path());
                                }
                                return GLib.SOURCE_REMOVE;
                            });
                            this._artworkEvictionSources.add(source);
                        }
                        this._finishArtworkRequest(artUrl, file);
                    } catch (_error) {
                        this._finishArtworkRequest(artUrl, null);
                    }
                    return;
                }

                if (totalSize + data.length > 8 * 1024 * 1024) {
                    try {
                        request.cancellable.cancel();
                        stream.close(null);
                    } catch (_error) {
                        // Cancellation closes the response stream when needed.
                    }
                    this._finishArtworkRequest(artUrl, null);
                    return;
                }

                chunks.push(bytes);
                this._readArtworkStream(artUrl, contentType, stream, request,
                    chunks, totalSize + data.length);
            }
        );
    }

    _finishArtworkRequest(artUrl, file) {
        const request = this._artworkRequests.get(artUrl);
        if (!request)
            return;
        this._artworkRequests.delete(artUrl);
        for (const callback of request.callbacks)
            callback(file);
    }

    _positionForPlayer(player) {
        const isPlaying = this._getProperty(player.proxy, 'PlaybackStatus') === 'Playing';
        const current = player.positionBase + (isPlaying
            ? Math.max(0, GLib.get_monotonic_time() - player.positionStamp)
            : 0);
        return Math.max(0, current / MICROSECONDS_PER_SECOND);
    }

    _updateMediaProgress() {
        if (!this._expanded || !['media', 'lyrics'].includes(this._activePage)
            || !this._mediaPositionLabel || !this._mediaDurationLabel || !this._progressFill
            || !this._progressLine || !this._progressTrack)
            return;
        const player = this._getSelectedPlayer();
        if (!player)
            return;
        const metadata = this._getMetadata(player.proxy);
        if (this._activePage === 'lyrics' && this._lyricsRetryAt && Date.now() >= this._lyricsRetryAt)
            this._ensureLyrics(metadata, player.name);
        const duration = metadata.length / MICROSECONDS_PER_SECOND;
        this._progressCanSeek = Boolean(metadata.trackId && metadata.length > 0
            && this._canControl(player.proxy, 'CanSeek'));
        this._progressTrack.reactive = this._progressCanSeek;
        const position = this._progressSeeking
            ? duration * this._progressSeekRatio
            : Math.min(duration || Infinity, this._positionForPlayer(player));
        this._mediaPositionLabel.text = formatTime(position);
        this._mediaDurationLabel.text = formatTime(duration);
        const ratio = duration > 0 ? Math.min(1, position / duration) : 0;
        this._progressFill.width = Math.max(1, this._progressLine.width * ratio);
        if (this._activePage === 'lyrics')
            this._updateLyricsLines(position);
    }

    _callPlayer(proxy, method) {
        proxy.call(
            method,
            null,
            Gio.DBusCallFlags.NONE,
            3000,
            null,
            (player, result) => {
                try {
                    player.call_finish(result);
                } catch (_error) {
                    if (this._enabled)
                        this._discoverPlayers();
                }
            }
        );
    }

    _currentLyricsText(position) {
        const data = this._lyricsData;
        if (!data?.synced || !Array.isArray(data.lines))
            return '';
        let activeLine = null;
        for (const line of data.lines) {
            if (line.time <= position)
                activeLine = line;
            else
                break;
        }
        return activeLine?.text || '';
    }

    _setCompactTrackText(text) {
        const label = this._compactTrackTitle;
        if (!label)
            return;

        const displayText = String(text || '');
        const previousText = label.text;
        const textChanged = previousText !== displayText;
        const lyricsMode = Boolean(this._preferences?.showRestingLyrics);
        // Both resting titles and lyrics share one centered text slot. Keeping
        // the alignment fixed avoids a left-to-center jump when lyrics arrive.
        const layoutMode = 'centered';
        const layoutChanged = this._compactTrackLayoutMode !== layoutMode;
        if (layoutChanged) {
            this._compactTrackLayoutMode = layoutMode;
            this._compactTextTransitionGeneration++;
            this._compactTrackPendingText = null;
            label.remove_all_transitions();
            label.opacity = 255;
        }
        const fitClasses = [
            'perdana-island__compact-track-title--lyrics-small',
            'perdana-island__compact-track-title--lyrics-smaller',
        ];
        let desiredFitClass = null;

        if (lyricsMode) {
            this._compact.add_style_class_name('perdana-island__compact--lyrics');
            label.add_style_class_name('perdana-island__compact-track-title--lyrics');
            label.clutter_text.line_wrap = true;
            label.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
            label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
            label.clutter_text.line_alignment = Pango.Alignment.CENTER;
            label.x_align = Clutter.ActorAlign.FILL;
            label.y_align = Clutter.ActorAlign.CENTER;
            this._restingLyricsWidth = this._restingLyricsPillWidth();

            const outerSpacing = 102;
            const availableTextWidth = Math.max(1, this._restingLyricsWidth - outerSpacing);
            const fitKey = `${this._restingLyricsWidth}\u001f${displayText}`;
            if (fitKey !== this._compactLyricsFitKey) {
                this._compactLyricsFitKey = fitKey;
                for (const fitClass of fitClasses)
                    label.remove_style_class_name(fitClass);

                if (textChanged)
                    label.text = displayText;
                const [, initialHeight] = label.get_preferred_height(availableTextWidth);
                let fitClass = null;
                if (initialHeight > RESTING_LYRICS_HEIGHT - 16) {
                    label.add_style_class_name(fitClasses[0]);
                    fitClass = fitClasses[0];
                    const [, smallerHeight] = label.get_preferred_height(availableTextWidth);
                    if (smallerHeight > RESTING_LYRICS_HEIGHT - 16) {
                        label.add_style_class_name(fitClasses[1]);
                        fitClass = fitClasses[1];
                    }
                }
                if (textChanged)
                    label.text = previousText;
                for (const candidate of fitClasses)
                    label.remove_style_class_name(candidate);
                if (this._compactLyricsAppliedFitClass)
                    label.add_style_class_name(this._compactLyricsAppliedFitClass);
                this._compactLyricsFitClass = fitClass;
            }
            desiredFitClass = this._compactLyricsFitClass;
        } else {
            this._compact.remove_style_class_name('perdana-island__compact--lyrics');
            label.remove_style_class_name('perdana-island__compact-track-title--lyrics');
            for (const fitClass of fitClasses)
                label.remove_style_class_name(fitClass);
            label.clutter_text.line_wrap = false;
            label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            label.clutter_text.line_alignment = Pango.Alignment.CENTER;
            label.x_align = Clutter.ActorAlign.FILL;
            label.y_align = Clutter.ActorAlign.CENTER;
            this._restingLyricsWidth = PLAYING_WIDTH;
            this._compactLyricsFitKey = null;
            this._compactLyricsFitClass = null;
            this._compactLyricsAppliedFitClass = null;
        }

        const applyFitClass = () => {
            for (const fitClass of fitClasses)
                label.remove_style_class_name(fitClass);
            if (desiredFitClass)
                label.add_style_class_name(desiredFitClass);
            this._compactLyricsAppliedFitClass = desiredFitClass;
        };

        if (!lyricsMode && this._compactTrackPendingText !== null) {
            this._compactTextTransitionGeneration++;
            this._compactTrackPendingText = null;
            label.remove_all_transitions();
            label.opacity = 255;
        }

        const desiredWidth = this._focusSource ? PLAYING_WIDTH
            : this._isPlaying() ? this._collapsedWidth() : COLLAPSED_WIDTH;
        const desiredHeight = this._collapsedHeight();
        const geometryStable = !this._expanded && !this._closing && this._root
            && Math.round(this._root.width) === desiredWidth
            && Math.round(this._root.height) === desiredHeight;
        const shouldFade = !layoutChanged && textChanged && previousText
            && label.visible && label.opacity > 0 && geometryStable;
        if (shouldFade) {
            if (this._compactTrackPendingText === displayText)
                return;

            const generation = ++this._compactTextTransitionGeneration;
            this._compactTrackPendingText = displayText;
            label.remove_all_transitions();
            label.ease({
                opacity: 0,
                duration: this._motionDuration(100),
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onComplete: () => {
                    if (generation !== this._compactTextTransitionGeneration
                        || !this._uiActorsAlive || !this._compactTrackTitle)
                        return;
                    applyFitClass();
                    this._compactTrackTitle.text = displayText;
                    this._compactTrackPendingText = null;
                    this._compactTrackTitle.ease({
                        opacity: 255,
                        duration: this._motionDuration(180),
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    });
                },
            });
            return;
        }

        if (textChanged) {
            this._compactTextTransitionGeneration++;
            this._compactTrackPendingText = null;
            label.remove_all_transitions();
            applyFitClass();
            label.text = displayText;
            if (lyricsMode && previousText && label.visible && !this._expanded && !this._closing)
                label.opacity = 255;
        } else if (this._compactTrackPendingText === displayText) {
            return;
        } else if (this._compactLyricsAppliedFitClass !== desiredFitClass) {
            applyFitClass();
        }
    }

    _cancelCompactTrackTextTransition() {
        this._compactTextTransitionGeneration++;
        this._compactTrackPendingText = null;
        if (this._compactTrackTitle) {
            this._compactTrackTitle.remove_all_transitions();
            this._compactTrackTitle.opacity = 255;
        }
    }

    _updateLyricsRestingToggle() {
        if (!this._lyricsRestingToggle)
            return;
        const enabled = Boolean(this._preferences?.showRestingLyrics);
        if (enabled)
            this._lyricsRestingToggle.add_style_class_name('perdana-button--lyrics-resting-active');
        else
            this._lyricsRestingToggle.remove_style_class_name('perdana-button--lyrics-resting-active');
        this._lyricsRestingToggle.accessible_name = enabled
            ? 'Show synchronized lyrics in the resting island, on'
            : 'Show synchronized lyrics in the resting island, off';
        this._applyAccentStyles(this._lyricsRestingToggle);
    }

    _updateCollapsedLabel() {
        if (!this._uiActorsAlive || !this._compact || this._systemNoticeActive)
            return;
        const player = this._getSelectedPlayer();
        const playing = player && this._getProperty(player.proxy, 'PlaybackStatus') === 'Playing';
        const focusRunning = Boolean(this._focusSource);
        const showMedia = Boolean(playing && !focusRunning);
        const restingWithClock = this._preferences?.restingStyle === 'eyes-clock';
        const showClock = Boolean(!playing && !focusRunning && !this._expanded && !this._closing
            && (restingWithClock || this._root?.hover));
        const hideEyesForClock = showClock && !restingWithClock;
        if (playing)
            this._root.add_style_class_name('perdana-island--playing');
        else
            this._root.remove_style_class_name('perdana-island--playing');
        this._compactLeading.visible = Boolean(showMedia && player);
        this._compactArtwork.visible = Boolean(showMedia && player);
        this._compactTrackTitle.visible = Boolean(showMedia && player);
        this._focusCompact.visible = focusRunning;
        if (focusRunning) {
            const remaining = Math.max(0, Math.ceil(
                this._focusDeadline - GLib.get_monotonic_time() / MICROSECONDS_PER_SECOND
            ));
            this._focusCompactLabel.text = this._focusModeLabel();
            this._focusCompactTime.text = formatTime(remaining);
        }
        this._compactCenter.visible = !showMedia && !focusRunning;
        this._compactCenter.opacity = 255;
        this._idleEyes.visible = !showMedia && !focusRunning;
        this._compactClockLabel.visible = !showMedia && !focusRunning;
        const compactState = focusRunning ? 'focus' : showMedia ? 'playing'
            : showClock ? (restingWithClock ? 'eyes-clock' : 'hover') : 'idle';
        if (compactState !== this._compactVisualState) {
            this._compactVisualState = compactState;
            this._idleEyes.remove_all_transitions();
            this._compactClockLabel.remove_all_transitions();
            if (showMedia || focusRunning) {
                this._idleEyes.translation_x = 0;
                this._idleEyes.translation_y = 0;
                this._idleEyes.opacity = 0;
                this._idleEyes.scale_x = 0.72;
                this._idleEyes.scale_y = 0.72;
                this._compactClockLabel.opacity = 0;
                this._compactClockLabel.scale_x = 0.8;
                this._compactClockLabel.scale_y = 0.8;
                this._compactTrackTitle.opacity = 0;
            } else {
                this._compactTrackTitle.remove_all_transitions();
                this._compactTrackTitle.opacity = 0;
                const duration = this._motionDuration(140);
                const mode = Clutter.AnimationMode.EASE_OUT_QUAD;
                this._idleEyes.ease({
                    opacity: hideEyesForClock ? 0 : 255,
                    scale_x: hideEyesForClock ? 0.72 : 1,
                    scale_y: hideEyesForClock ? 0.72 : 1,
                    duration,
                    mode,
                });
                this._compactClockLabel.ease({
                    opacity: showClock ? 255 : 0,
                    scale_x: showClock ? 1 : 0.8,
                    scale_y: showClock ? 1 : 0.8,
                    duration,
                    mode,
                });
            }
        }
        this._equalizer.visible = showMedia;
        this._setEqualizerPlaying(this._equalizer, showMedia);
        if (this._mediaEqualizer) {
            this._mediaEqualizer.visible = Boolean(playing);
            this._setEqualizerPlaying(
                this._mediaEqualizer,
                Boolean(playing && this._expanded && this._activePage === 'media')
            );
        }
        if (player) {
            const metadata = this._getMetadata(player.proxy);
            const title = metadata.title || player.name.replace(MPRIS_PREFIX, '');
            if (showMedia && this._preferences?.showRestingLyrics)
                this._ensureLyrics(metadata, player.name);
            const lyric = showMedia && this._preferences?.showRestingLyrics
                ? this._currentLyricsText(this._positionForPlayer(player))
                : '';
            // The compact layer is hidden while open and clipped through the
            // close animation. Update it once the resting geometry is stable;
            // otherwise the 250 ms lyrics ticker races its fade and relayout.
            if (!this._expanded && !this._closing)
                this._setCompactTrackText(lyric || title);
            const artworkKey = `${player.name}\u001f${metadata.trackId || ''}\u001f${metadata.artUrl || ''}`;
            if (artworkKey !== this._compactArtworkKey) {
                this._compactArtworkKey = artworkKey;
                this._clearArtwork(
                    this._compactArtwork,
                    this._compactArtworkIcon,
                    this._localArtIcon(metadata.artUrl) || Gio.ThemedIcon.new('audio-x-generic-symbolic')
                );
                this._loadArtwork(this._compactArtwork, this._compactArtworkIcon, metadata.artUrl, 24, 6);
            }
        } else {
            if (!this._expanded && !this._closing)
                this._setCompactTrackText('');
            if (this._compactArtworkKey !== null) {
                this._compactArtworkKey = null;
                this._clearArtwork(
                    this._compactArtwork,
                    this._compactArtworkIcon,
                    Gio.ThemedIcon.new('audio-x-generic-symbolic')
                );
            }
        }
        this._updateHeaderClock();
        if (!this._expanded && !this._closing) {
            const targetWidth = focusRunning ? PLAYING_WIDTH
                : playing ? this._collapsedWidth() : COLLAPSED_WIDTH;
            const targetHeight = this._collapsedHeight();
            const targetSize = `${targetWidth}x${targetHeight}`;
            const sizeMatches = Math.round(this._root.width) === targetWidth
                && Math.round(this._root.height) === targetHeight;
            if (targetSize !== this._collapsedTargetSize) {
                this._collapsedTargetSize = targetSize;
                this._root.remove_all_transitions();
                if (sizeMatches) {
                    this._layoutIsland();
                    if (showMedia && this._compactTrackTitle.visible
                        && this._compactTrackTitle.opacity < 255) {
                        this._compactTrackTitle.ease({
                            opacity: 255,
                            duration: this._motionDuration(180),
                            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                        });
                    }
                } else {
                    this._compactTrackTitle.opacity = 0;
                    this._root.ease({
                        width: targetWidth,
                        height: targetHeight,
                        duration: this._motionDuration(500),
                        mode: this._reducedMotion ? Clutter.AnimationMode.LINEAR : Clutter.AnimationMode.EASE_OUT_CUBIC,
                        onComplete: () => {
                            if (this._collapsedTargetSize !== targetSize || !this._root)
                                return;
                            this._layoutIsland();
                            if (showMedia && this._compactTrackTitle.visible) {
                                this._compactTrackTitle.ease({
                                    opacity: 255,
                                    duration: this._motionDuration(180),
                                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                                });
                            }
                        },
                    });
                }
            } else if (sizeMatches && showMedia && this._compactTrackTitle.visible
                && this._compactTrackTitle.opacity < 255) {
                this._compactTrackTitle.ease({
                    opacity: 255,
                    duration: this._motionDuration(140),
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            }
        }
        if (playing || focusRunning)
            this._clearTimeout('_blinkSource');
        else if (!this._expanded)
            this._scheduleBlink();
        if ((playing || focusRunning) && this._root.hover && !this._expanded && !this._hoverOpenSource) {
            this._hoverOpenSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 160, () => {
                this._hoverOpenSource = 0;
                if (this._root?.hover && (this._isPlaying() || this._focusSource)) {
                    this._pinned = false;
                    this._setExpanded(true);
                }
                return GLib.SOURCE_REMOVE;
            });
        } else if ((!playing && !focusRunning) || !this._root.hover) {
            this._clearTimeout('_hoverOpenSource');
        }
    }

    _startTodayTicker() {
        if (this._todaySource || !this._enabled)
            return;
        this._updateTodayMetrics();
        this._todaySource = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
            if (!this._enabled || !this._expanded || this._activePage !== 'today') {
                this._todaySource = 0;
                return GLib.SOURCE_REMOVE;
            }
            if (new Date().toDateString() !== this._calendarDateKey) {
                this._renderPanel();
                return GLib.SOURCE_CONTINUE;
            }
            this._updateTodayMetrics();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopTodayTicker() {
        this._clearTimeout('_todaySource');
    }

    _startClipboardTicker() {
        if (this._clipboardSource || !this._enabled)
            return;
        this._captureClipboard();
        this._clipboardSource = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
            if (!this._enabled || !this._expanded || this._activePage !== 'clipboard') {
                this._clipboardSource = 0;
                return GLib.SOURCE_REMOVE;
            }
            this._captureClipboard();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopClipboardTicker() {
        this._clearTimeout('_clipboardSource');
        this._clipboardInFlight = false;
    }

    _migrateLegacyData() {
        const legacyDirectory = GLib.build_filenamev([
            GLib.get_user_data_dir(),
            LEGACY_DATA_DIRECTORY,
        ]);
        const currentTasks = this._readTasksFromFile(this._taskFile);
        const legacyTasks = this._readTasksFromFile(this._legacyTaskFile);

        if (currentTasks !== null || legacyTasks !== null) {
            const useLegacy = legacyTasks !== null
                && (currentTasks === null
                    || this._getFileModifiedTime(this._legacyTaskFile)
                        >= this._getFileModifiedTime(this._taskFile));
            const tasks = useLegacy ? legacyTasks : currentTasks;
            this._writeTasksToFile(this._taskFile, tasks);
            this._writeTasksToFile(this._legacyTaskFile, tasks);
        }

        this._copyLegacyShelf(
            Gio.File.new_for_path(GLib.build_filenamev([legacyDirectory, 'shelf'])),
            Gio.File.new_for_path(this._shelfDirectory)
        );
    }

    _readTasksFromFile(path) {
        try {
            const [success, contents] = GLib.file_get_contents(path);
            if (!success)
                return null;
            const data = JSON.parse(new TextDecoder().decode(contents));
            if (!Array.isArray(data))
                return null;
            return data.filter(task => task
                && typeof task.id === 'string'
                && typeof task.text === 'string'
                && typeof task.done === 'boolean');
        } catch (_error) {
            return null;
        }
    }

    _getFileModifiedTime(path) {
        try {
            const info = Gio.File.new_for_path(path).query_info(
                'time::modified,time::modified-usec',
                Gio.FileQueryInfoFlags.NONE,
                null
            );
            const seconds = info.get_attribute_uint64('time::modified');
            const microseconds = info.get_attribute_uint32('time::modified-usec');
            return seconds * 1_000_000 + microseconds;
        } catch (_error) {
            return 0;
        }
    }

    _writeTasksToFile(path, tasks) {
        try {
            GLib.mkdir_with_parents(GLib.path_get_dirname(path), 0o755);
            GLib.file_set_contents(path, JSON.stringify(tasks));
        } catch (error) {
            logError(error, 'Perdana Island could not synchronize its task list');
        }
    }

    _copyLegacyShelf(source, destination) {
        if (!source.query_exists(null))
            return;

        try {
            GLib.mkdir_with_parents(destination.get_path(), 0o755);
            const directory = source.enumerate_children(
                'standard::name,standard::type',
                Gio.FileQueryInfoFlags.NONE,
                null
            );
            let entry;
            while ((entry = directory.next_file(null)) !== null) {
                const sourceChild = source.get_child(entry.get_name());
                const destinationChild = destination.get_child(entry.get_name());
                if (destinationChild.query_exists(null)) {
                    if (entry.get_file_type() === Gio.FileType.DIRECTORY)
                        this._copyLegacyShelf(sourceChild, destinationChild);
                    continue;
                }

                if (entry.get_file_type() === Gio.FileType.DIRECTORY) {
                    this._copyLegacyShelf(sourceChild, destinationChild);
                } else if (entry.get_file_type() === Gio.FileType.REGULAR) {
                    sourceChild.copy(destinationChild, Gio.FileCopyFlags.NONE, null, null);
                }
            }
            directory.close(null);
        } catch (error) {
            logError(error, 'Perdana Island could not migrate its Shelf files');
        }
    }

    _captureClipboard() {
        if (this._clipboardInFlight || !this._enabled || !this._expanded || this._activePage !== 'clipboard')
            return;
        try {
            const clipboard = St.Clipboard.get_default();
            const mimeTypes = clipboard.get_mimetypes(St.ClipboardType.CLIPBOARD) || [];
            if (mimeTypes.some(type => /password|secret|sensitive|credential|keepass|passphrase|token/i.test(type))) {
                this._setClipboardNotice('Password skipped');
                return;
            }
            this._clipboardInFlight = true;
            clipboard.get_text(St.ClipboardType.CLIPBOARD, (_clipboard, text) => {
                this._clipboardInFlight = false;
                if (!this._enabled || !this._expanded || this._activePage !== 'clipboard')
                    return;
                const rawValue = String(text || '').trim();
                if (isPasswordLikeClipboardText(rawValue)) {
                    this._setClipboardNotice('Password skipped');
                    return;
                }
                if (!rawValue)
                    return;
                const value = rawValue.slice(0, 1200);
                const noticeChanged = this._clipboardNotice !== null;
                this._clipboardNotice = null;
                if (this._clipboardSuppressedValue !== null) {
                    if (value === this._clipboardSuppressedValue) {
                        if (noticeChanged)
                            this._renderPanel();
                        return;
                    }
                    this._clipboardSuppressedValue = null;
                }
                if (!value || value === this._clipboardItems[0]) {
                    if (noticeChanged)
                        this._renderPanel();
                    return;
                }
                this._clipboardItems.unshift(value);
                this._clipboardItems = this._clipboardItems.slice(0, 4);
                this._saveClipboardItems();
                this._renderPanel();
            });
        } catch (_error) {
            this._clipboardInFlight = false;
        }
    }

    _setClipboardNotice(message) {
        if (this._clipboardNotice === message)
            return;
        this._clipboardNotice = message;
        if (this._enabled && this._expanded && this._activePage === 'clipboard')
            this._renderPanel();
    }

    _deleteClipboardItem(item) {
        this._clipboardItems = this._clipboardItems.filter(value => value !== item);
        this._clipboardSuppressedValue = item;
        this._saveClipboardItems();
        this._renderPanel();
    }

    _loadClipboardItems() {
        try {
            const [success, contents] = GLib.file_get_contents(this._clipboardFile);
            if (!success)
                return [];
            const data = JSON.parse(new TextDecoder().decode(contents));
            if (!Array.isArray(data))
                return [];
            const normalized = [...new Set(data
                .filter(value => typeof value === 'string')
                .map(value => value.trim().slice(0, 1200))
                .filter(Boolean))];
            const safeItems = normalized.filter(value => !isPasswordLikeClipboardText(value)).slice(0, 4);
            if (safeItems.length !== normalized.length)
                this._clipboardNotice = 'Password skipped';
            // Older extension versions may have created this file with the
            // default umask. Re-save it on load to enforce mode 0600.
            this._saveClipboardItems(safeItems);
            return safeItems;
        } catch (_error) {
            return [];
        }
    }

    _saveClipboardItems(items = this._clipboardItems) {
        try {
            GLib.mkdir_with_parents(this._taskDirectory, 0o700);
            GLib.file_set_contents(this._clipboardFile, JSON.stringify(items.slice(0, 4)));
            Gio.File.new_for_path(this._taskDirectory).set_attribute_uint32(
                'unix::mode', 0o700, Gio.FileQueryInfoFlags.NONE, null
            );
            Gio.File.new_for_path(this._clipboardFile).set_attribute_uint32(
                'unix::mode', 0o600, Gio.FileQueryInfoFlags.NONE, null
            );
        } catch (error) {
            logError(error, 'Perdana Island could not save its local clipboard history');
        }
    }

    _loadShelfItems() {
        try {
            GLib.mkdir_with_parents(this._shelfDirectory, 0o755);
            const directory = Gio.File.new_for_path(this._shelfDirectory)
                .enumerate_children(
                    'standard::name,standard::type,standard::content-type',
                    Gio.FileQueryInfoFlags.NONE,
                    null
                );
            const items = [];
            let entry;
            while ((entry = directory.next_file(null)) !== null) {
                if (entry.get_file_type() !== Gio.FileType.REGULAR)
                    continue;
                items.push({
                    name: entry.get_name(),
                    contentType: entry.get_content_type() || 'application/octet-stream',
                    path: GLib.build_filenamev([this._shelfDirectory, entry.get_name()]),
                });
            }
            directory.close(null);
            return items.sort((a, b) => a.name.localeCompare(b.name));
        } catch (_error) {
            return [];
        }
    }

    _monitorShelfDirectory() {
        try {
            GLib.mkdir_with_parents(this._shelfDirectory, 0o755);
            const directory = Gio.File.new_for_path(this._shelfDirectory);
            const monitor = directory.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
            this._shelfMonitorSignal = monitor.connect('changed', () => {
                this._clearTimeout('_shelfRefreshSource');
                this._shelfRefreshSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
                    this._shelfRefreshSource = 0;
                    if (!this._enabled)
                        return GLib.SOURCE_REMOVE;
                    this._shelfItems = this._loadShelfItems();
                    if (this._expanded && this._activePage === 'shelf')
                        this._renderPanel();
                    return GLib.SOURCE_REMOVE;
                });
            });
            return monitor;
        } catch (error) {
            logError(error, 'Perdana Island could not monitor its Shelf folder');
            return null;
        }
    }

    _chooseShelfFiles() {
        if (this._shelfChooser || !this._enabled)
            return;

        const options = {
            handle_token: new GLib.Variant('s', `perdana_island_${GLib.uuid_string_random().replaceAll('-', '')}`),
            multiple: new GLib.Variant('b', true),
        };
        Gio.DBus.session.call(
            'org.freedesktop.portal.Desktop',
            '/org/freedesktop/portal/desktop',
            'org.freedesktop.portal.FileChooser',
            'OpenFile',
            new GLib.Variant('(ssa{sv})', ['', 'Add files to Shelf', options]),
            new GLib.VariantType('(o)'),
            Gio.DBusCallFlags.NONE,
            -1,
            null,
            (_connection, result) => {
                try {
                    if (!this._enabled)
                        return;
                    [this._shelfChooserRequestPath] = Gio.DBus.session.call_finish(result).deep_unpack();
                    this._shelfChooser = Gio.DBus.session.signal_subscribe(
                        'org.freedesktop.portal.Desktop',
                        'org.freedesktop.portal.Request',
                        'Response',
                        this._shelfChooserRequestPath,
                        null,
                        Gio.DBusSignalFlags.NONE,
                        (_bus, _sender, _path, _iface, _signal, parameters) => {
                            Gio.DBus.session.signal_unsubscribe(this._shelfChooser);
                            this._shelfChooser = 0;
                            this._shelfChooserRequestPath = null;

                            const response = parameters.get_child_value(0).get_uint32();
                            if (response !== 0 || !this._enabled)
                                return;

                            const uris = parameters.get_child_value(1)
                                .lookup_value('uris', new GLib.VariantType('as'))
                                ?.deep_unpack() ?? [];
                            this._shelfItems = this._loadShelfItems();
                            const availableSlots = Math.max(0, MAX_SHELF_ITEMS - this._shelfItems.length);
                            uris.slice(0, availableSlots).forEach(uri =>
                                this._copyShelfFile(Gio.File.new_for_uri(uri)));
                            if (uris.length > availableSlots)
                                this._showShelfLimitNotice();
                            this._shelfItems = this._loadShelfItems();
                            if (this._activePage === 'shelf')
                                this._renderPanel();
                        }
                    );
                } catch (error) {
                    this._shelfChooser = 0;
                    this._shelfChooserRequestPath = null;
                    logError(error, 'Perdana Island could not open the file chooser');
                }
            }
        );
    }

    _copyShelfFile(source) {
        if (!source || !this._shelfDirectory)
            return;
        try {
            GLib.mkdir_with_parents(this._shelfDirectory, 0o755);
            const name = source.get_basename() || 'file';
            let destination = Gio.File.new_for_path(GLib.build_filenamev([this._shelfDirectory, name]));
            if (destination.query_exists(null)) {
                const stamp = Math.floor(Date.now() / 1000);
                destination = Gio.File.new_for_path(GLib.build_filenamev([
                    this._shelfDirectory, stamp + '-' + name,
                ]));
            }
            source.copy(destination, Gio.FileCopyFlags.NONE, null, null);
        } catch (error) {
            logError(error, 'Perdana Island could not copy a file to Shelf');
        }
    }

    _showShelfLimitNotice() {
        this._shelfNotice = `Shelf limit: ${MAX_SHELF_ITEMS} files`;
        this._clearTimeout('_shelfNoticeSource');
        this._shelfNoticeSource = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
            this._shelfNoticeSource = 0;
            this._shelfNotice = null;
            if (this._enabled && this._expanded && this._activePage === 'shelf')
                this._renderPanel();
            return GLib.SOURCE_REMOVE;
        });
    }

    _openShelfFile(item) {
        try {
            Gio.AppInfo.launch_default_for_uri(Gio.File.new_for_path(item.path).get_uri(), null);
        } catch (error) {
            logError(error, 'Perdana Island could not open a Shelf file');
        }
    }

    _openShelfDirectory() {
        try {
            GLib.mkdir_with_parents(this._shelfDirectory, 0o755);
            Gio.AppInfo.launch_default_for_uri(Gio.File.new_for_path(this._shelfDirectory).get_uri(), null);
        } catch (error) {
            logError(error, 'Perdana Island could not open its transfer folder');
        }
    }

    _readText(path) {
        try {
            const [success, contents] = GLib.file_get_contents(path);
            return success ? new TextDecoder().decode(contents) : '';
        } catch (_error) {
            return '';
        }
    }

    _readBatteryState() {
        let battery = null;
        let chargerConnected = false;
        let chargerStateKnown = false;
        try {
            const directory = Gio.File.new_for_path('/sys/class/power_supply')
                .enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
            let entry;
            while ((entry = directory.next_file(null)) !== null) {
                const name = entry.get_name();
                const base = `/sys/class/power_supply/${name}`;
                const type = this._readText(`${base}/type`).trim();
                if (/^BAT/i.test(name)) {
                    const percent = Number(this._readText(`${base}/capacity`).trim());
                    if (Number.isFinite(percent)) {
                        battery = {
                            percent: Math.max(0, Math.min(100, percent)),
                            status: this._readText(`${base}/status`).trim(),
                        };
                    }
                } else if (/^(Mains|USB|USB_C|USB_PD|Wireless)$/i.test(type)) {
                    const online = this._readText(`${base}/online`).trim();
                    if (online !== '') {
                        chargerStateKnown = true;
                        chargerConnected ||= online === '1';
                    }
                }
            }
            directory.close(null);
        } catch (_error) {
            // Power supply details are optional on desktops and unsupported devices.
        }
        if (!chargerStateKnown && battery?.status === 'Charging')
            chargerConnected = true;
        if (!battery)
            return null;
        let status = battery.status;
        if (chargerStateKnown) {
            if (chargerConnected && ['Discharging', 'Unknown', ''].includes(status))
                status = 'Charging';
            else if (!chargerConnected && status === 'Charging')
                status = 'Discharging';
        }
        return {...battery, status, connected: chargerConnected};
    }

    _pollChargingState() {
        const next = this._readBatteryState();
        const wasConnected = Boolean(this._batteryState?.connected);
        if (!next)
            return;
        this._batteryState = next;
        if (!wasConnected && next.connected)
            this._showChargingNotice(next.percent);
        else if (wasConnected && !next.connected)
            this._showChargerDisconnectedNotice(next.percent);
        if (this._expanded && this._activePage === 'today')
            this._updateTodayMetrics();
    }

    _showChargingNotice(percent) {
        if (this._preferences.systemNotices)
            this._showSystemNotice('charging', {percent});
    }

    _showChargerDisconnectedNotice(percent) {
        if (this._preferences.systemNotices)
            this._showSystemNotice('disconnected', {percent});
    }

    _paintPowerIndicator(area, percent, charging) {
        const [surfaceWidth, surfaceHeight] = area.get_surface_size();
        if (surfaceWidth <= 0 || surfaceHeight <= 0 || area.width <= 0 || area.height <= 0)
            return;
        const cr = area.get_context();
        cr.scale(surfaceWidth / area.width, surfaceHeight / area.height);
        const width = area.width;
        const height = area.height;
        const level = Math.max(0, Math.min(100, Number(percent) || 0)) / 100;

        if (charging) {
            const cx = width / 2;
            const cy = height / 2;
            const lineWidth = 3;
            const radius = Math.min(width, height) / 2 - lineWidth / 2 - 1;
            cr.setLineWidth(lineWidth);
            cr.setLineCap(1);
            cr.setSourceRGBA(0.45, 0.49, 0.55, 0.58);
            cr.arc(cx, cy, radius, 0, Math.PI * 2);
            cr.stroke();
            if (level > 0) {
                cr.setSourceRGBA(0.21, 0.85, 0.55, 1);
                cr.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * level);
                cr.stroke();
            }

            cr.setSourceRGBA(1, 1, 1, 1);
            cr.moveTo(width * 0.58, height * 0.13);
            cr.lineTo(width * 0.29, height * 0.53);
            cr.lineTo(width * 0.48, height * 0.53);
            cr.lineTo(width * 0.40, height * 0.88);
            cr.lineTo(width * 0.72, height * 0.43);
            cr.lineTo(width * 0.53, height * 0.43);
            cr.closePath();
            cr.fill();
        } else {
            const left = width * 0.16;
            const top = height * 0.30;
            const bodyRight = width * 0.78;
            const bottom = height * 0.70;
            const capRight = width * 0.88;
            const capTop = height * 0.41;
            const capBottom = height * 0.59;
            const inset = width * 0.08;
            const innerWidth = Math.max(0, (bodyRight - left - inset * 2) * level);
            cr.setSourceRGBA(0.76, 0.79, 0.84, 0.28);
            cr.rectangle(left + inset, top + inset, bodyRight - left - inset * 2, bottom - top - inset * 2);
            cr.fill();
            if (innerWidth > 0) {
                cr.setSourceRGBA(0.76, 0.79, 0.84, 0.94);
                cr.rectangle(left + inset, top + inset, innerWidth, bottom - top - inset * 2);
                cr.fill();
            }
            cr.setLineWidth(1.8);
            cr.setLineJoin(1);
            cr.setSourceRGBA(0.88, 0.90, 0.93, 0.95);
            cr.moveTo(left, top);
            cr.lineTo(bodyRight, top);
            cr.lineTo(bodyRight, capTop);
            cr.lineTo(capRight, capTop);
            cr.lineTo(capRight, capBottom);
            cr.lineTo(bodyRight, capBottom);
            cr.lineTo(bodyRight, bottom);
            cr.lineTo(left, bottom);
            cr.closePath();
            cr.stroke();
        }
        cr.$dispose();
    }

    _syncVolumeStream() {
        if (!this._volumeControl)
            return;

        const ready = this._volumeControl.get_state() === Gvc.MixerControlState.READY;
        const stream = ready ? this._volumeControl.get_default_sink() : null;
        if (stream === this._volumeStream)
            return;

        this._volumeStream?.disconnectObject(this);
        this._volumeStream = stream;
        if (stream) {
            stream.connectObject(
                'notify::volume', () => this._onVolumeStreamChanged(stream),
                'notify::is-muted', () => this._onVolumeStreamChanged(stream),
                this
            );
        }
    }

    _onVolumeStreamChanged(stream) {
        if (!this._enabled || stream !== this._volumeStream || !this._volumeControl)
            return;

        const muted = stream.is_muted || stream.volume <= 0;
        const normalVolume = Math.max(1, this._volumeControl.get_vol_max_norm());
        const level = stream.volume / normalVolume * 100;
        const percent = muted || !Number.isFinite(level) ? 0 : Math.round(level);
        this._showSystemNotice('volume', {percent, muted});
    }

    _showFocusCompleteNotice(mode, duration) {
        const focusSession = mode === 'focus' || mode === 'custom';
        const data = {
            title: focusSession ? 'Focus complete' : 'Break complete',
            subtitle: `${this._focusModeLabel(mode)} session finished`,
            duration,
        };
        this._clearTimeout('_focusNoticeSource');
        if (this._expanded)
            this._pinned = false;
        if (this._expanded)
            this._setExpanded(false);
        if (this._closing) {
            this._focusNoticeSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 620, () => {
                this._focusNoticeSource = 0;
                if (this._enabled && !this._expanded)
                    this._showSystemNotice('focus', data);
                return GLib.SOURCE_REMOVE;
            });
            return;
        }
        this._showSystemNotice('focus', data);
    }

    _showSystemNotice(type, data) {
        if (!this._enabled || !this._root || this._userHidden || this._expanded || !this._preferences.systemNotices)
            return;
        const sameNotice = this._systemNoticeActive && this._systemNoticeType === type;
        this._clearTimeout('_noticeDismissSource');
        this._systemNoticeActive = true;
        this._systemNoticeType = type;
        this._noticeNotificationItem = type === 'application' ? data : null;

        const duration = type === 'volume' ? 2 : type === 'focus' || type === 'application' ? 4 : 3;
        this._noticeDismissSource = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, duration, () => {
            this._noticeDismissSource = 0;
            this._dismissSystemNotice(true);
            return GLib.SOURCE_REMOVE;
        });

        try {
            if (!sameNotice) {
                this._noticeBanner?.destroy();
                this._root.remove_all_transitions();
                this._root.add_style_class_name('perdana-island--notice');
                this._content.hide();
                this._noticeBanner = new St.BoxLayout({
                    style_class: 'perdana-island__notice-banner',
                    reactive: type === 'application',
                });
                this._noticeBanner.set_position(0, 0);
                this._noticeBanner.set_size(394, 76);
                this._noticeBanner.opacity = 0;
                if (type === 'application') {
                    this._noticeBanner.connect('button-release-event', () => {
                        const item = this._noticeNotificationItem;
                        if (!item)
                            return Clutter.EVENT_STOP;
                        try {
                            item.notification.activate();
                        } catch (_error) {
                            item.source.open();
                        }
                        this._dismissSystemNotice(true);
                        return Clutter.EVENT_STOP;
                    });
                }

                const powerNotice = type === 'charging' || type === 'disconnected';
                this._noticeIcon = powerNotice
                    ? new St.DrawingArea({
                        y_align: Clutter.ActorAlign.CENTER,
                        style_class: 'perdana-island__power-indicator',
                    })
                    : new St.Widget({
                        layout_manager: new Clutter.BinLayout(),
                        y_align: Clutter.ActorAlign.CENTER,
                        style_class: 'perdana-island__notice-icon-wrap',
                    });
                this._noticeIcon.set_size(28, 28);
                if (powerNotice) {
                    this._noticeIcon.connect('repaint', area => this._paintPowerIndicator(
                        area,
                        area._perdanaPercent,
                        area._perdanaCharging
                    ));
                } else {
                    this._noticeVolumeIcon = new St.Icon({
                        style_class: 'perdana-island__notice-icon',
                        fallback_icon_name: 'application-x-executable-symbolic',
                    });
                    this._noticeIcon.add_child(this._noticeVolumeIcon);
                }
                this._noticeBanner.add_child(this._noticeIcon);

                this._noticeCopy = new St.BoxLayout({
                    vertical: true,
                    x_expand: true,
                    y_align: Clutter.ActorAlign.CENTER,
                    style_class: 'perdana-island__notice-copy',
                });
                this._noticeTitle = makeLabel('', 'perdana-island__notice-title');
                this._noticeSubtitle = makeLabel('', 'perdana-island__notice-subtitle');
                this._noticeCopy.add_child(this._noticeTitle);
                this._noticeCopy.add_child(this._noticeSubtitle);
                this._noticeBanner.add_child(this._noticeCopy);

                this._noticeRight = null;
                this._noticePercent = null;
                this._noticeVolumeTrack = null;
                this._noticeVolumeFill = null;
                if (type !== 'application') {
                    this._noticeRight = new St.BoxLayout({
                        vertical: true,
                        y_align: Clutter.ActorAlign.CENTER,
                        style_class: 'perdana-island__notice-right',
                    });
                    this._noticePercent = makeLabel('', 'perdana-island__notice-percent');
                    this._noticePercent.set_size(type === 'volume' ? 84 : 72, 36);
                    this._noticeRight.add_child(this._noticePercent);
                    if (type === 'volume') {
                        this._noticeVolumeTrack = new St.Widget({
                            layout_manager: new Clutter.FixedLayout(),
                            style_class: 'perdana-island__volume-track',
                        });
                        this._noticeVolumeTrack.set_size(84, 4);
                        this._noticeVolumeFill = new St.Widget({style_class: 'perdana-island__volume-fill'});
                        place(this._noticeVolumeTrack, this._noticeVolumeFill, 0, 0, 0, 4);
                        this._noticeRight.add_child(this._noticeVolumeTrack);
                    }
                    this._noticeBanner.add_child(this._noticeRight);
                }

                this._root.add_child(this._noticeBanner);
                this._root.ease({
                    width: 394,
                    height: 76,
                    duration: this._motionDuration(300),
                    mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                    onComplete: () => this._layoutIsland(),
                });
                this._layoutIsland();
                this._noticeBanner.ease({
                    opacity: 255,
                    duration: this._motionDuration(150),
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            }

            if (type === 'charging' || type === 'disconnected') {
                const percent = Math.max(0, Math.min(100, Number(data.percent) || 0));
                const charging = type === 'charging';
                this._noticeTitle.text = charging ? 'Charging' : 'Charger disconnected';
                this._noticeSubtitle.text = charging ? 'Charger connected' : 'Running on battery';
                this._noticePercent.text = `${percent}%`;
                this._noticeIcon._perdanaPercent = percent;
                this._noticeIcon._perdanaCharging = charging;
                this._noticeIcon.queue_repaint();
            } else if (type === 'volume') {
                const percent = Math.max(0, Math.min(200, data.percent));
                this._noticeTitle.text = 'Volume';
                this._noticeSubtitle.text = data.muted ? 'Muted' : 'Output volume';
                this._noticePercent.text = `${percent}%`;
                this._noticeVolumeIcon.icon_name = data.muted
                    ? 'audio-volume-muted-symbolic'
                    : percent < 34 ? 'audio-volume-low-symbolic'
                        : percent < 67 ? 'audio-volume-medium-symbolic'
                            : percent <= 100 ? 'audio-volume-high-symbolic'
                                : 'audio-volume-overamplified-symbolic';
                this._noticeVolumeFill.width = 84 * Math.min(100, percent) / 100;
            } else if (type === 'application') {
                const identity = `${data.app} ${data.title}`;
                const brand = /whatsapp/i.test(identity) ? 'WhatsApp'
                    : /discord/i.test(identity) ? 'Discord' : data.app;
                const brandIcon = brand === 'WhatsApp' ? 'whatsapp'
                    : brand === 'Discord' ? 'discord' : null;
                this._noticeTitle.text = brand;
                this._noticeSubtitle.text = data.body
                    ? `${data.title} · ${data.body}` : data.title;
                this._noticeVolumeIcon.gicon = brandIcon
                    ? Gio.ThemedIcon.new(brandIcon)
                    : data.notification.gicon || data.source.icon
                        || data.source.app?.get_icon?.() || Gio.ThemedIcon.new('application-x-executable-symbolic');
                this._noticeVolumeIcon.fallback_gicon = data.notification.gicon
                    || data.source.icon || data.source.app?.get_icon?.()
                    || Gio.ThemedIcon.new('application-x-executable-symbolic');
            } else {
                this._noticeTitle.text = data.title;
                this._noticeSubtitle.text = data.subtitle;
                this._noticePercent.text = formatTime(data.duration);
                this._noticePercent.add_style_class_name('perdana-island__notice-time');
                this._noticeVolumeIcon.icon_name = 'alarm-symbolic';
            }
        } catch (error) {
            logError(error, 'Perdana Island could not render a system notice');
        }
    }

    _dismissSystemNotice(animate = true) {
        this._clearTimeout('_noticeDismissSource');
        if (!this._systemNoticeActive)
            return;
        this._systemNoticeActive = false;
        this._systemNoticeType = null;
        this._noticeNotificationItem = null;
        const noticeBanner = this._noticeBanner;
        this._root?.remove_style_class_name('perdana-island--notice');
        if (!this._root || !this._content)
            return;
        this._content.show();
        this._compactButton.show();
        this._header.hide();
        this._panel.hide();
        this._root.remove_all_transitions();
        if (animate) {
            noticeBanner?.ease({
                opacity: 0,
                duration: this._motionDuration(170),
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
            });
            this._root.ease({
                width: this._collapsedWidth(),
                height: this._collapsedHeight(),
                duration: this._motionDuration(220),
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                onComplete: () => {
                    if (noticeBanner?.get_parent())
                        noticeBanner.destroy();
                    if (this._noticeBanner === noticeBanner)
                        this._noticeBanner = null;
                    this._layoutIsland();
                    if (!this._systemNoticeActive)
                        this._updateCollapsedLabel();
                },
            });
        } else {
            noticeBanner?.destroy();
            if (this._noticeBanner === noticeBanner)
                this._noticeBanner = null;
            this._root.set_size(this._collapsedWidth(), this._collapsedHeight());
            this._layoutIsland();
            this._updateCollapsedLabel();
        }
    }

    _updateTodayMetrics() {
        if (!this._todayTiles?.length)
            return;

        const cpuLine = this._readText('/proc/stat').split('\n').find(line => /^cpu\s/.test(line));
        if (cpuLine) {
            // Linux reports guest and guest_nice separately, but those ticks are
            // already included in user and nice. Exclude them from the total.
            const ticks = cpuLine.trim().split(/\s+/).slice(1, 9).map(Number);
            const total = ticks.reduce((sum, value) => sum + value, 0);
            const idle = (ticks[3] || 0) + (ticks[4] || 0);
            if (this._cpuTicks) {
                const totalDelta = total - this._cpuTicks.total;
                const idleDelta = idle - this._cpuTicks.idle;
                if (totalDelta > 0) {
                    this._cpuPercent = Math.min(100, Math.max(0,
                        Math.round(100 * (1 - idleDelta / totalDelta))));
                }
            }
            this._cpuTicks = {total, idle};
        }

        const meminfo = this._readText('/proc/meminfo');
        const totalKiB = Number(meminfo.match(/^MemTotal:\s+(\d+)/m)?.[1]) || 0;
        const availableKiB = Number(meminfo.match(/^MemAvailable:\s+(\d+)/m)?.[1]) || 0;
        const usedKiB = Math.max(0, totalKiB - availableKiB);

        let diskTotal = 0;
        let diskFree = 0;
        try {
            const info = Gio.File.new_for_path(GLib.get_home_dir())
                .query_filesystem_info('filesystem::size,filesystem::free', null);
            diskTotal = Number(info.get_attribute_uint64('filesystem::size')) || 0;
            diskFree = Number(info.get_attribute_uint64('filesystem::free')) || 0;
        } catch (_error) {
            // Some filesystems do not expose space metrics through GIO.
        }

        const battery = this._readBatteryState();

        const gb = bytes => (bytes / 1_073_741_824).toFixed(1);
        const values = {
            cpu: this._cpuPercent === null
                ? {value: '—', detail: 'Sampling processor', progress: 0}
                : {value: `${this._cpuPercent}%`, detail: 'Processor use', progress: this._cpuPercent / 100},
            memory: totalKiB
                ? {value: `${Math.round(usedKiB / totalKiB * 100)}%`, detail: `${gb(usedKiB * 1024)} / ${gb(totalKiB * 1024)} GB`, progress: usedKiB / totalKiB}
                : {value: '—', detail: 'Memory unavailable', progress: 0},
            disk: diskTotal
                ? {value: `${gb(diskFree)} GB`, detail: `free of ${gb(diskTotal)} GB`, progress: 1 - diskFree / diskTotal}
                : {value: '—', detail: 'Storage unavailable', progress: 0},
            battery: battery
                ? {
                    value: `${battery.percent}%`,
                    detail: battery.connected ? (battery.status === 'Full' ? 'Plugged in' : 'Charging')
                        : battery.status || 'Discharging',
                    progress: battery.percent / 100,
                }
                : {value: '—', detail: 'No battery detected', progress: 0},
        };

        for (const tile of this._todayTiles) {
            const value = values[tile.key];
            tile.value.text = value.value;
            tile.detail.text = value.detail;
            tile.ring._perdanaProgress = value.progress;
            tile.ring.queue_repaint();
        }
    }

    _clearDoneTasks() {
        this._tasks = this._tasks.filter(task => !task.done);
        this._saveTasks();
        this._renderPanel();
    }

    _addTask(text) {
        const trimmed = text.trim().slice(0, 120);
        if (!trimmed)
            return;
        this._tasks.push({id: GLib.uuid_string_random(), text: trimmed, done: false});
        this._saveTasks();
        this._renderPanel();
    }

    _toggleTask(id) {
        this._tasks = this._tasks.map(task => task.id === id
            ? {...task, done: !task.done}
            : task);
        this._saveTasks();
        this._renderPanel();
    }

    _removeTask(id) {
        this._tasks = this._tasks.filter(task => task.id !== id);
        this._saveTasks();
        this._renderPanel();
    }

    _loadTasks() {
        return this._readTasksFromFile(this._taskFile) ?? [];
    }

    _saveTasks() {
        this._writeTasksToFile(this._taskFile, this._tasks);
        this._writeTasksToFile(this._legacyTaskFile, this._tasks);
    }

    _clearTimeout(property) {
        if (this[property]) {
            GLib.source_remove(this[property]);
            this[property] = 0;
        }
    }
}
