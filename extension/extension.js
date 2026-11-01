// SPDX-License-Identifier: GPL-3.0-or-later

import Clutter from 'gi://Clutter';
import Cairo from 'cairo';
import Gdk from 'gi://Gdk?version=4.0';
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
import {
    areClipboardHistoryValuesEqual,
    isPasswordLikeClipboardText,
    isSensitiveClipboardMimeType,
    maskClipboardPreview,
    normalizeClipboardHistoryKey,
} from './clipboard-utils.js';
import {classifyMedia} from './music-classifier.js';
import {parseCapture} from './quick-capture.js';
import {buildBackup, backupFileName, validateBackup, summarizeBackup} from './backup-utils.js';
import {
    aria2TotalLength,
    cleanActivityIcon,
    cleanActivityId,
    cleanActivityText,
    downloadTitle,
    formatActivityDetail,
    formatActivityValue,
    formatBytes,
    isAria2Control,
    normalizeProgress,
    partialSuffix,
    selectActivity,
} from './progress-utils.js';

const MPRIS_PREFIX = 'org.mpris.MediaPlayer2.';
const MPRIS_PATH = '/org/mpris/MediaPlayer2';
const MPRIS_PLAYER_IFACE = 'org.mpris.MediaPlayer2.Player';
const MUTTER_DISPLAY_CONFIG = 'org.gnome.Mutter.DisplayConfig';
const MUTTER_DISPLAY_CONFIG_PATH = '/org/gnome/Mutter/DisplayConfig';
const DEFAULT_FOCUS_SECONDS = 25 * 60;
const DEFAULT_BREAK_SECONDS = 5 * 60;
const DEFAULT_ACCENT_COLOR = '#5577B8';
const FONT_FAMILIES = ['cantarell', 'noto-sans', 'plus-jakarta-sans'];
const AGENDA_BRIEFING_MINUTES = 8 * 60;
const AGENDA_RECAP_MINUTES = 17 * 60;
const TASK_PRIORITIES = ['high', 'medium', 'low'];
const CLIPBOARD_LIMIT = 25;
const TASK_PRIORITY_LABELS = {high: 'High', medium: 'Med', low: 'Low'};
const FOCUS_DISTRACTIONS = [
    ['youtube', 'YouTube'],
    ['netflix', 'Netflix'],
    ['twitch', 'Twitch'],
    ['tiktok', 'TikTok'],
    ['instagram', 'Instagram'],
    ['facebook', 'Facebook'],
    ['reddit', 'Reddit'],
    ['x.com', 'X'],
    ['twitter', 'X'],
];
const FOCUS_GUARD_SECONDS = 5 * 60;
const WATER_REMINDER_SECONDS = 60 * 60;
const WATER_WINDOW_START = 8 * 60;
const WATER_WINDOW_END = 21 * 60;
const PRAYER_NAMES = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const PRAYER_METHODS = [[20, 'Kemenag'], [3, 'MWL'], [2, 'ISNA'], [4, 'Umm al-Qura']];
const DEFAULT_THEME = 'midnight';
const MAX_SHELF_ITEMS = 10;
const MAX_NOTES = 60;
const MAX_LYRIC_LINES = 500;
const MAX_LYRIC_SOURCE_LENGTH = 100000;
const VISIBLE_LYRIC_CONTEXT = 4;
const NOTE_MAX_CHARS = 12000;
const NOTE_AUTOSAVE_MS = 600;
const NOTE_UNDO_MS = 7000;
const DEFAULT_NOTIFICATION_SOURCES = {
    whatsapp: true,
    discord: true,
    telegramWeb: true,
    telegramDesktop: true,
    googleChat: true,
    'browser-edge': true,
    'browser-chrome': true,
    'browser-firefox': true,
    'browser-brave': true,
    'browser-opera': true,
    'browser-vivaldi': true,
    software: true,
    calendar: true,
    battery: true,
    downloads: true,
};
const CHAT_SOURCE_OPTIONS = [
    ['whatsapp', 'WhatsApp Web', 'whatsapp'],
    ['discord', 'Discord', 'discord'],
    ['telegramWeb', 'Telegram Web', 'telegram'],
    ['telegramDesktop', 'Telegram Desktop', 'telegram'],
    ['googleChat', 'Google Chat', 'google-chat'],
];
const SYSTEM_SOURCE_OPTIONS = [
    ['software', 'Software updates', 'system-software-update-symbolic'],
    ['calendar', 'Calendar', 'x-office-calendar-symbolic'],
    ['battery', 'Battery and charger', 'battery-symbolic'],
    ['downloads', 'Downloads', 'folder-download-symbolic'],
];
const NOTIFICATION_SOURCE_OPTIONS = [
    ['whatsapp', 'WhatsApp Web', 'whatsapp'],
    ['discord', 'Discord', 'discord'],
    ['telegramWeb', 'Telegram Web', 'telegram'],
    ['telegramDesktop', 'Telegram Desktop', 'telegram'],
    ['googleChat', 'Google Chat', 'google-chat'],
    ['browser-edge', 'Microsoft Edge', 'web-browser-symbolic'],
    ['browser-chrome', 'Google Chrome', 'web-browser-symbolic'],
    ['browser-firefox', 'Firefox', 'web-browser-symbolic'],
    ['browser-brave', 'Brave', 'web-browser-symbolic'],
    ['browser-opera', 'Opera', 'web-browser-symbolic'],
    ['browser-vivaldi', 'Vivaldi', 'web-browser-symbolic'],
];
// Idle (8) and suspend (4) inhibitors from org.gnome.SessionManager.
const KEEP_AWAKE_FLAGS = 12;
const MICROSECONDS_PER_SECOND = 1_000_000;
const LEGACY_DATA_DIRECTORY = 'pulo-island';
const COLLAPSED_WIDTH = 150;
const PLAYING_WIDTH = 236;
const RESTING_LYRICS_WIDTH = 460;
const COLLAPSED_HEIGHT = 38;
const RESTING_LYRICS_HEIGHT = 64;
const ISLAND_EAR_SIZE = 12;
const CONTENT_WIDTH = 460;
// Open widths, same as the preview's --open-width for each page
const PAGE_WIDTHS = {
    summary: 720,
    media: 720,
    lyrics: 740,
    focus: 680,
    shelf: 640,
    tasks: 600,
    notes: 840,
    messages: 600,
    today: 900,
    reminders: 600,
    notifications: 560,
    settings: 1160,
};
const OPEN_HEIGHT = 256;
const HEADER_HEIGHT = 42;
const TABBAR_HEIGHT = 46;
const DRAG_THRESHOLD = 10;
const EDGE_SNAP_DISTANCE = 44;
const POSITION_MODES = ['top', 'bottom', 'left', 'right', 'free'];
const PAGE_INSET = 28;
const MEDIA_ART_SIZE = 58;
const MEDIA_COPY_GAP = 22;
const MEDIA_COPY_RIGHT_INSET = 38;
const PAGES = [
    {key: 'summary', label: 'Summary', icon: 'view-grid-symbolic'},
    {key: 'media', label: 'Music', icon: 'audio-x-generic-symbolic'},
    {key: 'lyrics', label: 'Lyrics', icon: 'text-x-generic-symbolic'},
    {key: 'focus', label: 'Focus', icon: 'alarm-symbolic'},
    {key: 'shelf', label: 'Shelf', icon: 'folder-symbolic'},
    {key: 'tasks', label: 'To-do', icon: 'checkbox-checked-symbolic'},
    {key: 'messages', label: 'Messages', icon: 'chat-message-new-symbolic'},
    {key: 'notes', label: 'Notes', icon: 'accessories-text-editor-symbolic'},
    {key: 'today', label: 'Today', icon: 'x-office-calendar-symbolic'},
    {key: 'reminders', label: 'Reminders', icon: 'appointment-soon-symbolic'},
    {key: 'notifications', label: 'Notifications', icon: 'preferences-system-notifications-symbolic'},
    {key: 'settings', label: 'Settings', icon: 'preferences-system-symbolic'},
];
const PAGE_KEYS = new Set(PAGES.map(page => page.key));
const ACTIVITY_DBUS_NAME = 'org.perdana.Island';
const ACTIVITY_DBUS_PATH = '/org/perdana/Island';
const ACTIVITY_DBUS_XML = `
<node>
  <interface name="org.perdana.Island">
    <method name="StartActivity">
      <arg type="s" name="id" direction="in"/>
      <arg type="s" name="title" direction="in"/>
      <arg type="s" name="subtitle" direction="in"/>
      <arg type="d" name="progress" direction="in"/>
      <arg type="s" name="icon" direction="in"/>
    </method>
    <method name="UpdateActivity">
      <arg type="s" name="id" direction="in"/>
      <arg type="d" name="progress" direction="in"/>
      <arg type="s" name="subtitle" direction="in"/>
    </method>
    <method name="FinishActivity">
      <arg type="s" name="id" direction="in"/>
      <arg type="b" name="success" direction="in"/>
    </method>
    <method name="ListActivities">
      <arg type="s" name="activities" direction="out"/>
    </method>
    <signal name="ActivityChanged"/>
  </interface>
</node>`;
const ACTIVITY_LIMIT = 32;
const APP_ACTIVITY_EXPIRY_MS = 4500;
// Chat apps belong on Messages; every other source stays on Notifications (as in the preview).
const CHAT_SOURCE_KEYS = new Set(['whatsapp', 'discord', 'telegramWeb', 'telegramDesktop', 'googleChat']);
const isChatItem = item => CHAT_SOURCE_KEYS.has(item?.appKey);

// Tab order, same as the preview. 'media' and 'clipboard' are reached from Summary and Shelf,
// so they are not part of the tab bar order.
const TAB_BAR_KEYS = ['summary', 'lyrics', 'focus', 'tasks', 'notes', 'shelf', 'messages', 'notifications', 'today', 'reminders', 'settings'];

function normalizeTabOrder(value) {
    const order = [];
    for (const key of Array.isArray(value) ? value : []) {
        if (TAB_BAR_KEYS.includes(key) && !order.includes(key))
            order.push(key);
    }
    for (const key of TAB_BAR_KEYS) {
        if (!order.includes(key))
            order.push(key);
    }
    return order;
}

function clampUnit(value, fallback = 0) {
    const number = Number(value);
    if (!Number.isFinite(number))
        return fallback;
    return Math.min(1, Math.max(0, number));
}
const THEMES = [
    {
        key: 'midnight',
        label: 'Midnight',
        dot: '#3A3D44',
        opaque: true,
        radius: 0,
        gloss: 0,
        border: null,
        fill: [[0, 0, 0, 0, 1], [1, 0, 0, 0, 1]],
        glassFill: [[0, 0.08, 0.12, 0.2, 0.38], [1, 0.04, 0.08, 0.15, 0.58]],
    },
    {
        key: 'aero',
        label: 'Aero',
        dot: '#3F7FBF',
        opaque: false,
        radius: 2,
        gloss: 0.14,
        border: [1, 1, 1, 0.34],
        fill: [[0, 0.15, 0.31, 0.5, 0.94], [1, 0.04, 0.11, 0.22, 0.96]],
        glassFill: [[0, 0.16, 0.33, 0.52, 0.82], [1, 0.05, 0.13, 0.25, 0.9]],
    },
    {
        key: 'aqua',
        label: 'Aqua',
        dot: '#B8BEC9',
        opaque: false,
        radius: 6,
        gloss: 0.08,
        border: [1, 1, 1, 0.16],
        fill: [[0, 0.2, 0.2, 0.22, 0.86], [1, 0.09, 0.09, 0.11, 0.94]],
        glassFill: [[0, 0.22, 0.22, 0.25, 0.72], [1, 0.1, 0.1, 0.12, 0.86]],
    },
    {
        key: 'yaru',
        label: 'Yaru',
        dot: '#8E3A7E',
        opaque: false,
        radius: 0,
        gloss: 0.12,
        border: [1, 1, 1, 0.12],
        fill: [[0, 0.24, 0.05, 0.2, 0.9], [1, 0.13, 0.02, 0.1, 0.95]],
        glassFill: [[0, 0.26, 0.06, 0.22, 0.8], [1, 0.14, 0.03, 0.11, 0.9]],
    },
    {
        key: 'graphite',
        label: 'Graphite',
        dot: '#565C66',
        opaque: true,
        radius: -5,
        gloss: 0.05,
        border: [1, 1, 1, 0.1],
        fill: [[0, 0.15, 0.16, 0.18, 1], [1, 0.1, 0.11, 0.13, 1]],
        glassFill: [[0, 0.18, 0.19, 0.22, 0.72], [1, 0.12, 0.13, 0.15, 0.86]],
    },
];

function taskScheduleKey(task) {
    return task?.dueDate
        ? `${task.dueDate} ${Number.isInteger(task.due) ? String(task.due).padStart(4, '0') : '9999'}`
        : '9999-99-99 9999';
}

function distractionLabel(identity) {
    const text = String(identity || '').toLowerCase();
    if (!text)
        return null;
    for (const [needle, label] of FOCUS_DISTRACTIONS) {
        if (needle.includes('.')) {
            const pattern = new RegExp(`(^|[^a-z0-9])${needle.replace(/\./g, '\\.')}($|[^a-z0-9])`);
            if (pattern.test(text))
                return label;
        } else if (text.includes(needle)) {
            return label;
        }
    }
    return null;
}

function splitCity(value) {
    const text = String(value || '').trim();
    if (!text)
        return ['', 'Indonesia'];
    const [city, ...rest] = text.split(',');
    const country = rest.join(',').trim();
    return [city.trim(), country || 'Indonesia'];
}

function unpack(value) {
    return value instanceof GLib.Variant ? value.deep_unpack() : value;
}

function formatTime(totalSeconds) {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function dateKey(date = new Date()) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

function parseClockTime(value) {
    const match = String(value || '').trim().match(/^(\d{1,2})[:.](\d{2})$/);
    if (!match)
        return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59)
        return null;
    return hours * 60 + minutes;
}

function formatClockTime(minutes) {
    const value = Math.max(0, Math.min(1439, Math.round(Number(minutes) || 0)));
    return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
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
    attachButtonMotion(button, {hoverScale: 1.07, pressScale: 0.93});
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
    attachButtonMotion(button);
    return button;
}

function place(parent, actor, x, y, width, height) {
    actor.set_position(x, y);
    actor.set_size(width, height);
    parent.add_child(actor);
    return actor;
}

function animationsEnabled() {
    try {
        return Boolean(St.Settings.get().enable_animations);
    } catch (_error) {
        return true;
    }
}

function attachButtonMotion(button, {hoverScale = 1.035, pressScale = 0.955} = {}) {
    if (!button || button._perdanaMotionAttached)
        return button;
    button._perdanaMotionAttached = true;
    const scaleTo = (value, duration, mode) => {
        button.remove_all_transitions();
        if (!animationsEnabled()) {
            button.set_scale(value, value);
            return;
        }
        button.ease({
            scale_x: value,
            scale_y: value,
            duration,
            mode,
        });
    };
    button.connect('notify::hover', () => {
        if (button._perdanaPressed)
            return;
        scaleTo(button.hover ? hoverScale : 1, 180,
            Clutter.AnimationMode.EASE_OUT_CUBIC);
    });
    button.connect('notify::pressed', () => {
        button._perdanaPressed = Boolean(button.pressed);
        if (button.pressed) {
            scaleTo(pressScale, 90, Clutter.AnimationMode.EASE_OUT_QUAD);
        } else {
            scaleTo(button.hover ? hoverScale : 1, 240,
                Clutter.AnimationMode.EASE_OUT_BACK);
        }
    });
    return button;
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
    attachButtonMotion(button);
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
        this._pageTransitionUntil = 0;
        this._pageTransitionDirection = 1;
        this._tabDrag = null;
        this._tabDragSuppressUntil = 0;
        this._islandDrag = null;
        this._islandClickSuppressUntil = 0;
        this._positionAnimating = false;
        this._mediaPositionLabel = null;
        this._mediaDurationLabel = null;
        this._progressTrack = null;
        this._progressLine = null;
        this._progressFill = null;
        this._mediaEqualizer = null;
        this._summaryMediaBody = null;
        this._summaryMediaEmpty = null;
        this._summaryTitle = null;
        this._summaryArtist = null;
        this._summaryLyric = null;
        this._summaryIconActors = [];
        this._shelfClipboardCountLabel = null;
        this._shelfFilesCountLabel = null;
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
        this._lyricsWindowStart = -1;
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
        this._clipboardInFlight = false;
        this._clipboardSelection = null;
        this._clipboardOwnerChangedSignal = 0;
        this._clipboardPollSource = 0;
        this._clipboardRequestGeneration = 0;
        this._clipboardRequestTimeoutSource = 0;
        this._clipboardReadFailed = false;
        this._shelfClipboardCountLabel = null;
        this._shelfFilesCountLabel = null;
        this._summaryMediaBody = null;
        this._summaryMediaEmpty = null;
        this._summaryTitle = null;
        this._summaryArtist = null;
        this._summaryLyric = null;
        this._summaryIconActors = [];
        this._summaryRows = {};
        this._shelfItems = [];
        this._shelfNotice = null;
        this._shelfNoticeSource = 0;
        this._taskTextEntry = null;
        this._taskTimeEntry = null;
        this._taskDraftText = '';
        this._taskDraftDueText = '';
        this._taskDraftPriority = null;
        this._reportCopied = false;
        this._reportCopiedSource = 0;
        this._shelfSegment = 'files';
        this._screenshotRequest = false;
        this._screenshotSubscription = 0;
        this._screenshotTimeout = 0;
        this._prayerCache = null;
        this._prayerSession = null;
        this._prayerCancellable = null;
        this._prayerFetching = false;
        this._prayerError = null;
        this._prayerRetryAt = 0;
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
        this._focusGuardSeconds = 0;
        this._focusGuardNotified = false;
        this._focusGuardTick = 0;
        this._focusCustomEntry = null;
        this._focusCustomUnitButton = null;
        this._focusCustomUnitLabel = null;
        this._focusCompact = null;
        this._focusCompactLabel = null;
        this._focusCompactTime = null;
        this._settingsSection = 'island';
        this._clockSource = 0;
        this._mediaSource = 0;
        this._mediaTickerInterval = 0;
        this._restingLyricsSource = 0;
        this._todaySource = 0;
        this._chargingSource = 0;
        this._noticeDismissSource = 0;
        this._greetingSource = 0;
        this._greetingPreviewSource = 0;
        this._brightnessReadSource = 0;
        this._brightnessSignal = 0;
        this._brightnessManagerSignal = 0;
        this._brightnessOsdManager = null;
        this._brightnessOsdOriginalShow = null;
        this._brightnessOsdOriginalShowOne = null;
        this._brightnessOsdOriginalShowAll = null;
        this._brightnessOsdShowWrapper = null;
        this._brightnessOsdShowOneWrapper = null;
        this._brightnessOsdShowAllWrapper = null;
        this._pendingBrightnessPercent = null;
        this._lastBrightnessNoticePercent = null;
        this._lastBrightnessNoticeAt = 0;
        this._lastBrightnessOsdRequestAt = 0;
        this._brightnessRestoreExpanded = false;
        this._brightnessRestorePage = null;
        this._brightnessRestorePinned = false;
        this._blinkSource = 0;
        this._clipboardSource = 0;
        this._systemNoticeActive = false;
        this._systemNoticeType = null;
        this._noticeNotificationItem = null;
        this._browserTuckSignal = 0;
        this._tuckedByBrowser = false;
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
        this._focusLogFile = GLib.build_filenamev([this._taskDirectory, 'focus-log.json']);
        this._prayerCacheFile = GLib.build_filenamev([this._taskDirectory, 'prayer-cache.json']);
        this._notesFile = GLib.build_filenamev([this._taskDirectory, 'notes.json']);
        this._legacyTaskFile = GLib.build_filenamev([
            GLib.get_user_data_dir(),
            LEGACY_DATA_DIRECTORY,
            'tasks.json',
        ]);
        this._shelfDirectory = GLib.build_filenamev([this._taskDirectory, 'shelf']);
        this._migrateLegacyData();
        this._preferences = this._loadPreferences();
        if (this._waterReminderBaselineNeedsSave) {
            this._savePreferences();
            this._waterReminderBaselineNeedsSave = false;
        }
        this._activePage = this._visiblePages()[0]?.key || 'settings';
        this._tasks = this._loadTasks();
        this._focusLog = this._loadFocusLog();
        this._prayerCache = this._loadPrayerCache();
        this._prayerCancellable = new Gio.Cancellable();
        this._clipboardItems = this._loadClipboardItems();
        this._shelfItems = this._loadShelfItems();
        this._notes = this._loadNotes();
        this._notesSelectedId = this._notes[0]?.id || null;
        this._notesStatusValue = '';
        this._notesSaveSource = 0;
        this._notesUndoSource = 0;
        this._notesFocusSource = 0;
        this._notesUndo = null;
        this._keepAwakeCookie = 0;
        this._keepAwakeGeneration = 0;
        this._shelfMonitorSignal = 0;
        this._shelfMonitor = this._monitorShelfDirectory();
        this._shelfRefreshSource = 0;
        this._taskFocusSource = 0;
        this._playersLoaded = false;
        this._playersError = false;

        this._activities = [];
        this._activityRows = new Map();
        this._activityExpirySources = new Map();
        this._activityDbus = null;
        this._activityDbusOwnerId = 0;
        this._noticeTab = 'alerts';
        this._startDownloadWatch();
        this._buildInterface();
        this._uiActorsAlive = true;
        this._connectActivityService();
        Main.wm.addKeybinding(
            'toggle-island-visibility',
            this._keybindingSettings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this._toggleIslandVisibility()
        );
        Main.wm.addKeybinding(
            'quick-capture',
            this._keybindingSettings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this._openQuickCapture()
        );
        this._applyTheme();
        this._applyGlassPreference();
        this._applyKeepAwake();
        this._monitorSignal = Main.layoutManager.connect('monitors-changed', () => {
            if (this._expanded)
                this._root.set_size(this._expandedWidth(), this._expandedHeight());
            this._layoutIsland();
            this._positionIsland();
        });
        this._browserTuckSignal = global.display.connect('notify::focus-window', () =>
            this._updateBrowserTuckFromPointer());
        this._allocationSignal = this._root.connect('notify::allocation', () => this._layoutIsland());
        this._widthSignal = this._root.connect('notify::width', () => this._positionIsland());
        this._heightSignal = this._root.connect('notify::height', () => this._positionIsland());
        this._positionIsland();
        this._stageSignal = global.stage.connect('captured-event', (_stage, event) => this._onStageEvent(event));
        this._connectBrightnessMonitor();
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
            this._checkAgendaNotices();
            this._checkReminders();
            if (this._activePage === 'reminders')
                this._updateReminderPage();
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
        this._connectClipboardMonitor();
        this._queueSessionGreeting();
    }

    _loadPreferences() {
        this._waterReminderBaselineNeedsSave = false;
        const visiblePages = Object.fromEntries(PAGES.map(page => [page.key, true]));
        const defaults = {
            glass: false,
            theme: DEFAULT_THEME,
            accentColor: DEFAULT_ACCENT_COLOR,
            fontFamily: 'cantarell',
            islandShape: 'notch',
            browserOverlap: false,
            restingStyle: 'hover-clock',
            showRestingLyrics: false,
            smartMusicDetection: true,
            systemNotices: true,
            notificationSources: {...DEFAULT_NOTIFICATION_SOURCES},
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
            visiblePages,
            tabOrder: normalizeTabOrder([]),
            positionMode: 'top',
            positionX: 0.5,
            positionY: 0,
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
            defaults.theme = THEMES.some(theme => theme.key === stored.theme)
                ? stored.theme
                : DEFAULT_THEME;
            defaults.accentColor = normalizeHexColor(stored.accentColor) || defaults.accentColor;
            defaults.fontFamily = FONT_FAMILIES.includes(stored.fontFamily)
                ? stored.fontFamily : 'cantarell';
            defaults.islandShape = stored.islandShape === 'pill' ? 'pill' : 'notch';
            defaults.browserOverlap = stored.browserOverlap === true;
            defaults.restingStyle = ['hover-clock', 'eyes-clock'].includes(stored.restingStyle)
                ? stored.restingStyle
                : 'hover-clock';
            defaults.showRestingLyrics = stored.showRestingLyrics === true;
            defaults.smartMusicDetection = stored.smartMusicDetection !== false;
            defaults.systemNotices = stored.systemNotices !== false;
            if (stored.notificationSources && typeof stored.notificationSources === 'object') {
                for (const key of Object.keys(DEFAULT_NOTIFICATION_SOURCES)) {
                    if (typeof stored.notificationSources[key] === 'boolean')
                        defaults.notificationSources[key] = stored.notificationSources[key];
                }
            }
            defaults.morningAgenda = stored.morningAgenda !== false;
            defaults.eveningRecap = stored.eveningRecap !== false;
            defaults.lastAgendaBriefing = typeof stored.lastAgendaBriefing === 'string'
                ? stored.lastAgendaBriefing : '';
            defaults.lastAgendaRecap = typeof stored.lastAgendaRecap === 'string'
                ? stored.lastAgendaRecap : '';
            defaults.focusGuard = stored.focusGuard !== false;
            defaults.keepAwake = stored.keepAwake === true;
            defaults.waterReminder = stored.waterReminder === true;
            defaults.prayerReminder = stored.prayerReminder === true;
            defaults.prayerCity = typeof stored.prayerCity === 'string' && stored.prayerCity.trim()
                ? stored.prayerCity
                : defaults.prayerCity;
            defaults.prayerMethod = PRAYER_METHODS.some(([method]) => method === stored.prayerMethod)
                ? stored.prayerMethod
                : 20;
            defaults.lastWaterAt = Number.isFinite(stored.lastWaterAt) ? stored.lastWaterAt : 0;
            defaults.lastWaterLogAt = Number.isFinite(stored.lastWaterLogAt)
                ? stored.lastWaterLogAt : 0;
            const hasWaterReminderBaseline = Number.isFinite(stored.lastWaterReminderAt)
                && stored.lastWaterReminderAt > 0;
            defaults.lastWaterReminderAt = hasWaterReminderBaseline
                ? stored.lastWaterReminderAt
                : defaults.waterReminder ? Math.floor(Date.now() / 1000) : 0;
            this._waterReminderBaselineNeedsSave = defaults.waterReminder && !hasWaterReminderBaseline;
            defaults.lastPrayerNotice = typeof stored.lastPrayerNotice === 'string'
                ? stored.lastPrayerNotice
                : '';
            defaults.shelfView = ['grid', 'list'].includes(stored.shelfView)
                ? stored.shelfView
                : 'grid';
            defaults.greetingEnabled = stored.greetingEnabled !== false;
            defaults.greetingNameSource = ['account', 'device', 'custom'].includes(stored.greetingNameSource)
                ? stored.greetingNameSource
                : 'account';
            defaults.greetingCustomName = typeof stored.greetingCustomName === 'string'
                ? stored.greetingCustomName.replace(/[\r\n]+/g, ' ').slice(0, 40)
                : '';
            defaults.greetingWelcomeText = typeof stored.greetingWelcomeText === 'string'
                ? stored.greetingWelcomeText.replace(/[\r\n]+/g, ' ').slice(0, 56)
                : defaults.greetingWelcomeText;
            defaults.greetingReturnText = typeof stored.greetingReturnText === 'string'
                ? stored.greetingReturnText.replace(/[\r\n]+/g, ' ').slice(0, 56)
                : defaults.greetingReturnText;
            defaults.greetingWelcomeShown = stored.greetingWelcomeShown === true;
            defaults.greetingLastSession = typeof stored.greetingLastSession === 'string'
                ? stored.greetingLastSession
                : '';
            defaults.tabOrder = normalizeTabOrder(stored.tabOrder);
            defaults.positionMode = POSITION_MODES.includes(stored.positionMode)
                ? stored.positionMode : 'top';
            defaults.positionX = clampUnit(stored.positionX, 0.5);
            defaults.positionY = clampUnit(stored.positionY, 0);
        } catch (_error) {
            // Corrupt or missing preferences fall back to the default appearance.
        }
        defaults.visiblePages.settings = true;
        return defaults;
    }

    _savePreferences() {
        try {
            GLib.mkdir_with_parents(this._taskDirectory, 0o755);
            return GLib.file_set_contents(this._preferencesFile,
                JSON.stringify(this._preferences, null, 2));
        } catch (error) {
            logError(error, 'Perdana Island could not save preferences');
            return false;
        }
    }

    _orderedPages() {
        const byKey = new Map(PAGES.map(page => [page.key, page]));
        const pages = [];
        for (const key of this._preferences?.tabOrder || []) {
            const page = byKey.get(key);
            if (page && !pages.includes(page))
                pages.push(page);
        }
        for (const page of PAGES) {
            if (!pages.includes(page))
                pages.push(page);
        }
        return pages;
    }

    _visiblePages() {
        // 'clipboard' lives inside Shelf and 'media' lives inside Summary (as in the preview).
        return this._orderedPages().filter(page => page.key !== 'clipboard' && page.key !== 'media' && (page.key === 'settings'
            || this._preferences?.visiblePages?.[page.key] !== false));
    }

    _setPreference(key, value, render = true) {
        this._preferences[key] = value;
        this._savePreferences();
        if (key === 'systemNotices' && !value && this._systemNoticeActive
            && this._systemNoticeType !== 'greeting')
            this._dismissSystemNotice(true);
        if (key === 'greetingEnabled' && !value && this._systemNoticeActive
            && this._systemNoticeType === 'greeting')
            this._dismissSystemNotice(true);
        if (key === 'notificationSources' && this._systemNoticeActive
            && this._systemNoticeType === 'application'
            && !this._isNotificationSourceEnabled(this._noticeNotificationItem?.appKey))
            this._dismissSystemNotice(true);
        if (key === 'glass')
            this._applyGlassPreference();
        if (key === 'islandShape') {
            this._updateIslandShapePreference();
            this._positionIsland();
        }
        if (key === 'browserOverlap' && !value)
            this._setBrowserTucked(false);
        if (key === 'waterReminder' && value) {
            this._preferences.lastWaterReminderAt = Math.floor(Date.now() / 1000);
            this._savePreferences();
        }
        if (key === 'prayerReminder' || key === 'prayerCity' || key === 'prayerMethod') {
            this._prayerRetryAt = 0;
            this._fetchPrayerTimes();
        }
        if (key === 'theme') {
            this._applyTheme();
            this._applyAccentStyles();
        }
        if (key === 'keepAwake')
            this._applyKeepAwake();
        if (key === 'accentColor') {
            this._focusRing?.queue_repaint();
            for (const icon of this._summaryIconActors || [])
                icon.queue_repaint();
            this._applyAccentStyles();
        }
        if (key === 'fontFamily')
            this._applyFontPreference();
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
        if (key === 'smartMusicDetection') {
            if (value)
                this._syncSelectedPlayerLyrics();
            this._updateMediaTicker();
            this._updateCollapsedLabel();
        }
        if (key === 'greetingEnabled' && value)
            this._queueSessionGreeting();
        else if (key === 'greetingEnabled')
            this._clearTimeout('_greetingSource');
        if (render && ['settings', 'shelf'].includes(this._activePage))
            this._renderPanel();
    }

    _sessionIdentifier() {
        const loginSession = GLib.getenv('XDG_SESSION_ID');
        if (loginSession)
            return `xdg:${loginSession}`;
        try {
            const busName = Gio.DBus.session.get_unique_name();
            if (busName)
                return `bus:${busName}`;
        } catch (_error) {
            // Shell may still be connecting to the session bus during startup.
        }
        return '';
    }

    _greetingName() {
        if (this._preferences?.greetingNameSource === 'device')
            return GLib.get_host_name() || GLib.get_user_name();
        if (this._preferences?.greetingNameSource === 'custom')
            return this._preferences.greetingCustomName.trim() || GLib.get_user_name();
        return GLib.get_user_name();
    }

    _greetingMessage(returning = false) {
        const template = returning
            ? this._preferences.greetingReturnText
            : this._preferences.greetingWelcomeText;
        const message = String(template || '').replace(/\{name\}/gi, this._greetingName())
            .replace(/[\r\n]+/g, ' ').trim();
        return message || (returning ? "You're back" : 'Hello');
    }

    _queueSessionGreeting(attempt = 0) {
        this._clearTimeout('_greetingSource');
        if (!this._enabled || !this._preferences?.greetingEnabled)
            return;
        const sessionId = this._sessionIdentifier();
        if (!sessionId || this._preferences.greetingLastSession === sessionId)
            return;
        this._greetingSource = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
            this._greetingSource = 0;
            if (!this._enabled || !this._preferences?.greetingEnabled)
                return GLib.SOURCE_REMOVE;
            if (!this._root || this._expanded || this._userHidden || this._systemNoticeActive) {
                if (attempt < 10)
                    this._queueSessionGreeting(attempt + 1);
                return GLib.SOURCE_REMOVE;
            }
            const welcome = !this._preferences.greetingWelcomeShown;
            const shown = this._showSystemNotice('greeting', {
                title: this._greetingMessage(!welcome),
                subtitle: '',
            });
            if (shown) {
                this._preferences.greetingWelcomeShown = true;
                this._preferences.greetingLastSession = sessionId;
                this._savePreferences();
            } else if (attempt < 10) {
                this._queueSessionGreeting(attempt + 1);
            }
            return GLib.SOURCE_REMOVE;
        });
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
            ['perdana-button--nav-active', 'color: #ffffff;'],
            ['perdana-island__tab-pill', `background-color: ${soft};`],
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
        this._layoutTabs(this._expandedWidth());
        this._renderPanel();
    }

    _theme() {
        return THEMES.find(theme => theme.key === this._preferences?.theme) || THEMES[0];
    }

    _applyFontPreference() {
        if (!this._root)
            return;
        for (const family of FONT_FAMILIES)
            this._root.remove_style_class_name(`perdana-island--font-${family}`);
        const family = FONT_FAMILIES.includes(this._preferences?.fontFamily)
            ? this._preferences.fontFamily : 'cantarell';
        this._root.add_style_class_name(`perdana-island--font-${family}`);
        this._root.queue_relayout();
    }

    _applyTheme() {
        if (!this._root)
            return;
        const theme = this._theme();
        for (const candidate of THEMES)
            this._root.remove_style_class_name(`perdana-island--theme-${candidate.key}`);
        this._root.add_style_class_name(`perdana-island--theme-${theme.key}`);
        this._updateIslandShapePreference();
        this._updateEarVisibility();
        this._surface?.queue_repaint();
    }

    _updateEarVisibility() {
        const positionMode = this._preferences?.positionMode || 'top';
        const visible = this._preferences?.islandShape !== 'pill'
            && !this._preferences?.glass && this._theme().opaque
            && (positionMode === 'top' || positionMode === 'bottom');
        for (const ear of this._islandEars || []) {
            ear.visible = visible;
            ear.queue_repaint();
        }
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
        this._updateEarVisibility();
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

    _normalizeNotificationText(value, appKey = null) {
        let text = String(value || '')
            .replace(/[\r\n\t\u2028\u2029]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (CHAT_SOURCE_KEYS.has(appKey)) {
            text = text.replace(/(?:https?:\/\/)?(?:web\.)?whatsapp\.com(?:\/\S*)?/ig, ' ')
                .replace(/(?:https?:\/\/)?web(?:k|a)?\.telegram\.org(?:\/\S*)?/ig, ' ')
                .replace(/(?:https?:\/\/)?chat\.google\.com(?:\/\S*)?/ig, ' ')
                .replace(/(?:https?:\/\/)?chat\.googleusercontent\.com(?:\/\S*)?/ig, ' ')
                .replace(/(?:https?:\/\/)?mail\.google\.com\/chat(?:\/\S*)?/ig, ' ')
                .replace(/(?:https?:\/\/)?mail\.google\.com\/mail\/\S*#chat\S*/ig, ' ')
                .replace(/\s+/g, ' ')
                .replace(/^[\s·•|:–—]+|[\s·•|:–—]+$/g, '')
                .trim();
        }
        return text;
    }

    _trackNotification(source, notification, fresh = false) {
        if (!notification)
            return;
        const sourceDetails = this._notificationSourceDetails(source, notification);
        const title = this._normalizeNotificationText(
            notification.title || source.title || 'Notification', sourceDetails.key
        ) || 'Notification';
        const body = this._normalizeNotificationText(notification.body, sourceDetails.key);
        let item = this._notificationItems.find(entry => entry.notification === notification);
        if (item) {
            item.app = sourceDetails.label;
            item.appKey = sourceDetails.key;
            item.appIconName = sourceDetails.iconName;
            item.appIconFile = sourceDetails.iconFile;
            item.title = title;
            item.body = body;
            item.receivedAt = Date.now();
            this._notificationItems = [item, ...this._notificationItems.filter(entry => entry !== item)];
        } else {
            item = {
                id: ++this._notificationSequence,
                source,
                notification,
                app: sourceDetails.label,
                appKey: sourceDetails.key,
                appIconName: sourceDetails.iconName,
                appIconFile: sourceDetails.iconFile,
                title,
                body,
                read: false,
                receivedAt: Date.now(),
            };
            this._notificationItems.unshift(item);
            this._notificationItems = this._notificationItems.slice(0, 100);
        }
        this._renderNotificationsIfVisible();
        if (fresh && source.policy?.showBanners !== false
            && this._isNotificationSourceEnabled(item.appKey))
            this._showSystemNotice('application', item);
    }

    _notificationSourceDetails(source, notification) {
        const app = source?.app;
        const identity = [
            source?.title,
            app?.get_name?.(),
            app?.get_id?.(),
            app?.get_app_info?.()?.get_id?.(),
            app?.get_app_info?.()?.get_name?.(),
            app?.id,
            notification?.appName,
            notification?.appId,
            notification?.desktopEntry,
            notification?.desktopEntryId,
            notification?.title,
        ].filter(value => typeof value === 'string' && value.trim())
            .join(' ').toLowerCase();
        if (/whatsapp/.test(identity))
            return {key: 'whatsapp', label: 'WhatsApp', iconName: 'whatsapp'};
        const browserSource = /microsoft\s*edge|msedge|\bedge\b|google\s*chrome|chromium|\bchrome\b|firefox|floorp|librewolf|zen browser|\bbrave\b|\bopera\b|vivaldi/i.test(identity);
        const payload = `${notification?.title || ''} ${notification?.body || ''}`;
        if (browserSource && /\b(?:web\.)?whatsapp\.com\b/i.test(payload))
            return {key: 'whatsapp', label: 'WhatsApp', iconName: 'whatsapp'};
        const identitySlug = identity.replace(/[^a-z0-9]/g, '');
        const googleChatSite = /(?:chat\.google\.com|mail\.google\.com\/(?:chat|mail\/\S*#chat)|chat\.googleusercontent\.com)/i;
        // The installed Edge PWA reports this desktop app ID instead of its URL.
        const googleChatPwaId = identitySlug.includes('pommaclcbfghclhalboakcipcmmndhcj');
        if (identitySlug.includes('googlechat') || googleChatPwaId || googleChatSite.test(identity)
            || (browserSource && googleChatSite.test(payload)))
            return {
                key: 'googleChat',
                label: 'Google Chat',
                iconFile: `${this.path}/assets/google-chat.png`,
            };
        if (browserSource && /\bweb(?:k|a)?\.telegram\.org\b/i.test(payload))
            return {key: 'telegramWeb', label: 'Telegram Web', iconName: 'telegram'};
        if (/discord/.test(identity))
            return {key: 'discord', label: 'Discord', iconName: 'discord'};
        if (/telegram/.test(identity)) {
            const desktop = /desktop|org\.telegram/i.test(identity);
            return {
                key: desktop ? 'telegramDesktop' : 'telegramWeb',
                label: desktop ? 'Telegram Desktop' : 'Telegram Web',
                iconName: 'telegram',
            };
        }
        if (/google[\s._-]*chat|chat\.google\.com|chat\.googleusercontent\.com/i.test(identity))
            return {
                key: 'googleChat',
                label: 'Google Chat',
                iconFile: `${this.path}/assets/google-chat.png`,
            };
        // Browser alerts show the logo of the browser that sent them, as in the preview.
        const browser = [
            [/microsoft\s*edge|msedge|\bedge\b/, 'browser-edge', 'Microsoft Edge'],
            [/google\s*chrome|chromium|\bchrome\b/, 'browser-chrome', 'Google Chrome'],
            [/firefox|floorp|librewolf|zen browser/, 'browser-firefox', 'Firefox'],
            [/\bbrave\b/, 'browser-brave', 'Brave'],
            [/\bopera\b/, 'browser-opera', 'Opera'],
            [/vivaldi/, 'browser-vivaldi', 'Vivaldi'],
        ].find(([pattern]) => pattern.test(identity));
        if (browser) {
            const [, key, label] = browser;
            return {
                key,
                label,
                iconFile: `${this.path}/assets/browsers/${key}.svg`,
            };
        }

        return {
            key: null,
            label: String(source?.title || app?.get_name?.() || 'Application'),
            iconName: null,
        };
    }

    _isNotificationSourceEnabled(key) {
        return !key || this._preferences?.notificationSources?.[key] !== false;
    }

    _visibleNotifications() {
        return this._notificationItems.filter(item => this._isNotificationSourceEnabled(item.appKey));
    }

    _untrackNotification(notification) {
        this._notificationItems = this._notificationItems.filter(item => item.notification !== notification);
        this._renderNotificationsIfVisible();
    }

    _renderNotificationsIfVisible() {
        this._updateSummaryRows();
        if (!this._clearingNotifications && this._enabled
            && ['notifications', 'messages'].includes(this._activePage) && this._pageViewport)
            this._renderPanel();
    }

    _clearNotifications(predicate = () => true) {
        this._clearingNotifications = true;
        const targets = this._notificationItems.filter(predicate);
        for (const item of targets) {
            try {
                item.notification.destroy(MessageTray.NotificationDestroyedReason.DISMISSED);
            } catch (_error) {
                this._untrackNotification(item.notification);
            }
        }
        const removed = new Set(targets);
        this._notificationItems = this._notificationItems.filter(item => !removed.has(item));
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
        this._stopDownloadWatch();
        this._disconnectActivityService();
        this._activities = [];
        if (this._clipboardArmTimer) {
            GLib.source_remove(this._clipboardArmTimer);
            this._clipboardArmTimer = 0;
        }
        this._tuckedByBrowser = false;
        this._tabDrag = null;
        this._islandDrag = null;
        this._positionAnimating = false;
        this._positionButtons = null;
        this._dropEmptyNotes();
        this._flushNotesSave();
        this._clearTimeout('_notesSaveSource');
        this._clearTimeout('_notesUndoSource');
        this._clearTimeout('_notesFocusSource');
        this._clearTimeout('_notesResizeSource');
        this._clearTimeout('_notesScrollSource');
        this._clearTimeout('_settingsNavScrollSource');
        this._notesUndo = null;
        this._keepAwakeGeneration++;
        this._releaseKeepAwake();
        Main.wm.removeKeybinding('toggle-island-visibility');
        Main.wm.removeKeybinding('quick-capture');
        this._keybindingSettings = null;
        if (this._stageSignal) {
            global.stage.disconnect(this._stageSignal);
            this._stageSignal = 0;
        }
        if (this._brightnessSignal) {
            Gio.DBus.session.signal_unsubscribe(this._brightnessSignal);
            this._brightnessSignal = 0;
        }
        if (this._brightnessManagerSignal && Main.brightnessManager) {
            Main.brightnessManager.disconnect(this._brightnessManagerSignal);
            this._brightnessManagerSignal = 0;
        }
        this._disconnectBrightnessOsdMonitor();
        if (this._browserTuckSignal) {
            global.display.disconnect(this._browserTuckSignal);
            this._browserTuckSignal = 0;
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
        this._restingLyricsSource && GLib.source_remove(this._restingLyricsSource);
        this._restingLyricsSource = 0;
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
        this._greetingSource && GLib.source_remove(this._greetingSource);
        this._greetingSource = 0;
        this._greetingPreviewSource && GLib.source_remove(this._greetingPreviewSource);
        this._greetingPreviewSource = 0;
        this._brightnessReadSource && GLib.source_remove(this._brightnessReadSource);
        this._brightnessReadSource = 0;
        this._blinkSource && GLib.source_remove(this._blinkSource);
        this._blinkSource = 0;
        this._disconnectClipboardMonitor();
        this._shelfRefreshSource && GLib.source_remove(this._shelfRefreshSource);
        this._shelfRefreshSource = 0;
        this._shelfNoticeSource && GLib.source_remove(this._shelfNoticeSource);
        this._shelfNoticeSource = 0;
        if (this._screenshotTimeout) {
            GLib.source_remove(this._screenshotTimeout);
            this._screenshotTimeout = 0;
        }
        if (this._screenshotSubscription) {
            Gio.DBus.session.signal_unsubscribe(this._screenshotSubscription);
            this._screenshotSubscription = 0;
        }
        this._screenshotRequest = false;
        this._prayerCancellable?.cancel();
        this._prayerCancellable = null;
        this._prayerSession?.abort();
        this._prayerSession = null;
        this._prayerFetching = false;
        this._taskFocusSource && GLib.source_remove(this._taskFocusSource);
        this._taskFocusSource = 0;
        this._reportCopiedSource && GLib.source_remove(this._reportCopiedSource);
        this._reportCopiedSource = 0;
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
        this._summaryMediaBody = null;
        this._summaryMediaEmpty = null;
        this._summaryTitle = null;
        this._summaryArtist = null;
        this._summaryLyric = null;
        this._summaryIconActors = [];
        this._summaryRows = {};
        this._shelfClipboardCountLabel = null;
        this._shelfFilesCountLabel = null;
        this._lyricsStatusLabel = null;
        this._lyricsViewport = null;
        this._lyricsRail = null;
        this._lyricsWaitLabel = null;
        this._lyricsRenderedLines = null;
        this._lyricsWindowStart = -1;
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
        this._applyFontPreference();
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
            if (GLib.get_monotonic_time() < this._islandClickSuppressUntil)
                return;
            this._setBrowserTucked(false);
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
        this._compactTextSpacer = new St.Widget({
            x_expand: true,
            y_expand: true,
            reactive: false,
        });

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
        this._compactContents.add_child(this._compactTrackTitle);
        this._compactContents.add_child(this._compactCenter);
        this._equalizer = this._makeEqualizer();
        this._compact.add_child(this._compactLeading);
        this._compact.add_child(this._compactTextSpacer);
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
        this._activityCompact = new St.BoxLayout({style_class: 'perdana-island__activity-compact', visible: false});
        this._activityCompactLabel = makeLabel('', 'perdana-island__activity-compact-label');
        this._activityCompactLabel.x_expand = true;
        this._activityCompactBar = new St.Widget({style_class: 'perdana-island__activity-compact-bar'});
        this._activityCompactFill = new St.Widget({style_class: 'perdana-island__activity-compact-fill'});
        this._activityCompactBar.add_child(this._activityCompactFill);
        this._activityCompact.add_child(this._activityCompactLabel);
        this._activityCompact.add_child(this._activityCompactBar);
        this._compact.add_child(this._activityCompact);
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
        this._dateLabel = makeLabel('', 'perdana-island__date');
        this._header.add_child(this._dateLabel);
        this._clockLabel = makeLabel('', 'perdana-island__clock');
        this._header.add_child(this._clockLabel);
        this._captureButton = makeIconButton(
            'list-add-symbolic',
            'Quick capture (Ctrl+Alt+N)',
            () => this._openQuickCapture(),
            'perdana-island__capture-open'
        );
        this._header.add_child(this._captureButton);
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
        const positionMode = this._preferences?.positionMode || 'top';
        const earsVisible = (positionMode === 'top' || positionMode === 'bottom')
            && this._preferences?.islandShape !== 'pill'
            && !this._preferences?.glass && this._theme().opaque;
        for (const [index, ear] of this._islandEars.entries()) {
            ear.visible = earsVisible;
            if (!earsVisible)
                continue;
            ear.set_position(index === 0 ? -ISLAND_EAR_SIZE : width,
                positionMode === 'bottom' ? height - ISLAND_EAR_SIZE : 0);
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
            this._layoutCompactTrackTitle();
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
            const captureWidth = 24;
            const captureGap = 10;
            const rightInset = 28;
            const clockWidth = 58;
            const captureX = Math.max(0, width - rightInset - captureWidth);
            const clockX = Math.max(28, captureX - captureGap - clockWidth);
            const dateWidth = Math.max(0, Math.min(170, clockX - 28 - 12));
            this._dateLabel.set_size(dateWidth, 22);
            this._clockLabel.set_size(58, 22);
            this._captureButton.set_size(captureWidth, captureWidth);
            this._dateLabel.set_position(28, 8);
            this._clockLabel.set_position(clockX, 8);
            this._captureButton.set_position(captureX, 8);
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

    _layoutCompactTrackTitle() {
        if (!this._compactContents || !this._compactTrackTitle)
            return;
        const width = Math.max(0, Math.round(this._compactContents.width));
        const height = Math.max(0, Math.round(this._compactContents.height));
        const sideInset = Math.min(51, Math.floor(width / 2));
        const textWidth = Math.max(1, width - sideInset * 2);
        const safeHeight = Math.max(1, height - 12);
        const lyricsMode = Boolean(this._preferences?.showRestingLyrics);
        const lyricsMetrics = {
            'perdana-island__compact-track-title--lyrics-small': 15,
            'perdana-island__compact-track-title--lyrics-smaller': 12,
            'perdana-island__compact-track-title--lyrics-tiny': 10,
        };
        const lineHeight = lyricsMode
            ? lyricsMetrics[this._compactLyricsAppliedFitClass] || 16
            : 18;
        const naturalHeight = lyricsMode
            ? this._measureCompactLyricsHeight(
                this._compactTrackTitle.text,
                textWidth,
                this._compactLyricsAppliedFitClass,
                lineHeight
            )
            : 18;
        const textHeight = Math.min(safeHeight, naturalHeight);
        this._compactTrackTitle.set_position(sideInset, Math.round((height - textHeight) / 2));
        this._compactTrackTitle.set_size(textWidth, textHeight);
    }

    _measureCompactLyricsHeight(text, width, fitClass, fallbackHeight) {
        const label = this._compactTrackTitle;
        if (!label || !text)
            return fallbackHeight;

        const fitClasses = [
            'perdana-island__compact-track-title--lyrics-small',
            'perdana-island__compact-track-title--lyrics-smaller',
            'perdana-island__compact-track-title--lyrics-tiny',
        ];
        const previousFitClasses = fitClasses.filter(name => label.has_style_class_name(name));
        const previousText = label.text;
        const safeWidth = Math.max(1, Math.round(width));
        try {
            for (const name of fitClasses)
                label.remove_style_class_name(name);
            if (fitClass)
                label.add_style_class_name(fitClass);
            label.text = text;
            label.set_width(safeWidth);
            const [, naturalHeight] = label.get_preferred_height(safeWidth);
            return Math.max(fallbackHeight, Math.ceil(naturalHeight));
        } catch (_error) {
            return fallbackHeight;
        } finally {
            label.text = previousText;
            for (const name of fitClasses)
                label.remove_style_class_name(name);
            for (const name of previousFitClasses)
                label.add_style_class_name(name);
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
        if (equalizer._perdanaAnimating === shouldAnimate) {
            if (!shouldAnimate)
                this._setEqualizerStaticLevels(equalizer, playing);
            return;
        }

        equalizer._perdanaAnimating = shouldAnimate;
        for (const bar of equalizer._perdanaBars) {
            if (bar._perdanaAnimSource) {
                GLib.source_remove(bar._perdanaAnimSource);
                bar._perdanaAnimSource = 0;
            }
            bar.remove_all_transitions();
            if (!shouldAnimate) {
                if (this._reducedMotion) {
                    this._setEqualizerStaticLevels(equalizer, playing);
                    break;
                }
                bar.ease({
                    scale_y: 0.22,
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

    _setEqualizerStaticLevels(equalizer, playing) {
        const levels = playing && this._enabled
            ? [0.42, 0.78, 0.54, 0.9]
            : [0.22, 0.22, 0.22, 0.22];
        equalizer._perdanaBars.forEach((bar, index) => {
            bar.remove_all_transitions();
            bar.scale_y = levels[index] ?? levels[0];
        });
    }

    _animateEqualizerBar(equalizer, bar, index) {
        if (!this._enabled || !equalizer._perdanaAnimating)
            return;

        const target = 0.22 + Math.random() * 0.78;
        const duration = 170 + Math.floor(Math.random() * 250) + index * 24;
        bar.ease({
            scale_y: target,
            duration: this._motionDuration(duration),
            mode: Clutter.AnimationMode.EASE_IN_OUT_SINE,
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
        if (this._preferences?.islandShape === 'pill') {
            if (this._expanded || this._closing)
                return Math.min(30, Math.max(19, height / 2), width / 2);
            if (this._systemNoticeActive)
                return Math.min(this._systemNoticeType === 'greeting' ? 38 : 36, height / 2, width / 2);
            return Math.min(height / 2, width / 2);
        }
        return Math.min(
            34 + this._theme().radius,
            Math.max(1, this._theme().radius
                + 19 + (height - COLLAPSED_HEIGHT) * 15 / (OPEN_HEIGHT - COLLAPSED_HEIGHT)),
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
        if (this._preferences?.positionMode === 'bottom') {
            cr.translate(0, ISLAND_EAR_SIZE);
            cr.scale(1, -1);
        }
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
        const [earRed, earGreen, earBlue] = this._theme().fill[0].slice(1, 4);
        cr.setSourceRGBA(earRed, earGreen, earBlue, 1);
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
        const theme = this._theme();
        const stops = this._preferences?.glass ? theme.glassFill : theme.fill;
        const mode = this._preferences?.positionMode || 'top';
        const topRadius = mode === 'top' ? 0 : radius;
        const bottomRadius = mode === 'bottom' ? 0 : radius;
        const tracePath = () => {
            cr.newPath();
            if (this._preferences?.islandShape === 'pill') {
                cr.arc(width - radius, radius, radius, -Math.PI / 2, 0);
                cr.arc(width - radius, height - radius, radius, 0, Math.PI / 2);
                cr.arc(radius, height - radius, radius, Math.PI / 2, Math.PI);
                cr.arc(radius, radius, radius, Math.PI, Math.PI * 1.5);
                cr.closePath();
                return;
            }
            cr.moveTo(topRadius, 0);
            cr.lineTo(width - topRadius, 0);
            if (topRadius > 0)
                cr.arc(width - topRadius, topRadius, topRadius, -Math.PI / 2, 0);
            cr.lineTo(width, height - bottomRadius);
            if (bottomRadius > 0)
                cr.arc(width - bottomRadius, height - bottomRadius, bottomRadius, 0, Math.PI / 2);
            cr.lineTo(bottomRadius, height);
            if (bottomRadius > 0)
                cr.arc(bottomRadius, height - bottomRadius, bottomRadius, Math.PI / 2, Math.PI);
            cr.lineTo(0, topRadius);
            if (topRadius > 0)
                cr.arc(topRadius, topRadius, topRadius, Math.PI, Math.PI * 1.5);
            cr.closePath();
        };
        tracePath();
        const gradient = new Cairo.LinearGradient(0, 0, 0, height);
        for (const [offset, red, green, blue, alpha] of stops)
            gradient.addColorStopRGBA(offset, red, green, blue, alpha);
        cr.setSource(gradient);
        cr.fillPreserve();
        if (theme.gloss > 0) {
            // A single top gloss band marks the material edge, the same way
            // Aero and Aqua titles read as glass without touching the content.
            cr.save();
            cr.clip();
            const gloss = new Cairo.LinearGradient(0, 0, 0, height * 0.62);
            gloss.addColorStopRGBA(0, 1, 1, 1, theme.gloss);
            gloss.addColorStopRGBA(0.55, 1, 1, 1, theme.gloss * 0.28);
            gloss.addColorStopRGBA(1, 1, 1, 1, 0);
            cr.setSource(gloss);
            cr.paint();
            cr.restore();
        }
        if (theme.border) {
            // Clipping consumed the path while painting the gloss band.
            tracePath();
            const [red, green, blue, alpha] = theme.border;
            cr.setLineWidth(1);
            cr.setSourceRGBA(red, green, blue, alpha);
            cr.stroke();
        }
        cr.$dispose();
    }

    _updateIslandShapePreference() {
        if (!this._root)
            return;
        const pill = this._preferences?.islandShape === 'pill';
        if (pill)
            this._root.add_style_class_name('perdana-island--pill-shape');
        else
            this._root.remove_style_class_name('perdana-island--pill-shape');
        this._updateEarVisibility();
        this._surface?.queue_repaint();
        this._layoutIsland();
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
        if (this._islandDrag?.moved || this._positionAnimating)
            return;
        const target = this._islandPositionTarget();
        if (Math.abs(this._root.x - target.x) > 0.5 || Math.abs(this._root.y - target.y) > 0.5)
            this._root.set_position(target.x, target.y);
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
        if (this._tuckedByBrowser)
            return;
        if (this._root.hover) {
            this._root.add_style_class_name('perdana-island--hot');
            this._clearTimeout('_hoverCloseSource');
            this._updateCollapsedLabel();
        } else if (this._expanded) {
            this._root.remove_style_class_name('perdana-island--hot');
            this._updateCollapsedLabel();
            this._clearTimeout('_hoverOpenSource');
            this._clearTimeout('_hoverCloseSource');
            this._hoverCloseSource = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                320,
                () => {
                    this._hoverCloseSource = 0;
                    if (!this._root?.hover && !this._tabDrag?.moved && !this._islandDrag?.moved) {
                        this._pinned = false;
                        this._setExpanded(false);
                    }
                    return GLib.SOURCE_REMOVE;
                }
            );
        } else {
            this._root.remove_style_class_name('perdana-island--hot');
            this._updateCollapsedLabel();
        }
        this._updateRestingLift();
    }

    _browserWindowOverlapsIsland() {
        const window = global.display.get_focus_window();
        const monitor = Main.layoutManager.primaryMonitor;
        if (!window || !monitor || window.is_fullscreen?.())
            return false;
        const identity = `${window.get_wm_class?.() || ''} ${window.get_title?.() || ''} ${window.get_gtk_application_id?.() || ''}`;
        if (!/(firefox|chrom(e|ium)|brave|vivaldi|opera|edge|thorium|floorp|librewolf|zen browser)/i.test(identity))
            return false;
        try {
            const frame = window.get_frame_rect();
            const width = this._collapsedWidth();
            const height = this._collapsedHeight();
            const spanX = Math.max(0, monitor.width - width);
            const centeredX = monitor.x + Math.round(spanX / 2);
            const mode = this._preferences?.positionMode || 'top';
            const x = mode === 'top' || mode === 'bottom'
                ? centeredX
                : monitor.x + Math.round(spanX * clampUnit(this._preferences?.positionX, 0.5));
            const y = monitor.y + (this._preferences?.islandShape === 'pill' && !this._tuckedByBrowser ? 8 : 0);
            const overlapWidth = frame.x < x + width && frame.x + frame.width > x;
            const overlapHeight = frame.y < y + height && frame.y + frame.height > y;
            return overlapWidth && overlapHeight;
        } catch (_error) {
            return false;
        }
    }

    _updateBrowserTuckFromPointer(pointerX = null, pointerY = null) {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor || !this._root)
            return;
        if (pointerX === null || pointerY === null) {
            [pointerX, pointerY] = global.get_pointer();
        }
        const position = this._islandPositionTarget();
        const islandCenterX = position.x + (this._root.width || this._collapsedWidth()) / 2;
        const nearX = Math.abs(pointerX - islandCenterX)
            <= Math.min(370, Math.max(60, monitor.width * 0.42));
        const nearTop = pointerY <= monitor.y + (this._tuckedByBrowser ? 62 : 48);
        const overlaps = this._browserWindowOverlapsIsland();
        const canTuck = this._preferences?.positionMode === 'top'
            && this._preferences?.browserOverlap && nearX && nearTop && overlaps
            && !this._expanded && !this._closing && !this._pinned
            && !this._islandDrag && !this._tabDrag
            && !this._systemNoticeActive && !this._userHidden;
        if (canTuck)
            this._setBrowserTucked(true);
        else if (this._tuckedByBrowser && (!nearTop || !nearX || !overlaps
            || !this._preferences?.browserOverlap || this._expanded || this._pinned))
            this._setBrowserTucked(false);
    }

    _setBrowserTucked(tucked) {
        if (!this._root || this._tuckedByBrowser === tucked)
            return;
        if (tucked && (!this._preferences?.browserOverlap || this._expanded || this._closing
            || this._pinned || this._systemNoticeActive || this._userHidden))
            return;
        this._tuckedByBrowser = tucked;
        if (tucked)
            this._root.add_style_class_name('perdana-island--browser-tucked');
        else
            this._root.remove_style_class_name('perdana-island--browser-tucked');
        this._root.remove_all_transitions();
        this._compactTrackTitle.remove_all_transitions();
        this._compactTrackTitle.opacity = tucked ? 0 : 255;
        const width = tucked ? 96 : this._collapsedWidth();
        const height = tucked ? 12 : this._collapsedHeight();
        this._root.ease({
            width,
            height,
            duration: this._motionDuration(180),
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            onComplete: () => {
                if (!this._root || this._tuckedByBrowser !== tucked)
                    return;
                this._root.set_size(width, height);
                this._layoutIsland();
                this._positionIsland();
                if (!tucked)
                    this._updateCollapsedLabel();
            },
        });
        this._layoutIsland();
        this._positionIsland();
    }

    _toggleIslandVisibility() {
        if (!this._enabled || !this._root)
            return;

        this._setBrowserTucked(false);
        this._userHidden = !this._userHidden;
        if (this._userHidden) {
            this._cancelCompactTrackTextTransition();
            this._pinned = false;
            this._tabDrag = null;
            this._islandDrag = null;
            this._clearTimeout('_hoverOpenSource');
            this._clearTimeout('_hoverCloseSource');
            this._clearTimeout('_noticeDismissSource');
            this._clearTimeout('_blinkSource');
            if (this._expanded) {
                this._expanded = false;
                this._closing = false;
                this._stopTodayTicker();
                this._root.remove_all_transitions();
                this._header.remove_all_transitions();
                this._panel.remove_all_transitions();
                this._compactButton.remove_all_transitions();
                this._root.remove_style_class_name('perdana-island--expanded');
                this._root.set_pivot_point(0.5, 0.5);
                this._root.set_scale(1, 1);
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
        this._queueSessionGreeting();
        if (!this._isPlaying() && !this._focusSource)
            this._scheduleBlink();
    }

    _setExpanded(expanded) {
        if (!this._enabled || !this._root || !this._panel)
            return;
        if (expanded && (this._userHidden || this._islandDrag?.moved))
            return;
        if (expanded && this._tuckedByBrowser)
            this._setBrowserTucked(false);
        if (this._expanded === expanded) {
            if (expanded && this._activePage === 'today')
                this._startTodayTicker();
            return;
        }

        if (!expanded && this._activePage === 'notes')
            this._leaveNotes();
        if (expanded && this._pinned) {
            // A click on the resting island opens the user's first tab, so
            // dragging a page to the front turns it into the startup page.
            const first = this._visiblePages()[0];
            if (first && first.key !== this._activePage) {
                if (this._activePage === 'notes')
                    this._leaveNotes();
                this._activePage = first.key;
            }
        }
        this._expanded = expanded;
        this._closing = !expanded;
        if (!expanded) {
            this._tabDrag = null;
            this._islandDrag = null;
        }
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
        this._positionAnimating = false;
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
            this._updateMediaTicker();
            this._panel.opacity = 0;
            this._root.set_size(this._collapsedWidth(), this._collapsedHeight());
            this._layoutIsland();
            this._positionIsland();
            const startScale = this._reducedMotion
                ? 1
                : (this._root.hover ? Math.max(1, this._root.scale_x) : 0.99);
            this._root.set_scale(startScale, startScale);
            this._root.ease({
                width: this._expandedWidth(),
                height: this._expandedHeight(),
                scale_x: 1,
                scale_y: 1,
                duration: this._motionDuration(460),
                mode: this._reducedMotion ? Clutter.AnimationMode.LINEAR : Clutter.AnimationMode.EASE_OUT_QUINT,
                onComplete: () => {
                    if (!this._root)
                        return;
                    this._root.set_pivot_point(0.5, 0.5);
                    this._root.set_scale(1, 1);
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
                duration: this._motionDuration(190),
                delay: this._motionDuration(110),
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
            this._panel.ease({
                opacity: 255,
                duration: this._motionDuration(220),
                delay: this._motionDuration(130),
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
            if (this._activePage === 'today')
                this._startTodayTicker();
            this._clearTimeout('_blinkSource');
        } else {
            this._stopTodayTicker();
            this._setEqualizerPlaying(this._mediaEqualizer, false);
            this._compactButton.show();
            this._compactButton.opacity = 0;
            this._compactButton.ease({
                opacity: 255,
                duration: this._motionDuration(180),
                delay: this._motionDuration(230),
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
            this._header.ease({
                opacity: 0,
                duration: this._motionDuration(130),
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
            });
            this._panel.ease({
                opacity: 0,
                duration: this._motionDuration(130),
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
            });
            const collapsedWidth = this._collapsedWidth();
            const collapsedHeight = this._collapsedHeight();
            const targetSize = `${collapsedWidth}x${collapsedHeight}`;
            this._collapsedTargetSize = targetSize;
            this._root.ease({
                width: collapsedWidth,
                height: collapsedHeight,
                scale_x: this._reducedMotion ? 1 : 0.99,
                scale_y: this._reducedMotion ? 1 : 0.99,
                duration: this._motionDuration(380),
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
                    this._root.set_pivot_point(0.5, 0.5);
                    this._root.set_scale(1, 1);
                    this._root.set_size(this._collapsedWidth(), this._collapsedHeight());
                    this._layoutIsland();
                    this._positionIsland();
                    this._compactVisualState = null;
                    this._updateHeaderClock();
                    this._updateCollapsedLabel();
                    this._updateRestingLift();
                    this._queueSessionGreeting();
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

    _renderQuickCapturePanel(body) {
        const width = this._pageWidth();
        const closeWidth = Math.min(70, Math.max(54, Math.round(width * 0.16)));
        place(body, makeLabel('Quick capture', 'perdana-island__todo-heading'), 0, 6,
            Math.max(1, width - closeWidth - 10), 22);
        place(body, makeTextButton('Close', 'Close quick capture',
            () => this._closeQuickCapture(), 'perdana-island__clipboard-action'),
        width - closeWidth, 4, closeWidth, 24);

        const entry = new St.Entry({
            hint_text: 'telepon ibu besok jam 5 penting',
            text: this._captureDraft || '',
            can_focus: true,
            style_class: 'perdana-island__task-entry',
        });
        entry.clutter_text.connect('text-changed', () => {
            this._captureDraft = entry.get_text();
            this._captureMessage = '';
            this._updateQuickCapturePreview();
            this._updateQuickCaptureStatus();
        });
        entry.clutter_text.connect('key-press-event', (_actor, event) => {
            const key = event.get_key_symbol();
            const ctrl = (event.get_state() & Clutter.ModifierType.CONTROL_MASK) !== 0;
            if (key === Clutter.KEY_Escape) {
                this._closeQuickCapture();
                return Clutter.EVENT_STOP;
            }
            if (key === Clutter.KEY_Return || key === Clutter.KEY_KP_Enter) {
                this._saveQuickCapture(ctrl);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        place(body, entry, 0, 38, width, 32);

        this._capturePreview = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            style_class: 'perdana-island__capture-preview',
        });
        this._capturePreviewWidth = width;
        place(body, this._capturePreview, 0, 76, width, 42);
        this._captureStatusLabel = makeLabel('', 'perdana-island__muted perdana-island__capture-status');
        place(body, this._captureStatusLabel, 0, 120, width, 14);
        this._updateQuickCapturePreview();
        this._updateQuickCaptureStatus();

        const actionGap = 8;
        const actionWidth = Math.min(84, Math.max(64, Math.floor((width - actionGap) / 2)));
        const actionsWidth = actionWidth * 2 + actionGap;
        const actionsX = Math.max(0, width - actionsWidth);
        place(body, makeTextButton('Add task', 'Add task',
            () => this._saveQuickCapture(false), 'perdana-island__color-apply'),
        actionsX, 136, actionWidth, 30);
        place(body, makeTextButton('Save note', 'Save note',
            () => this._saveQuickCapture(true), 'perdana-island__color-apply'),
        actionsX + actionWidth + actionGap, 136, actionWidth, 30);
        entry.grab_key_focus();
    }

    _updateQuickCapturePreview() {
        const preview = this._capturePreview;
        const width = this._capturePreviewWidth || 0;
        if (!preview || width <= 0)
            return;

        for (const child of preview.get_children())
            child.destroy();

        const result = parseCapture(this._captureDraft || '', new Date());
        let x = 0;
        let row = 0;
        const rowHeight = 20;
        const rowGap = 2;
        const gap = 6;
        const titleLimit = Math.min(250, Math.max(120, Math.round(width * 0.52)));
        for (const [index, chip] of this._captureSummary(result).entries()) {
            const chipStyle = chip.style ? ` perdana-island__capture-chip--${chip.style}` : '';
            const label = makeLabel(chip.text, `perdana-island__capture-chip${chipStyle}`);
            label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            const naturalWidth = Math.max(40, chip.text.length * 6 + 18);
            const chipWidth = Math.min(width, index === 1 ? titleLimit : naturalWidth);
            if (x > 0 && x + chipWidth > width) {
                row++;
                x = 0;
            }
            if (row > 1)
                break;
            place(preview, label, x, row * (rowHeight + rowGap), chipWidth, rowHeight);
            x += chipWidth + gap;
        }
    }

    _updateQuickCaptureStatus() {
        if (!this._captureStatusLabel)
            return;
        this._captureStatusLabel.text = this._captureMessage
            || 'Enter menambah tugas · Ctrl+Enter menyimpan catatan · Esc menutup';
        if (this._captureMessage)
            this._captureStatusLabel.add_style_class_name('perdana-island__capture-status--error');
        else
            this._captureStatusLabel.remove_style_class_name('perdana-island__capture-status--error');
    }

    _openQuickCapture() {
        if (!this._uiActorsAlive)
            return;
        this._captureOpen = true;
        this._captureDraft = '';
        this._captureMessage = '';
        this._setExpanded(true);
        this._renderPanel();
    }

    _closeQuickCapture() {
        this._captureOpen = false;
        this._captureDraft = '';
        this._captureMessage = '';
        this._renderPanel();
    }

    _captureSummary(result) {
        const chips = [
            {text: result.mode === 'note' ? 'Catatan' : 'Tugas', style: ''},
            {text: result.title || 'Judul kosong', style: 'title'},
        ];
        if (result.day)
            chips.push({text: result.day.toLocaleDateString('id-ID', {
                weekday: 'short', day: 'numeric', month: 'short',
            }), style: ''});
        if (result.time)
            chips.push({text: `${String(result.time.h).padStart(2, '0')}:${String(result.time.m).padStart(2, '0')}`, style: ''});
        if (result.priority)
            chips.push({text: `! ${result.priority}`, style: 'priority'});
        if (result.period)
            chips.push({text: result.period, style: ''});
        return chips;
    }

    _saveQuickCapture(asNote) {
        const result = parseCapture(this._captureDraft, new Date());
        if (!result.title) {
            this._captureMessage = 'Tulis judulnya dulu, misalnya: telepon ibu besok jam 5.';
            this._updateQuickCaptureStatus();
            return;
        }
        this._captureOpen = false;
        this._captureDraft = '';
        this._captureMessage = '';
        if (asNote || result.mode === 'note') {
            const when = result.day
                ? `Jadwal: ${result.day.toLocaleDateString('id-ID', {weekday: 'short', day: 'numeric', month: 'short'})}${result.time ? ` ${String(result.time.h).padStart(2, '0')}:${String(result.time.m).padStart(2, '0')}` : ''}`
                : '';
            this._notes = [{id: GLib.uuid_string_random(), text: `${result.title}${when ? `\n${when}` : ''}`, updated: Date.now()}, ...(this._notes ?? [])];
            this._saveNotes?.();
            this._renderPanel();
        } else {
            this._addTask(
                result.title,
                result.time ? result.time.h * 60 + result.time.m : null,
                result.priority ? result.priority.toLowerCase() : null,
                result.day ? dateKey(result.day) : null
            );
        }
    }

    _selectPage(key) {
        const pages = this._visiblePages();
        const nextIndex = pages.findIndex(page => page.key === key);
        if (nextIndex < 0)
            return;
        if (this._activePage === key)
            return;
        const currentIndex = pages.findIndex(page => page.key === this._activePage);
        this._pageTransitionDirection = nextIndex >= currentIndex ? 1 : -1;
        if (this._activePage === 'notes')
            this._leaveNotes();
        this._activePage = key;
        this._updateMediaTicker();
        this._renderPanel(true);
        if (this._expanded) {
            this._root.ease({
                width: this._expandedWidth(),
                height: this._expandedHeight(),
                duration: this._motionDuration(380),
                mode: this._reducedMotion ? Clutter.AnimationMode.LINEAR : Clutter.AnimationMode.EASE_OUT_QUINT,
                onComplete: () => this._layoutIsland(),
            });
            this._layoutIsland();
        }
        if (key === 'today' && this._expanded)
            this._startTodayTicker();
        else
            this._stopTodayTicker();
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

    _updateRestingLift() {
        if (!this._root || this._expanded || this._closing || this._islandDrag?.moved)
            return;
        if (this._reducedMotion) {
            this._root.set_scale(1, 1);
            return;
        }
        const hovered = Boolean(this._root.hover) && !this._systemNoticeActive;
        const target = hovered ? 1.014 : 1;
        this._root.set_pivot_point(0.5, 0.5);
        this._root.ease({
            scale_x: target,
            scale_y: target,
            duration: 240,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        });
    }

    _onStageEvent(event) {
        if (!this._enabled || !this._uiActorsAlive)
            return Clutter.EVENT_PROPAGATE;
        if (event.type() === Clutter.EventType.MOTION) {
            this._trackRestingEyes(event);
            const [pointerX, pointerY] = event.get_coords();
            this._updatePointerDrag(pointerX, pointerY);
            if (!this._islandDrag && !this._tabDrag)
                this._updateBrowserTuckFromPointer(pointerX, pointerY);
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
        } else if (event.type() === Clutter.EventType.BUTTON_PRESS) {
            const [pointerX, pointerY] = event.get_coords();
            const inside = this._pointerInRoot(pointerX, pointerY);
            if (this._expanded && !inside) {
                this._pinned = false;
                this._setExpanded(false);
                return Clutter.EVENT_PROPAGATE;
            }
            if (inside && event.get_button() === 1)
                this._beginPointerDrag(pointerX, pointerY);
        } else if (event.type() === Clutter.EventType.BUTTON_RELEASE) {
            this._endPointerDrag();
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _pointerInRoot(pointerX, pointerY) {
        if (!this._root)
            return false;
        const [x, y] = this._root.get_transformed_position();
        const [width, height] = this._root.get_transformed_size();
        return pointerX >= x && pointerX <= x + width
            && pointerY >= y && pointerY <= y + height;
    }

    _tabKeyAt(pointerX, pointerY) {
        if (!this._tabBar)
            return null;
        const [tabX, tabY] = this._tabBar.get_transformed_position();
        const [tabWidth, tabHeight] = this._tabBar.get_transformed_size();
        if (pointerX < tabX || pointerX > tabX + tabWidth
            || pointerY < tabY || pointerY > tabY + tabHeight)
            return null;
        for (const page of this._visiblePages()) {
            const entry = this._pageButtons.get(page.key);
            if (!entry?.slot.visible)
                continue;
            const [slotX, slotY] = entry.slot.get_transformed_position();
            const [slotWidth, slotHeight] = entry.slot.get_transformed_size();
            if (pointerX >= slotX && pointerX <= slotX + slotWidth
                && pointerY >= slotY && pointerY <= slotY + slotHeight)
                return page.key;
        }
        return null;
    }

    _beginPointerDrag(pointerX, pointerY) {
        if (this._tabDrag || this._islandDrag || this._closing || this._systemNoticeActive
            || this._tuckedByBrowser || this._userHidden || !this._root?.visible)
            return;
        if (this._expanded) {
            const key = this._tabKeyAt(pointerX, pointerY);
            if (key) {
                const entry = this._pageButtons.get(key);
                const [slotX] = entry.slot.get_transformed_position();
                const [tabX] = this._tabBar.get_transformed_position();
                for (const page of this._visiblePages())
                    this._pageButtons.get(page.key)?.slot.remove_all_transitions();
                this._tabDrag = {
                    key,
                    startX: pointerX,
                    startY: pointerY,
                    moved: false,
                    grabOffset: pointerX - slotX,
                    visualX: slotX - tabX,
                    width: entry.slot.width,
                };
                this._tabBar.set_child_above_sibling(entry.slot, null);
                if (!this._reducedMotion) {
                    entry.slot.set_pivot_point(0.5, 0.5);
                    entry.slot.set_scale(1.05, 1.05);
                }
                return;
            }
            const [, rootY] = this._root.get_transformed_position();
            if (pointerY > rootY + HEADER_HEIGHT)
                return;
        }
        this._clearTimeout('_hoverOpenSource');
        this._islandDrag = {
            startX: pointerX,
            startY: pointerY,
            rootX: this._root.x,
            rootY: this._root.y,
            moved: false,
        };
    }

    _updatePointerDrag(pointerX, pointerY) {
        if (this._tabDrag) {
            const drag = this._tabDrag;
            if (!drag.moved && Math.abs(pointerX - drag.startX) >= DRAG_THRESHOLD)
                drag.moved = true;
            if (drag.moved)
                this._updateTabDrag(pointerX);
            return;
        }
        const drag = this._islandDrag;
        if (!drag)
            return;
        if (!drag.moved && Math.hypot(pointerX - drag.startX, pointerY - drag.startY) >= DRAG_THRESHOLD)
            drag.moved = true;
        if (!drag.moved)
            return;
        this._clearTimeout('_hoverOpenSource');
        if (!this._reducedMotion) {
            this._root.set_pivot_point(0.5, 0.5);
            this._root.set_scale(1.01, 1.01);
        }
        this._islandClickSuppressUntil = GLib.get_monotonic_time() + 100_000;
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;
        const maxX = monitor.x + Math.max(0, monitor.width - this._root.width);
        const maxY = monitor.y + Math.max(0, monitor.height - this._root.height);
        this._root.set_position(
            Math.max(monitor.x, Math.min(maxX, drag.rootX + pointerX - drag.startX)),
            Math.max(monitor.y, Math.min(maxY, drag.rootY + pointerY - drag.startY))
        );
    }

    _updateTabDrag(pointerX) {
        const drag = this._tabDrag;
        if (!drag?.moved)
            return;
        const [tabX] = this._tabBar.get_transformed_position();
        const [tabWidth] = this._tabBar.get_transformed_size();
        const localX = pointerX - tabX;
        drag.visualX = Math.max(0, Math.min(tabWidth - drag.width,
            localX - drag.grabOffset));
        const pages = this._visiblePages();
        const others = pages.filter(page => page.key !== drag.key);
        let insertBefore = null;
        for (const page of others) {
            const entry = this._pageButtons.get(page.key);
            const [slotX] = entry.slot.get_transformed_position();
            if (localX < slotX - tabX + entry.slot.width / 2) {
                insertBefore = page.key;
                break;
            }
        }
        const order = this._preferences.tabOrder.filter(key => key !== drag.key);
        const index = insertBefore ? order.indexOf(insertBefore) : order.length;
        order.splice(index < 0 ? order.length : index, 0, drag.key);
        if (order.join('|') !== this._preferences.tabOrder.join('|')) {
            this._preferences.tabOrder = order;
            this._layoutTabs(this._expandedWidth());
        }
        this._tabDragSuppressUntil = GLib.get_monotonic_time() + 100_000;
        const entry = this._pageButtons.get(drag.key);
        if (entry) {
            entry.slot.set_position(drag.visualX,
                Math.round((TABBAR_HEIGHT - 30) / 2));
        }
    }

    _endTabDrag() {
        const drag = this._tabDrag;
        this._tabDrag = null;
        if (!drag)
            return;
        this._pageButtons.get(drag.key)?.slot.set_scale(1, 1);
        for (const page of this._visiblePages())
            this._pageButtons.get(page.key)?.slot.remove_all_transitions();
        if (!drag.moved)
            return;
        this._preferences.tabOrder = normalizeTabOrder(this._preferences.tabOrder);
        this._savePreferences();
        this._tabDragSuppressUntil = GLib.get_monotonic_time() + 100_000;
        this._layoutTabs(this._expandedWidth());
        if (this._activePage === 'settings' && this._settingsSection === 'tabs')
            this._renderPanel();
    }

    _endPointerDrag() {
        if (this._tabDrag)
            this._endTabDrag();
        if (this._islandDrag)
            this._endIslandDrag();
    }

    _endIslandDrag() {
        const drag = this._islandDrag;
        if (!drag)
            return;
        this._islandDrag = null;
        if (!drag.moved)
            return;
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;
        const width = this._root.width;
        const height = this._root.height;
        const distances = {
            top: this._root.y - monitor.y,
            bottom: monitor.y + monitor.height - (this._root.y + height),
            left: this._root.x - monitor.x,
            right: monitor.x + monitor.width - (this._root.x + width),
        };
        let mode = 'free';
        let nearest = EDGE_SNAP_DISTANCE;
        for (const edge of ['top', 'bottom', 'left', 'right']) {
            if (distances[edge] <= nearest) {
                nearest = distances[edge];
                mode = edge;
            }
        }
        const spanX = Math.max(1, monitor.width - width);
        const spanY = Math.max(1, monitor.height - height);
        this._preferences.positionX = clampUnit((this._root.x - monitor.x) / spanX, 0.5);
        this._preferences.positionY = clampUnit((this._root.y - monitor.y) / spanY, 0);
        this._preferences.positionMode = mode;
        this._savePreferences();
        this._clearTimeout('_hoverOpenSource');
        this._islandClickSuppressUntil = GLib.get_monotonic_time() + 100_000;
        this._root.set_scale(1, 1);
        this._applyIslandPosition(true);
        this._updatePositionButtons();
        this._updateRestingLift();
    }

    _islandPositionTarget() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor || !this._root)
            return {x: 0, y: 0};
        const width = this._root.width || this._root.get_preferred_width(-1)[1];
        const height = this._root.height || this._root.get_preferred_height(-1)[1];
        const mode = this._preferences?.positionMode || 'top';
        const spanX = Math.max(0, monitor.width - width);
        const spanY = Math.max(0, monitor.height - height);
        const centeredX = monitor.x + Math.round(spanX / 2);
        const preferredX = mode === 'top' || mode === 'bottom'
            ? centeredX
            : monitor.x + Math.round(spanX * clampUnit(this._preferences?.positionX, 0.5));
        const preferredY = monitor.y + Math.round(spanY * clampUnit(this._preferences?.positionY, 0));
        let x = preferredX;
        let y = preferredY;
        if (mode === 'top') {
            x = centeredX;
            y = monitor.y + (this._preferences?.islandShape === 'pill' && !this._tuckedByBrowser ? 8 : 0);
        } else if (mode === 'bottom') {
            x = centeredX;
            y = monitor.y + monitor.height - height;
        } else if (mode === 'left')
            x = monitor.x;
        else if (mode === 'right')
            x = monitor.x + monitor.width - width;
        return {
            x: Math.max(monitor.x, Math.min(monitor.x + spanX, x)),
            y: Math.max(monitor.y, Math.min(monitor.y + spanY, y)),
        };
    }

    _storeIslandPosition() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor || !this._root)
            return;
        const spanX = Math.max(1, monitor.width - this._root.width);
        const spanY = Math.max(1, monitor.height - this._root.height);
        this._preferences.positionX = clampUnit((this._root.x - monitor.x) / spanX,
            this._preferences.positionX);
        this._preferences.positionY = clampUnit((this._root.y - monitor.y) / spanY,
            this._preferences.positionY);
    }

    _applyIslandPosition(animate = false) {
        if (!this._root)
            return;
        const target = this._islandPositionTarget();
        this._surface?.queue_repaint();
        for (const ear of this._islandEars)
            ear.queue_repaint();
        this._positionAnimating = Boolean(animate) && !this._reducedMotion;
        this._layoutIsland();
        if (this._positionAnimating) {
            this._root.ease({
                x: target.x,
                y: target.y,
                duration: 260,
                mode: Clutter.AnimationMode.EASE_OUT_QUINT,
                onComplete: () => {
                    this._positionAnimating = false;
                    this._positionIsland();
                },
            });
        } else {
            this._root.set_position(target.x, target.y);
        }
    }

    _setPositionMode(mode) {
        if (!POSITION_MODES.includes(mode) || this._preferences.positionMode === mode)
            return;
        this._storeIslandPosition();
        if (mode !== 'top' && this._tuckedByBrowser)
            this._setBrowserTucked(false);
        this._preferences.positionMode = mode;
        this._savePreferences();
        this._applyIslandPosition(true);
        this._updatePositionButtons();
    }

    _updatePositionButtons() {
        if (!this._positionButtons)
            return;
        for (const [key, button] of this._positionButtons) {
            if (key === this._preferences.positionMode) {
                button.add_style_class_name('perdana-island__setting-option--active');
            } else {
                button.remove_style_class_name('perdana-island__setting-option--active');
                button.set_style('');
            }
        }
        this._applyAccentStyles();
    }

    _connectBrightnessMonitor() {
        this._connectBrightnessOsdMonitor();
        const brightnessManager = Main.brightnessManager;
        if (brightnessManager && !this._brightnessManagerSignal) {
            this._brightnessManagerSignal = brightnessManager.connect('user-update', () => {
                const level = brightnessManager.globalScale?.value;
                if (!Number.isFinite(level))
                    return;
                this._lastBrightnessOsdRequestAt = GLib.get_monotonic_time();
                this._scheduleBrightnessNotice(Math.round(level * 100));
            });
        }
        if (this._brightnessSignal)
            Gio.DBus.session.signal_unsubscribe(this._brightnessSignal);
        this._brightnessSignal = Gio.DBus.session.signal_subscribe(
            MUTTER_DISPLAY_CONFIG,
            'org.freedesktop.DBus.Properties',
            'PropertiesChanged',
            MUTTER_DISPLAY_CONFIG_PATH,
            MUTTER_DISPLAY_CONFIG,
            Gio.DBusSignalFlags.NONE,
            (_connection, _sender, _path, _interface, _signal, parameters) => {
                if (!this._enabled || !this._uiActorsAlive)
                    return;
                const changedInterface = parameters.get_child_value(0).get_string()[0];
                if (changedInterface !== MUTTER_DISPLAY_CONFIG)
                    return;
                const changedProperties = parameters.get_child_value(1);
                const backlight = changedProperties.lookup_value('Backlight', null);
                if (!backlight)
                    return;
                const percent = this._brightnessPercentFromBacklight(backlight);
                const sinceOsdRequest = GLib.get_monotonic_time() - this._lastBrightnessOsdRequestAt;
                if (percent !== null && sinceOsdRequest > 600_000)
                    this._scheduleBrightnessNotice(percent);
            }
        );
    }

    _connectBrightnessOsdMonitor() {
        const manager = Main.osdWindowManager;
        if (!manager || (typeof manager.show !== 'function'
            && typeof manager.showOne !== 'function' && typeof manager.showAll !== 'function'))
            return;
        if (this._brightnessOsdManager === manager)
            return;
        this._disconnectBrightnessOsdMonitor();
        this._brightnessOsdManager = manager;
        if (typeof manager.show === 'function') {
            this._brightnessOsdOriginalShow = manager.show;
            this._brightnessOsdShowWrapper = (icon, label, levels) => {
                this._onBrightnessOsdRequest(icon, levels);
                return this._brightnessOsdOriginalShow.call(manager, icon, label, levels);
            };
            manager.show = this._brightnessOsdShowWrapper;
        }
        if (typeof manager.showOne === 'function') {
            this._brightnessOsdOriginalShowOne = manager.showOne;
            this._brightnessOsdShowOneWrapper = (monitorIndex, icon, label, level, maxLevel) => {
                this._onBrightnessOsdRequest(icon, level);
                return this._brightnessOsdOriginalShowOne.call(manager,
                    monitorIndex, icon, label, level, maxLevel);
            };
            manager.showOne = this._brightnessOsdShowOneWrapper;
        }
        if (typeof manager.showAll === 'function') {
            this._brightnessOsdOriginalShowAll = manager.showAll;
            this._brightnessOsdShowAllWrapper = (icon, label, level, maxLevel) => {
                this._onBrightnessOsdRequest(icon, level);
                return this._brightnessOsdOriginalShowAll.call(manager, icon, label, level, maxLevel);
            };
            manager.showAll = this._brightnessOsdShowAllWrapper;
        }
    }

    _disconnectBrightnessOsdMonitor() {
        const manager = this._brightnessOsdManager;
        if (!manager)
            return;
        if (this._brightnessOsdShowWrapper && manager.show === this._brightnessOsdShowWrapper)
            manager.show = this._brightnessOsdOriginalShow;
        if (this._brightnessOsdShowOneWrapper && manager.showOne === this._brightnessOsdShowOneWrapper)
            manager.showOne = this._brightnessOsdOriginalShowOne;
        if (this._brightnessOsdShowAllWrapper && manager.showAll === this._brightnessOsdShowAllWrapper)
            manager.showAll = this._brightnessOsdOriginalShowAll;
        this._brightnessOsdManager = null;
        this._brightnessOsdOriginalShow = null;
        this._brightnessOsdOriginalShowOne = null;
        this._brightnessOsdOriginalShowAll = null;
        this._brightnessOsdShowWrapper = null;
        this._brightnessOsdShowOneWrapper = null;
        this._brightnessOsdShowAllWrapper = null;
    }

    _onBrightnessOsdRequest(icon, level) {
        const names = typeof icon === 'string'
            ? [icon]
            : (typeof icon?.get_names === 'function' ? icon.get_names() : []);
        if (level && typeof level === 'object') {
            const primaryIndex = Main.layoutManager.primaryMonitor?.index;
            const primaryLevel = primaryIndex === undefined ? null : level[primaryIndex]?.level;
            const firstLevel = Object.values(level).find(item => Number.isFinite(item?.level))?.level;
            level = Number.isFinite(primaryLevel) ? primaryLevel : firstLevel;
        }
        if (!names.some(name => name.includes('brightness')) || !Number.isFinite(level))
            return;
        this._lastBrightnessOsdRequestAt = GLib.get_monotonic_time();
        this._scheduleBrightnessNotice(Math.max(0, Math.min(100, Math.round(level * 100))));
    }

    _brightnessPercentFromBacklight(backlight) {
        try {
            // PropertiesChanged stores a{sv} values inside a variant wrapper.
            // Unwrap it before reading the (ua{sv}) Backlight payload.
            const payload = backlight.get_type_string() === 'v'
                ? backlight.get_variant() : backlight;
            const entries = payload.get_child_value(1);
            const displays = [];
            for (let i = 0; i < entries.n_children(); i++) {
                const fields = {};
                const dictionary = entries.get_child_value(i);
                for (let j = 0; j < dictionary.n_children(); j++) {
                    const pair = dictionary.get_child_value(j);
                    const key = pair.get_child_value(0).deep_unpack();
                    fields[key] = pair.get_child_value(1).get_variant().deep_unpack();
                }
                if (!fields.active || !Number.isFinite(fields.value)
                    || !Number.isFinite(fields.min) || !Number.isFinite(fields.max)
                    || fields.max <= fields.min)
                    continue;
                displays.push(fields);
            }
            const display = displays.find(item => /^(eDP|LVDS|DSI)/i.test(item.connector || ''))
                || displays[0];
            if (!display)
                return null;
            const percent = (display.value - display.min) / (display.max - display.min) * 100;
            return Math.max(0, Math.min(100, Math.round(percent)));
        } catch (_error) {
            return null;
        }
    }

    _scheduleBrightnessNotice(percent) {
        const now = GLib.get_monotonic_time();
        if (this._brightnessReadSource && this._pendingBrightnessPercent === percent)
            return;
        if (this._lastBrightnessNoticePercent === percent
            && now - this._lastBrightnessNoticeAt < 350_000)
            return;
        this._pendingBrightnessPercent = percent;
        this._clearTimeout('_brightnessReadSource');
        this._brightnessReadSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 140, () => {
            this._brightnessReadSource = 0;
            this._pendingBrightnessPercent = null;
            this._lastBrightnessNoticePercent = percent;
            this._lastBrightnessNoticeAt = GLib.get_monotonic_time();
            this._showSystemNotice('brightness', {percent});
            return GLib.SOURCE_REMOVE;
        });
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

    _makeTabIcon(pageKey) {
        const icon = new St.DrawingArea({style_class: 'perdana-island__tab-icon'});
        icon.connect('repaint', area => {
            const [width, height] = area.get_surface_size();
            if (width <= 0 || height <= 0)
                return;
            const cr = area.get_context();
            cr.scale(width / 24, height / 24);
            cr.setLineWidth(1.7);
            cr.setLineCap(1);
            cr.setLineJoin(1);
            cr.setSourceRGBA(1, 1, 1, this._activePage === pageKey ? 1 : 0.64);
            const roundedRect = (x, y, w, h, r) => {
                cr.moveTo(x + r, y);
                cr.lineTo(x + w - r, y);
                cr.curveTo(x + w, y, x + w, y, x + w, y + r);
                cr.lineTo(x + w, y + h - r);
                cr.curveTo(x + w, y + h, x + w, y + h, x + w - r, y + h);
                cr.lineTo(x + r, y + h);
                cr.curveTo(x, y + h, x, y + h, x, y + h - r);
                cr.lineTo(x, y + r);
                cr.curveTo(x, y, x, y, x + r, y);
                cr.closePath();
            };

            switch (pageKey) {
            case 'summary':
                roundedRect(3.5, 4.5, 7, 6, 1.5);
                roundedRect(13.5, 4.5, 7, 6, 1.5);
                roundedRect(3.5, 13.5, 7, 6, 1.5);
                roundedRect(13.5, 13.5, 7, 6, 1.5);
                break;
            case 'media':
                cr.moveTo(9, 18); cr.lineTo(9, 6); cr.lineTo(19, 4); cr.lineTo(19, 16);
                cr.arc(6.5, 18, 2.5, 0, Math.PI * 2);
                cr.arc(16.5, 16, 2.5, 0, Math.PI * 2);
                break;
            case 'lyrics':
            case 'notes':
                roundedRect(5, 3.5, 14, 17, 1.2);
                if (pageKey === 'lyrics') {
                    cr.moveTo(13, 3.5); cr.lineTo(13, 8); cr.lineTo(19, 8);
                    cr.moveTo(8, 12); cr.lineTo(16, 12);
                    cr.moveTo(8, 15.5); cr.lineTo(16, 15.5);
                } else {
                    cr.moveTo(8, 8); cr.lineTo(16, 8);
                    cr.moveTo(8, 12); cr.lineTo(16, 12);
                    cr.moveTo(8, 16); cr.lineTo(13, 16);
                }
                break;
            case 'focus':
            case 'reminders':
                cr.arc(12, 13, 7.5, 0, Math.PI * 2);
                cr.moveTo(12, 9); cr.lineTo(12, 13); cr.lineTo(15, 14.8);
                if (pageKey === 'focus') {
                    cr.moveTo(9.5, 2.7); cr.lineTo(14.5, 2.7);
                } else {
                    cr.moveTo(5, 5); cr.lineTo(3, 7);
                    cr.moveTo(19, 5); cr.lineTo(21, 7);
                }
                break;
            case 'shelf':
                cr.moveTo(3, 7.5); cr.curveTo(3, 6.5, 3.7, 6, 4.7, 6);
                cr.lineTo(9, 6); cr.lineTo(11, 8.5); cr.lineTo(19.3, 8.5);
                cr.curveTo(20.3, 8.5, 21, 9.2, 21, 10.2); cr.lineTo(21, 18);
                cr.curveTo(21, 19, 20.3, 19.5, 19.3, 19.5); cr.lineTo(4.7, 19.5);
                cr.curveTo(3.7, 19.5, 3, 18.8, 3, 18); cr.closePath();
                break;
            case 'tasks':
                cr.arc(12, 12, 8.5, 0, Math.PI * 2);
                cr.moveTo(8.2, 12.1); cr.lineTo(10.7, 14.6); cr.lineTo(15.9, 9.4);
                break;
            case 'messages':
                cr.moveTo(5, 5.5); cr.lineTo(19, 5.5);
                cr.curveTo(20.4, 5.5, 21, 6.1, 21, 7.5); cr.lineTo(21, 14.8);
                cr.curveTo(21, 16.2, 20.3, 17, 18.8, 17); cr.lineTo(12, 17);
                cr.lineTo(7.5, 20.2); cr.lineTo(7.5, 17); cr.lineTo(5, 17);
                cr.curveTo(3.6, 17, 3, 16.3, 3, 14.8); cr.lineTo(3, 7.8);
                cr.curveTo(3, 6.2, 3.8, 5.5, 5, 5.5); cr.closePath();
                break;
            case 'today':
                roundedRect(3.5, 5, 17, 15.5, 2.5);
                cr.moveTo(3.5, 10); cr.lineTo(20.5, 10);
                cr.moveTo(8, 3); cr.lineTo(8, 7);
                cr.moveTo(16, 3); cr.lineTo(16, 7);
                break;
            case 'notifications':
                cr.moveTo(18, 9); cr.curveTo(18, 5.7, 15.4, 3, 12, 3);
                cr.curveTo(8.6, 3, 6, 5.7, 6, 9); cr.curveTo(6, 15, 4, 16, 4, 18);
                cr.lineTo(20, 18); cr.curveTo(20, 16, 18, 15, 18, 9);
                cr.moveTo(10, 21); cr.curveTo(11, 22.5, 13, 22.5, 14, 21);
                break;
            case 'settings': {
                const teeth = 16;
                for (let i = 0; i < teeth; i++) {
                    const angle = -Math.PI / 2 + (Math.PI * 2 * i) / teeth;
                    const radius = i % 2 === 0 ? 9 : 7.4;
                    const x = 12 + Math.cos(angle) * radius;
                    const y = 12 + Math.sin(angle) * radius;
                    if (i === 0)
                        cr.moveTo(x, y);
                    else
                        cr.lineTo(x, y);
                }
                cr.closePath();
                cr.arc(12, 12, 3.1, 0, Math.PI * 2);
                break;
            }
            }
            cr.stroke();
            cr.$dispose();
        });
        icon.set_size(18, 18);
        return icon;
    }

    _buildTabs() {
        for (const page of PAGES) {
            const contents = new St.BoxLayout({
                style_class: 'perdana-island__tab-content',
                y_align: Clutter.ActorAlign.CENTER,
            });
            const icon = this._makeTabIcon(page.key);
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
            button.connect('clicked', () => {
                if (GLib.get_monotonic_time() < this._tabDragSuppressUntil)
                    return;
                this._selectPage(page.key);
            });
            attachButtonMotion(button, {hoverScale: 1, pressScale: 0.98});
            const pill = new St.Widget({
                reactive: false,
                style_class: 'perdana-island__tab-pill',
            });
            pill.visible = false;
            pill.opacity = 0;
            pill.set_pivot_point(0.5, 0.5);
            const slot = new St.Widget({
                layout_manager: new Clutter.FixedLayout(),
                reactive: false,
                style_class: 'perdana-island__tab-slot',
            });
            slot.add_child(pill);
            slot.add_child(button);
            slot.visible = page.key === 'settings'
                || this._preferences.visiblePages[page.key] !== false;
            this._tabBar.add_child(slot);
            this._pageButtons.set(page.key, {slot, pill, button, icon, label, selected: undefined});
        }
        this._tabsPainted = false;
        this._layoutTabs(this._expandedWidth());
    }

    _layoutTabs(width) {
        if (!this._pageButtons)
            return;
        const pages = this._visiblePages();
        const buttonHeight = 30;
        const inset = 8;
        const available = Math.max(0, width - 8);
        const activePage = pages.find(page => page.key === this._activePage);
        const activeEntry = this._pageButtons.get(this._activePage);
        let activeWidth = 34;
        if (activePage && activeEntry) {
            const naturalWidth = activeEntry.label.get_preferred_width(-1)[1];
            const labelWidth = Math.ceil(Math.max(naturalWidth, activePage.label.length * 7));
            activeWidth = Math.min(labelWidth + 18 + 6 + inset * 2, Math.max(34, available));
        }
        // Eleven pages no longer fit the narrowest island, so inactive buttons
        // and gaps tighten before the selected label can clip.
        const slots = Math.max(1, pages.length - 1);
        let gap = 4;
        let inactiveWidth = 34;
        if (activeWidth + inactiveWidth * slots + gap * slots > available) {
            gap = 3;
            inactiveWidth = Math.max(22,
                Math.floor((available - activeWidth - gap * slots) / slots));
        }
        const widths = pages.map(page => page.key === this._activePage ? activeWidth : inactiveWidth);
        const totalWidth = widths.reduce((total, item) => total + item, 0) + gap * (pages.length - 1);
        const visibleKeys = new Set(pages.map(page => page.key));
        for (const page of PAGES) {
            const entry = this._pageButtons.get(page.key);
            if (entry && !visibleKeys.has(page.key))
                entry.slot.visible = false;
        }
        let x = Math.max(0, Math.round((width - totalWidth) / 2));
        for (const [visibleIndex, page] of pages.entries()) {
            const entry = this._pageButtons.get(page.key);
            if (!entry)
                continue;
            entry.slot.visible = true;
            const active = page.key === this._activePage;
            const buttonWidth = widths[visibleIndex];
            entry.icon.queue_repaint();
            const slotY = Math.round((TABBAR_HEIGHT - buttonHeight) / 2);
            const drag = this._tabDrag;
            if (drag?.moved && drag.key === page.key) {
                const maxX = Math.max(0, width - buttonWidth);
                const visualX = Math.max(0, Math.min(maxX, drag.visualX ?? x));
                entry.slot.set_position(visualX, slotY);
            } else if (drag?.moved && !this._reducedMotion) {
                if (Math.abs(entry.slot.x - x) > 0.5) {
                    entry.slot.remove_all_transitions();
                    entry.slot.ease({
                        x,
                        duration: 170,
                        mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                    });
                }
            } else {
                entry.slot.set_position(x, slotY);
            }
            entry.slot.set_size(buttonWidth, buttonHeight);
            entry.button.set_position(0, 0);
            entry.button.set_size(buttonWidth, buttonHeight);
            entry.pill.set_position(0, 0);
            entry.pill.set_size(buttonWidth, buttonHeight);
            entry.button.accessible_name = active ? `${page.label}, selected` : page.label;
            if (entry.selected !== active) {
                const wasSelected = entry.selected === true;
                entry.selected = active;
                if (active) {
                    entry.button.add_style_class_name('perdana-button--nav-active');
                    entry.label.visible = true;
                    entry.pill.visible = true;
                    entry.label.remove_all_transitions();
                    entry.pill.remove_all_transitions();
                    entry.icon.remove_all_transitions();
                    if (!this._tabsPainted || this._reducedMotion) {
                        entry.label.opacity = 255;
                        entry.pill.opacity = 255;
                        entry.pill.set_scale(1, 1);
                    } else {
                        entry.label.opacity = 0;
                        entry.label.ease({
                            opacity: 255,
                            duration: 190,
                            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                        });
                        entry.pill.opacity = 0;
                        entry.pill.set_scale(0.9, 0.9);
                        entry.pill.ease({
                            opacity: 255,
                            scale_x: 1,
                            scale_y: 1,
                            duration: 280,
                            mode: Clutter.AnimationMode.EASE_OUT_QUINT,
                        });
                        entry.icon.set_pivot_point(0.5, 0.5);
                        entry.icon.set_scale(0.86, 0.86);
                        entry.icon.ease({
                            scale_x: 1,
                            scale_y: 1,
                            duration: 300,
                            mode: Clutter.AnimationMode.EASE_OUT_BACK,
                        });
                    }
                } else {
                    entry.button.remove_style_class_name('perdana-button--nav-active');
                    entry.button.set_style('');
                    if (!this._tabsPainted || this._reducedMotion) {
                        entry.label.remove_all_transitions();
                        entry.pill.remove_all_transitions();
                        entry.label.visible = false;
                        entry.label.opacity = 0;
                        entry.pill.visible = false;
                        entry.pill.opacity = 0;
                    } else if (wasSelected) {
                        entry.label.remove_all_transitions();
                        entry.pill.remove_all_transitions();
                        entry.label.opacity = 0;
                        entry.label.visible = false;
                        entry.pill.opacity = 0;
                        entry.pill.visible = false;
                    }
                }
            }
            x += buttonWidth + gap;
        }
        this._tabsPainted = true;
    }

    _renderPanel(animate = false) {
        if (!this._pageViewport)
            return;

        this._clearTimeout('_settingsNavScrollSource');
        this._clearTimeout('_notesScrollSource');
        this._clearTimeout('_taskFocusSource');

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
        this._summaryMediaBody = null;
        this._summaryMediaEmpty = null;
        this._summaryTitle = null;
        this._summaryArtist = null;
        this._summaryLyric = null;
        this._summaryIconActors = [];
        this._summaryRows = {};
        this._shelfClipboardCountLabel = null;
        this._shelfFilesCountLabel = null;
        this._progressSeeking = false;
        this._progressCanSeek = false;
        this._lyricsStatusLabel = null;
        this._lyricsViewport = null;
        this._lyricsRail = null;
        this._lyricsWaitLabel = null;
        this._lyricsRenderedLines = null;
        this._lyricsWindowStart = -1;
        this._lyricsLineLabels = [];
        this._lyricsLayoutWidth = 0;
        this._lyricsLayoutHeight = 0;
        this._lyricsPlaybackButton = null;
        this._lyricsRestingToggle = null;
        this._lyricsDisplayedIndex = -1;
        this._lyricsDisplayGap = false;
        this._notesEditorEntry = null;
        this._notesEditorScroll = null;
        this._notesEditorBox = null;
        this._notesEditorWidth = 0;
        this._notesSaveLabel = null;
        this._notesUndoBanner = null;
        this._notesRowLabels = null;
        this._reminderRows = null;
        this._reminderNextCaption = null;
        this._reminderNextName = null;
        this._reminderNextTime = null;
        this._reminderNextIn = null;
        this._reminderCityLabel = null;
        this._reminderWaterCaption = null;
        this._reminderWaterValue = null;
        this._reminderWaterDetail = null;
        this._reminderWaterFill = null;
        this._reminderRefreshButton = null;
        this._reminderWaterTrackWidth = 0;
        this._capturePreview = null;
        this._capturePreviewWidth = 0;
        this._captureStatusLabel = null;
        const previous = this._pageBody;
        const body = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            style_class: 'perdana-island__page',
        });
        body.set_position(0, 0);
        body.set_size(this._pageWidth(), this._bodyHeight());
        // Attach the page before filling it so measuring the wrapped note
        // editor can resolve its theme node and preferred height.
        this._pageBody = body;
        this._pageViewport.add_child(body);
        if (this._captureOpen) {
            this._renderQuickCapturePanel(body);
        } else if (this._activePage === 'media')
            this._renderMediaPage(body);
        else if (this._activePage === 'lyrics')
            this._renderLyricsPage(body);
        else if (this._activePage === 'focus')
            this._renderFocusPage(body);
        else if (this._activePage === 'tasks')
            this._renderTasksPage(body);
        else if (this._activePage === 'notes')
            this._renderNotesPage(body);
        else if (this._activePage === 'shelf' || this._clipboardVisible()) {
            // Keep the Shelf tabs and content in one viewport. A second nested
            // page used to offset and clip the bottom of both Files and Clipboard.
            if (this._activePage === 'clipboard' || this._shelfSegment === 'clipboard') {
                this._shelfSegment = 'clipboard';
                this._renderClipboardPage(body);
            } else {
                this._renderShelfPage(body);
            }
        }
        else if (this._activePage === 'today')
            this._renderTodayPage(body);
        else if (this._activePage === 'reminders')
            this._renderRemindersPage(body);
        else
            this._renderInfoPage(body, this._activePage);
        this._layoutPanel(this._content?.width || CONTENT_WIDTH);
        this._setEqualizerPlaying(
            this._mediaEqualizer,
            Boolean(this._expanded && ['media', 'lyrics', 'summary'].includes(this._activePage) && this._isPlaying())
        );
        if (previous && previous !== body) {
            previous.remove_all_transitions();
            previous.destroy();
            if (this._reducedMotion) {
                this._pageTransitionUntil = 0;
                body.opacity = 255;
            } else if (animate) {
                this._pageTransitionUntil = GLib.get_monotonic_time() + 250000;
                body.translation_x = (this._pageTransitionDirection || 1) * 10;
                body.opacity = 0;
                body.ease({
                    opacity: 255,
                    translation_x: 0,
                    duration: 250,
                    mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                });
            } else if (this._expanded) {
                const remaining = Math.max(0,
                    this._pageTransitionUntil - GLib.get_monotonic_time());
                if (remaining > 0) {
                    body.translation_x = (this._pageTransitionDirection || 1) * 10;
                    body.opacity = 0;
                    body.ease({
                        opacity: 255,
                        translation_x: 0,
                        duration: Math.max(1, Math.ceil(remaining / 1000)),
                        mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                    });
                } else {
                    this._pageTransitionUntil = 0;
                    body.opacity = 0;
                    body.ease({
                        opacity: 255,
                        duration: 140,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    });
                }
            } else {
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
            .replace(/\s*[-–—]\s*from\s+["“][^"”]+["”]\s+(?:movie|film)\s*$/i, '')
            .replace(/\s*\(\s*from\s+["“][^"”]+["”]\s+(?:movie|film)\s*\)\s*$/i, '')
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
        const boundedText = String(text || '').slice(0, MAX_LYRIC_SOURCE_LENGTH);
        for (const rawLine of boundedText.split(/\r?\n/)) {
            if (lines.length >= MAX_LYRIC_LINES)
                break;
            const stamps = [...rawLine.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
            const lyricText = rawLine.replace(/\[[^\]]+\]/g, '').trim();
            if (stamps.length) {
                synced = true;
                for (const stamp of stamps) {
                    if (lines.length >= MAX_LYRIC_LINES)
                        break;
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
        this._lyricsSession.set_user_agent('Perdana Island/68 (https://github.com/txtperdana/perdana.island)');
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
            if (this._expanded && this._activePage === 'summary')
                this._updateSummaryMedia();
            this._updateCollapsedLabel();
        };
        const failed = (message, status) => {
            if (!current())
                return;
            if (status === Soup.Status.TOO_MANY_REQUESTS || status >= 500) {
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
            if (this._expanded && this._activePage === 'summary')
                this._updateSummaryMedia();
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

        const windowCapacity = VISIBLE_LYRIC_CONTEXT * 2 + 1;
        const maxWindowStart = Math.max(0, lines.length - windowCapacity);
        const windowStart = activeIndex < 0
            ? 0
            : Math.max(0, Math.min(activeIndex - VISIBLE_LYRIC_CONTEXT, maxWindowStart));
        const visibleLines = lines.slice(windowStart, windowStart + windowCapacity);
        const width = this._lyricsViewport.width;
        const viewportHeight = this._lyricsViewport.height || this._bodyHeight() - 16;
        const linesChanged = this._lyricsWindowStart !== windowStart
            || this._lyricsRenderedLines?.length !== visibleLines.length
            || visibleLines.some((line, index) => this._lyricsRenderedLines?.[index] !== line);

        if (linesChanged) {
            this._lyricsRail.remove_all_transitions();
            while (this._lyricsLineLabels.length < visibleLines.length) {
                const label = makeLabel('', 'perdana-island__lyrics-line perdana-island__lyrics-line--far');
                label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
                label.clutter_text.line_wrap = true;
                label.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
                label.set_position(0, 0);
                this._lyricsRail.add_child(label);
                this._lyricsLineLabels.push(label);
            }
            for (let index = 0; index < this._lyricsLineLabels.length; index++) {
                const label = this._lyricsLineLabels[index];
                label.remove_all_transitions();
                label.visible = index < visibleLines.length;
                if (index >= visibleLines.length)
                    continue;
                label.text = visibleLines[index].text;
                label.opacity = 0;
                label.remove_style_class_name('perdana-island__lyrics-line--current');
                label.remove_style_class_name('perdana-island__lyrics-line--near');
                label.add_style_class_name('perdana-island__lyrics-line--far');
                label.set_size(width, 24);
            }
            this._lyricsRail.set_size(width, 0);
            this._lyricsRenderedLines = visibleLines;
            this._lyricsWindowStart = windowStart;
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
        for (let index = 0; index < visibleLines.length; index++) {
            const label = this._lyricsLineLabels[index];
            const lineIndex = windowStart + index;
            const distance = activeIndex < 0 ? Infinity : Math.abs(lineIndex - activeIndex);
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
        if (visibleLines.length)
            railHeight -= 5;
        this._lyricsRail.set_size(width, railHeight);
        const activeWindowIndex = activeIndex - windowStart;
        const targetY = activeIndex < 0
            ? (viewportHeight - 24) / 2
            : viewportHeight / 2 - offsets[activeWindowIndex] - heights[activeWindowIndex] / 2;
        const duration = this._reducedMotion ? 160 : 620;
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
                mode: Clutter.AnimationMode.EASE_OUT_QUINT,
            });
        }
        this._lyricsWaitLabel.ease({
            opacity: displayGap ? 220 : 0,
            duration: this._reducedMotion ? 160 : 260,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        });
        for (let index = 0; index < visibleLines.length; index++) {
            const label = this._lyricsLineLabels[index];
            const distance = activeIndex < 0 ? Infinity : Math.abs(windowStart + index - activeIndex);
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
        this._progressFill._perdanaSmoothReady = false;
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
        this._focusLabel.set_pivot_point(0.5, 0.5);
        this._focusStatusLabel = makeLabel(
            remaining === 0 ? 'Complete' : this._focusModeLabel(),
            'perdana-island__timer-subtitle'
        );
        const timer = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
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
        attachButtonMotion(this._focusCustomUnitButton, {hoverScale: 1.03});
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
        place(body, this._focusToggleButton, controlsX, 104, actionWidth, 34);
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
        place(body, this._focusSessionsLabel, controlsX, 146, controlsWidth, 20);
        this._focusRing.queue_repaint();
    }

    _renderTasksPage(body) {
        this._taskTextEntry = null;
        this._taskTimeEntry = null;
        const todayKey = dateKey();
        const open = this._tasks.filter(task => !task.done)
            .sort((first, second) => taskScheduleKey(first).localeCompare(taskScheduleKey(second)));
        const completed = this._tasks.filter(task => task.done);
        const ordered = [...open, ...completed];
        const doneToday = this._tasksDoneToday().length;
        const rightX = 190;
        const rightWidth = this._pageWidth() - rightX;

        place(body, makeLabel('To-do', 'perdana-island__todo-heading'), 0, 8, 160, 22);
        place(body, makeLabel(`${completed.length}/${this._tasks.length}`, 'perdana-island__todo-count'),
            0, 30, 160, 44);
        const progressCaption = doneToday
            ? `${doneToday} task${doneToday === 1 ? '' : 's'} done today`
            : open.length
                ? `${open.length} task${open.length === 1 ? '' : 's'} remaining`
                : this._tasks.length ? 'All tasks done' : 'No tasks yet';
        place(body, makeLabel(progressCaption, 'perdana-island__todo-subtitle'), 2, 76, 184, 17);

        if (this._taskAdding) {
            const entry = new St.Entry({
                hint_text: 'Add a task',
                text: this._taskDraftText || '',
                can_focus: true,
                style_class: 'perdana-island__task-entry',
                accessible_name: 'Task text',
            });
            const timeEntry = new St.Entry({
                hint_text: '09:00',
                text: this._taskDraftDueText || '',
                can_focus: true,
                style_class: 'perdana-island__task-time-entry',
                accessible_name: 'Task time, 24 hour HH:MM',
            });
            const priorityLabel = this._taskDraftPriority
                ? TASK_PRIORITY_LABELS[this._taskDraftPriority] : 'Priority';
            const priorityButton = makeTextButton(
                priorityLabel,
                'Cycle task priority',
                () => this._cycleTaskDraftPriority(),
                `perdana-island__task-priority-button${this._taskDraftPriority
                    ? ` perdana-island__task-priority-button--${this._taskDraftPriority}` : ''}`
            );
            const addButton = makeTextButton('Add', 'Add task', () => this._submitTaskDraft(),
                'perdana-island__task-add');
            const cancelDraft = () => {
                this._taskAdding = false;
                this._taskDraftText = '';
                this._taskDraftDueText = '';
                this._taskDraftPriority = null;
                this._renderPanel();
            };
            entry.clutter_text.connect('activate', () => this._submitTaskDraft());
            entry.clutter_text.connect('key-press-event', (_actor, event) => {
                if (event.get_key_symbol() === Clutter.KEY_Escape) {
                    cancelDraft();
                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;
            });
            timeEntry.clutter_text.connect('activate', () => this._submitTaskDraft());
            timeEntry.clutter_text.connect('key-press-event', (_actor, event) => {
                if (event.get_key_symbol() === Clutter.KEY_Escape) {
                    cancelDraft();
                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;
            });
            place(body, entry, 0, 108, 180, 26);
            place(body, timeEntry, 0, 138, 52, 26);
            place(body, priorityButton, 56, 138, 64, 26);
            place(body, addButton, 124, 138, 56, 26);
            this._taskTextEntry = entry;
            this._taskTimeEntry = timeEntry;
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
                    this._taskDraftText = '';
                    this._taskDraftDueText = '';
                    this._taskDraftPriority = null;
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
            place(body, actions, 0, 102, 180, 30);
        }

        if (!ordered.length) {
            const empty = makeLabel('Your list is clear', 'perdana-island__muted');
            empty.clutter_text.x_align = Clutter.ActorAlign.CENTER;
            place(body, empty, rightX, 16, rightWidth, this._bodyHeight() - 24);
            return;
        }

        const rowHeight = 36;
        const rowGap = 7;
        const listHeight = ordered.length * (rowHeight + rowGap) - rowGap;
        const listWidth = Math.max(1, rightWidth - 8);
        const scroll = new St.ScrollView({
            overlay_scrollbars: false,
            style_class: 'perdana-island__task-scroll',
        });
        scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        const list = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
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
            attachButtonMotion(checkbox, {hoverScale: 1.09, pressScale: 0.91});
            row.add_child(checkbox);
            const label = makeLabel(
                task.text,
                task.done ? 'perdana-island__task-text perdana-island__task-text--done' : 'perdana-island__task-text'
            );
            label.x_expand = true;
            row.add_child(label);

            const scheduled = typeof task.dueDate === 'string';
            const timed = scheduled && Number.isInteger(task.due);
            const late = scheduled && !task.done && task.dueDate < todayKey;
            const dateText = scheduled && (task.dueDate !== todayKey || !timed)
                ? (task.dueDate === todayKey
                    ? 'Today'
                    : new Intl.DateTimeFormat('en-GB', {day: '2-digit', month: 'short'})
                        .format(new Date(`${task.dueDate}T00:00:00`))) + (timed ? ' ' : '')
                : '';
            const scheduleText = scheduled
                ? `${late ? 'Late ' : ''}${dateText}${timed ? formatClockTime(task.due) : ''}`.trim()
                : '';
            const chipWidth = scheduled ? Math.max(44, scheduleText.length * 6 + 14) : 0;
            const priorityWidth = task.priority ? 42 : 0;

            if (this._taskEditing) {
                const timeEntry = new St.Entry({
                    text: timed ? formatClockTime(task.due) : '',
                    hint_text: '--:--',
                    can_focus: true,
                    style_class: 'perdana-island__task-time-entry',
                    accessible_name: 'Time for ' + task.text,
                });
                timeEntry.clutter_text.connect('activate', () => {
                    const value = timeEntry.get_text().trim();
                    if (!value) {
                        this._setTaskTime(task.id, null);
                        return;
                    }
                    const minutes = parseClockTime(value);
                    if (minutes === null) {
                        timeEntry.add_style_class_name('perdana-island__task-entry--invalid');
                        return;
                    }
                    this._setTaskTime(task.id, minutes);
                });
                timeEntry.clutter_text.connect('key-press-event', (_actor, event) => {
                    if (event.get_key_symbol() !== Clutter.KEY_Escape)
                        return Clutter.EVENT_PROPAGATE;
                    timeEntry.set_text(timed ? formatClockTime(task.due) : '');
                    return Clutter.EVENT_STOP;
                });
                row.add_child(timeEntry);
                const priorityButton = makeTextButton(
                    task.priority ? TASK_PRIORITY_LABELS[task.priority] : 'Prio',
                    'Cycle priority for ' + task.text,
                    () => this._cycleTaskPriority(task.id),
                    `perdana-island__task-priority-button${task.priority
                        ? ` perdana-island__task-priority-button--${task.priority}` : ''}`
                );
                row.add_child(priorityButton);
                row.add_child(makeIconButton('user-trash-symbolic', 'Delete ' + task.text,
                    () => this._removeTask(task.id), 'perdana-button--task-delete'));
                label.clutter_text.max_width = Math.max(60, listWidth - 24 - 7 - 52 - 44 - 18 - 14);
            } else {
                if (scheduled) {
                    const timeLabel = makeLabel(
                        `${late ? 'Late ' : ''}${dateText}${timed ? formatClockTime(task.due) : ''}`,
                        `perdana-island__task-time${late ? ' perdana-island__task-time--late' : ''}`
                    );
                    timeLabel.x_align = Clutter.ActorAlign.CENTER;
                    row.add_child(timeLabel);
                }
                if (task.priority) {
                    const priorityLabel = makeLabel(TASK_PRIORITY_LABELS[task.priority],
                        `perdana-island__task-priority perdana-island__task-priority--${task.priority}`);
                    priorityLabel.x_align = Clutter.ActorAlign.CENTER;
                    row.add_child(priorityLabel);
                }
                label.clutter_text.max_width = Math.max(60, listWidth - 24 - 7 - chipWidth - priorityWidth - 12);
            }
            list.add_child(row);
        });
        scroll.add_child(list);
        place(body, scroll, rightX, 16, rightWidth, this._bodyHeight() - 24);
    }

    _renderNotesPage(body) {
        const pageWidth = this._pageWidth();
        const height = this._bodyHeight();
        // The island body already has PAGE_INSET on both sides; add only the
        // 4px preview padding here so Notes keeps the preview's full columns.
        const safeInset = 4;
        const contentWidth = Math.max(1, pageWidth - safeInset * 2);
        const columnGap = Math.max(18, Math.min(24, Math.round(contentWidth * 0.03)));
        const listWidth = Math.max(1, Math.min(
            260,
            Math.max(158, Math.round(contentWidth * 0.34)),
            Math.max(144, contentWidth - columnGap - 280)
        ));
        const editorX = safeInset + listWidth + columnGap;
        const editorWidth = Math.max(1, contentWidth - listWidth - columnGap);
        // St.ScrollView reserves a non-overlay scrollbar inside this width.
        // Keep the text actor clear of the scrollbar and the editor surface border.
        const editorScrollWidth = editorWidth;
        const editorContentWidth = Math.max(1, editorScrollWidth - 18);
        const notes = [...this._notes].sort((first, second) => second.updatedAt - first.updatedAt);
        const listScrollWidth = listWidth;
        const listContentWidth = Math.max(1, listWidth - 18);
        const undoVisible = Boolean(this._notesUndo);
        const listTop = 30;
        const listBottomInset = undoVisible ? 40 : 10;
        const listHeight = Math.max(1, height - listTop - listBottomInset);
        const statusY = height - 20;
        const editorTop = listTop;
        const editorBottom = statusY - 8;
        const statusState = this._notesSaveSource ? 'Saving…' : 'Saved locally';
        this._notesStatusValue = statusState;
        this._notesRowLabels = new Map();

        const heading = makeLabel(notes.length ? `Notes · ${notes.length}` : 'Notes',
            'perdana-island__notes-heading');
        heading.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        const addButtonWidth = Math.min(68, listWidth);
        const headingNaturalWidth = Math.ceil(heading.get_preferred_width(-1)[1]);
        const headingWidth = Math.max(1, Math.min(
            headingNaturalWidth,
            listWidth - addButtonWidth - 8
        ));
        heading.clutter_text.max_width = headingWidth;
        const newNoteContents = new St.BoxLayout({
            style_class: 'perdana-island__notes-add-content',
        });
        newNoteContents.add_child(new St.Icon({
            icon_name: 'list-add-symbolic',
            style_class: 'perdana-island__icon',
        }));
        newNoteContents.add_child(makeLabel('New', 'perdana-island__notes-add-label'));
        const newNoteButton = new St.Button({
            child: newNoteContents,
            can_focus: true,
            reactive: true,
            track_hover: true,
            style_class: 'perdana-button perdana-island__notes-add',
            accessible_name: 'New note',
        });
        newNoteButton.connect('clicked', () => this._addNote());
        attachButtonMotion(newNoteButton);
        newNoteButton.set_size(addButtonWidth, 26);
        const headingRow = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            style_class: 'perdana-island__notes-heading-row',
        });
        place(headingRow, heading, 0, 0, headingWidth, 28);
        place(headingRow, newNoteButton, headingWidth + 8, 1, addButtonWidth, 26);
        place(body, headingRow, safeInset, 2, listWidth, 28);

        if (!this._notes.some(note => note.id === this._notesSelectedId))
            this._notesSelectedId = notes[0]?.id || null;

        if (!notes.length) {
            place(body, makeLabel('Your notes will appear here', 'perdana-island__notes-empty'),
                safeInset, listTop + 12, listWidth - 10, 22);
        } else {
            const rowHeight = 44;
            const rowGap = 6;
            const listHeightContent = notes.length * (rowHeight + rowGap) - rowGap;
            const scroll = new St.ScrollView({
                overlay_scrollbars: false,
                style_class: 'perdana-island__notes-scroll',
            });
            scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
            const list = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
                style_class: 'perdana-island__note-list',
            });
            list.set_size(listContentWidth, listHeightContent);
            notes.forEach(note => {
                const selected = note.id === this._notesSelectedId;
                const rowBox = new St.BoxLayout({
                    orientation: Clutter.Orientation.VERTICAL,
                    style_class: 'perdana-island__note-row-content',
                });
                rowBox.set_size(listContentWidth - 18, 32);
                const topRow = new St.BoxLayout({style_class: 'perdana-island__note-row-top'});
                topRow.set_size(listContentWidth - 18, 16);
                const title = makeLabel(this._noteTitle(note), 'perdana-island__note-title');
                title.x_expand = true;
                title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
                const date = makeLabel(this._noteDateText(note.updatedAt),
                    'perdana-island__note-date');
                date.x_align = Clutter.ActorAlign.END;
                topRow.add_child(title);
                topRow.add_child(date);
                const preview = makeLabel(this._notePreview(note), 'perdana-island__note-preview');
                preview.x_expand = true;
                preview.clutter_text.ellipsize = Pango.EllipsizeMode.END;
                preview.set_size(listContentWidth - 18, 14);
                rowBox.add_child(topRow);
                rowBox.add_child(preview);
                const button = new St.Button({
                    child: rowBox,
                    can_focus: true,
                    reactive: true,
                    track_hover: true,
                    style_class: selected
                        ? 'perdana-button perdana-island__note-row perdana-island__note-row--active'
                        : 'perdana-button perdana-island__note-row',
                    accessible_name: `Note: ${this._noteTitle(note)}`,
                });
                button.connect('clicked', () => this._selectNote(note.id));
                attachButtonMotion(button, {hoverScale: 1.012, pressScale: 0.985});
                button.set_size(listContentWidth, rowHeight);
                this._notesRowLabels.set(note.id, {title, preview, date});
                list.add_child(button);
            });
            scroll.add_child(list);
            place(body, scroll, safeInset, listTop, listScrollWidth, listHeight);
            const selectedIndex = notes.findIndex(note => note.id === this._notesSelectedId);
            if (selectedIndex >= 0) {
                this._notesScrollSource = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                    this._notesScrollSource = 0;
                    const adjustment = scroll.get_vadjustment?.();
                    if (!scroll.get_stage() || !adjustment || adjustment.page_size <= 0)
                        return GLib.SOURCE_REMOVE;
                    const rowTop = selectedIndex * (rowHeight + rowGap);
                    const rowBottom = rowTop + rowHeight;
                    const currentTop = adjustment.value;
                    const currentBottom = currentTop + adjustment.page_size;
                    const maxValue = Math.max(0, adjustment.upper - adjustment.page_size);
                    if (rowTop < currentTop)
                        adjustment.value = rowTop;
                    else if (rowBottom > currentBottom)
                        adjustment.value = Math.min(maxValue, rowBottom - adjustment.page_size);
                    return GLib.SOURCE_REMOVE;
                });
            }
        }

        if (undoVisible) {
            const banner = new St.BoxLayout({style_class: 'perdana-island__notes-undo'});
            const text = makeLabel('Note deleted', 'perdana-island__notes-undo-label');
            text.x_expand = true;
            banner.add_child(text);
            banner.add_child(makeTextButton('Undo', 'Restore the deleted note',
                () => this._undoNoteDelete(), 'perdana-island__notes-undo-button'));
            place(body, banner, safeInset, height - 32, listWidth - 12, 24);
            this._notesUndoBanner = banner;
            if (!this._reducedMotion) {
                banner.opacity = 0;
                banner.translation_y = 6;
                banner.ease({
                    opacity: 255,
                    translation_y: 0,
                    duration: 240,
                    mode: Clutter.AnimationMode.EASE_OUT_QUINT,
                });
            }
        }

        const note = this._notes.find(item => item.id === this._notesSelectedId);
        if (!note) {
            const emptyCard = new St.Widget({
                layout_manager: new Clutter.FixedLayout(),
                style_class: 'perdana-island__notes-empty-card',
            });
            const emptyLabel = makeLabel('No notes yet. Select New to create one.',
                'perdana-island__notes-empty');
            emptyLabel.clutter_text.x_align = Clutter.ActorAlign.CENTER;
            emptyLabel.clutter_text.line_wrap = true;
            emptyLabel.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
            const emptyTop = 8;
            const emptyHeight = Math.max(1, height - emptyTop - 10);
            const emptyLabelWidth = Math.max(1, editorWidth - 32);
            place(body, emptyCard, editorX, emptyTop, editorWidth, emptyHeight);
            emptyCard.add_child(emptyLabel);
            const emptyLabelHeight = Math.max(18,
                emptyLabel.get_preferred_height(emptyLabelWidth)[1]);
            const emptyLabelY = Math.max(0, Math.round((emptyHeight - emptyLabelHeight) / 2));
            emptyLabel.set_position(16, emptyLabelY);
            emptyLabel.set_size(emptyLabelWidth, emptyLabelHeight);
            this._notesSaveLabel = null;
            return;
        }

        place(body, makeLabel(`Updated ${this._noteDateText(note.updatedAt)}`,
            'perdana-island__note-meta'), editorX, 4,
            Math.max(1, editorScrollWidth - 40), 18);
        place(body, makeIconButton('user-trash-symbolic', 'Delete note',
            () => this._deleteNote(note.id), 'perdana-button--note-delete'),
            editorX + editorScrollWidth - 32, 2, 26, 24);

        const scroll = new St.ScrollView({
            overlay_scrollbars: false,
            style_class: 'perdana-island__notes-scroll perdana-island__notes-editor-scroll',
        });
        scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        const editorBox = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'perdana-island__notes-editor-box',
        });
        const entry = new St.Entry({
            hint_text: 'Write a note',
            text: note.text,
            can_focus: true,
            style_class: 'perdana-island__notes-editor',
            accessible_name: 'Note text',
        });
        entry.clutter_text.set_single_line_mode(false);
        entry.clutter_text.set_line_wrap(true);
        entry.clutter_text.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
        entry.clutter_text.connect('text-changed', () => this._onNoteTextChanged(entry, note.id));
        entry.connect('key-focus-in', () =>
            scroll.add_style_class_name('perdana-island__notes-editor-scroll--focused'));
        entry.connect('key-focus-out', () =>
            scroll.remove_style_class_name('perdana-island__notes-editor-scroll--focused'));
        entry.clutter_text.connect('activate', () => this._insertNoteLineBreak(entry, note.id));
        entry.clutter_text.connect('key-press-event', (_actor, event) => {
            if (event.get_key_symbol() !== Clutter.KEY_Escape)
                return Clutter.EVENT_PROPAGATE;
            this._flushNotesSave();
            global.stage.set_key_focus(null);
            return Clutter.EVENT_STOP;
        });
        editorBox.add_child(entry);
        scroll.add_child(editorBox);
        place(body, scroll, editorX, editorTop, editorScrollWidth,
            Math.max(1, editorBottom - editorTop));
        this._notesEditorScroll = scroll;
        this._notesEditorBox = editorBox;
        this._notesEditorEntry = entry;
        this._notesEditorWidth = editorContentWidth;
        this._resizeNotesEditor();
        this._scheduleNotesResize();
        this._notesSaveLabel = place(body,
            makeLabel(this._notesStatusLine(statusState), 'perdana-island__note-status'),
            editorX, statusY, editorContentWidth, 14);
    }

    _renderRemindersPage(body) {
        this._ensurePrayerTimes();
        this._remindersTab = this._remindersTab === 'water' ? 'water' : 'prayer';
        const now = new Date();
        const pageWidth = this._pageWidth();
        const initialWaterSummary = this._waterSummary(now);
        // Keep the two sections on one compact, stable panel like island-pages-v2.
        const tabBar = new St.BoxLayout({style_class: 'perdana-island__rem-tabs'});
        const tabStyle = key => `perdana-island__rem-tab${this._remindersTab === key ? ' perdana-island__rem-tab--on' : ''}`;
        const prayerTab = makeTextButton('Prayer', 'Prayer times', () => {
            this._remindersTab = 'prayer';
            this._renderPanel();
        }, tabStyle('prayer'));
        const waterTabLabel = makeLabel(this._waterTabLabel(initialWaterSummary.value),
            'perdana-island__rem-tab-label');
        const waterTab = new St.Button({
            child: waterTabLabel,
            can_focus: true,
            reactive: true,
            track_hover: true,
            style_class: `perdana-button ${tabStyle('water')}`,
            accessible_name: 'Water reminder',
        });
        waterTab.connect('clicked', () => {
            this._remindersTab = 'water';
            this._renderPanel();
        });
        attachButtonMotion(waterTab);
        prayerTab.set_size(62, 22);
        waterTab.set_size(98, 22);
        tabBar.add_child(prayerTab);
        tabBar.add_child(waterTab);
        place(body, tabBar, 0, 6, 170, 28);
        this._reminderWaterTab = waterTab;
        this._reminderWaterTabLabel = waterTabLabel;
        this._reminderRefreshButton = makeTextButton('Refresh', 'Fetch prayer times again', () => {
            this._prayerRetryAt = 0;
            this._prayerError = null;
            this._fetchPrayerTimes();
            this._renderPanel();
        }, 'perdana-island__reminder-action');
        this._reminderRefreshButton.visible = this._remindersTab === 'prayer'
            && this._preferences.prayerReminder === true;
        place(body, this._reminderRefreshButton, pageWidth - 78, 7, 78, 26);

        this._reminderRows = [];
        this._reminderNextCaption = null;
        this._reminderNextName = null;
        this._reminderNextTime = null;
        this._reminderNextIn = null;
        this._reminderCityLabel = null;
        this._reminderWaterCaption = null;
        this._reminderWaterValue = null;
        this._reminderWaterDetail = null;
        this._reminderWaterFill = null;
        this._reminderWaterTrackWidth = 0;

        if (this._remindersTab === 'prayer') {
            const nextCard = new St.Widget({
                layout_manager: new Clutter.FixedLayout(),
                style_class: 'perdana-island__reminder-next',
            });
            place(body, nextCard, 0, 40, pageWidth, 64);
            this._reminderNextCaption = makeLabel('', 'perdana-island__reminder-caption');
            this._reminderNextName = makeLabel('—', 'perdana-island__reminder-next-name');
            this._reminderNextTime = makeLabel('—', 'perdana-island__reminder-next-time');
            this._reminderNextIn = makeLabel('', 'perdana-island__reminder-next-in');
            this._reminderCityLabel = makeLabel('', 'perdana-island__reminder-city');
            place(nextCard, this._reminderNextCaption, 14, 7, pageWidth - 160, 15);
            place(nextCard, this._reminderCityLabel, 14, 23, pageWidth - 160, 14);
            place(nextCard, this._reminderNextName, 14, 38, pageWidth - 160, 22);
            place(nextCard, this._reminderNextTime, pageWidth - 142, 11, 126, 22);
            place(nextCard, this._reminderNextIn, pageWidth - 142, 34, 126, 16);

            const stripTop = 112;
            const stripInset = 12;
            const gap = 5;
            const stripWidth = Math.max(1, pageWidth - stripInset * 2);
            const cellWidth = (stripWidth - gap * (PRAYER_NAMES.length - 1)) / PRAYER_NAMES.length;
            PRAYER_NAMES.forEach((name, index) => {
                const cell = new St.Widget({
                    layout_manager: new Clutter.FixedLayout(),
                    style_class: 'perdana-island__prayer-cell',
                });
                const nameLabel = makeLabel(name, 'perdana-island__prayer-name');
                const timeLabel = makeLabel('—', 'perdana-island__prayer-time');
                nameLabel.clutter_text.x_align = Clutter.ActorAlign.CENTER;
                timeLabel.clutter_text.x_align = Clutter.ActorAlign.CENTER;
                place(cell, nameLabel, 2, 7, cellWidth - 4, 14);
                place(cell, timeLabel, 2, 23, cellWidth - 4, 17);
                place(body, cell, stripInset + index * (cellWidth + gap), stripTop, cellWidth, 46);
                this._reminderRows.push({name, cell, nameLabel, timeLabel});
            });
        } else {
            const card = new St.Widget({
                layout_manager: new Clutter.FixedLayout(),
                style_class: 'perdana-island__reminder-card',
            });
            place(body, card, 0, 40, pageWidth, 122);
            const summary = this._waterSummary(now);
            this._reminderWaterCaption = place(card, makeLabel(summary.caption,
                'perdana-island__reminder-caption'), 14, 9, pageWidth - 28, 15);
            this._reminderWaterValue = place(card, makeLabel(summary.value,
                'perdana-island__water-value'), 14, 26, pageWidth - 28, 34);
            this._reminderWaterTrackWidth = Math.max(1, pageWidth - 28);
            const track = new St.Widget({
                layout_manager: new Clutter.FixedLayout(),
                clip_to_allocation: true,
                style_class: 'perdana-island__water-track',
            });
            place(card, track, 14, 62, this._reminderWaterTrackWidth, 4);
            this._reminderWaterFill = new St.Widget({style_class: 'perdana-island__water-fill'});
            place(track, this._reminderWaterFill, 0, 0,
                Math.round(this._reminderWaterTrackWidth * summary.progress), 4);
            this._reminderWaterDetail = place(card, makeLabel(summary.detail,
                'perdana-island__reminder-subtitle'), 120, 72, pageWidth - 134, 14);
            place(card, makeTextButton('Log glass', 'Log a glass of water', () => {
                const loggedAt = Math.floor(Date.now() / 1000);
                this._preferences.lastWaterAt = loggedAt;
                this._preferences.lastWaterLogAt = loggedAt;
                this._preferences.lastWaterReminderAt = loggedAt;
                this._savePreferences();
                this._updateReminderPage(new Date());
            }, 'perdana-island__water-log'), 14, 72, 96, 30);
            place(card, makeLabel('Every hour · 08:00–21:00',
                'perdana-island__reminder-caption perdana-island__water-window'),
                120, 88, pageWidth - 134, 14);
        }

        this._updateReminderPage(now);
    }

    _prayerPageSubtitle(city, methodLabel) {
        if (!this._preferences?.prayerReminder)
            return 'Prayer reminders are off';
        if (this._prayerFetching)
            return 'Loading prayer times...';
        if (this._prayerError)
            return this._prayerError;
        if (!this._prayerTimesForToday())
            return 'No prayer times yet';
        return `${city || 'No city'} · ${methodLabel}`;
    }

    _waterSummary(now = new Date()) {
        if (!this._preferences?.waterReminder)
            return {caption: 'Water reminder', value: 'Off', detail: 'Turn on in Settings', progress: 0};
        const minutes = now.getHours() * 60 + now.getMinutes();
        if (minutes < WATER_WINDOW_START)
            return {caption: 'Next glass', value: '08:00', detail: 'Quiet hours until then', progress: 0};
        if (minutes >= WATER_WINDOW_END)
            return {caption: 'Next glass', value: '08:00', detail: 'Resumes tomorrow', progress: 0};
        const lastReminder = Number(this._preferences.lastWaterReminderAt) || 0;
        const lastLog = Number(this._preferences.lastWaterLogAt) || 0;
        const lastLogDate = lastLog ? new Date(lastLog * 1000) : null;
        const detail = lastLogDate
            ? `Last glass ${formatClockTime(lastLogDate.getHours() * 60 + lastLogDate.getMinutes())}`
            : 'No glass logged yet';
        if (!lastReminder)
            return {caption: 'Next glass', value: 'Now', detail, progress: 0.04};
        const remaining = Math.min(WATER_REMINDER_SECONDS,
            Math.max(0, lastReminder + WATER_REMINDER_SECONDS - Math.floor(now.getTime() / 1000)));
        return {
            caption: 'Next glass',
            value: remaining <= 0 ? 'Now' : `${Math.ceil(remaining / 60)} min`,
            detail,
            progress: remaining > 0
                ? remaining / WATER_REMINDER_SECONDS
                : 0.04,
        };
    }

    _waterTabLabel(value) {
        if (value === 'Now' || value === 'Off' || value.includes(':'))
            return `Water ${value}`;
        const minutes = Number.parseInt(value, 10);
        return `Water ${Number.isFinite(minutes) ? `${minutes}m` : value}`;
    }

    _updateReminderPage(now = new Date()) {
        if (!this._reminderRows && !this._reminderWaterValue)
            return;
        const minutes = now.getHours() * 60 + now.getMinutes();
        const times = this._preferences?.prayerReminder ? this._prayerTimesForToday() : null;
        let next = times ? PRAYER_NAMES.find(name => times[name] > minutes) || null : null;
        let minutesUntilNext = null;
        if (next)
            minutesUntilNext = times[next] - minutes;
        else if (times) {
            next = PRAYER_NAMES[0];
            minutesUntilNext = 24 * 60 - minutes + times[next];
        }
        const [city] = splitCity(this._preferences?.prayerCity);
        const method = PRAYER_METHODS.find(([value]) => value === this._preferences?.prayerMethod);
        if (this._reminderNextCaption)
            this._reminderNextCaption.text = times ? 'Next prayer' : this._prayerPageSubtitle(city, method ? method[1] : 'Kemenag');
        if (this._reminderCityLabel)
            this._reminderCityLabel.text = times ? `${city || 'No city'} · ${method ? method[1] : 'Kemenag'}` : '';
        if (this._reminderNextName)
            this._reminderNextName.text = next || '—';
        if (this._reminderNextTime)
            this._reminderNextTime.text = times && next ? formatClockTime(times[next]) : '—';
        if (this._reminderNextIn) {
            const remaining = Number(minutesUntilNext);
            this._reminderNextIn.text = !times || !next ? ''
                : remaining >= 24 * 60 ? 'tomorrow'
                    : remaining >= 60 ? `in ${Math.floor(remaining / 60)} h ${remaining % 60} min`
                        : `in ${remaining} min`;
        }
        for (const row of this._reminderRows || []) {
            const state = !times ? null
                : next === row.name && minutesUntilNext < 24 * 60 ? 'next'
                    : times[row.name] <= minutes ? 'passed' : null;
            for (const suffix of ['next', 'passed']) {
                const className = `perdana-island__prayer-cell--${suffix}`;
                if (state === suffix)
                    row.cell.add_style_class_name(className);
                else
                    row.cell.remove_style_class_name(className);
            }
            this._stylePrayerLabel(row.nameLabel, 'perdana-island__prayer-name', state);
            this._stylePrayerLabel(row.timeLabel, 'perdana-island__prayer-time', state);
            row.timeLabel.text = times ? formatClockTime(times[row.name]) : '—';
        }
        const summary = this._waterSummary(now);
        if (this._reminderWaterTabLabel)
            this._reminderWaterTabLabel.text = this._waterTabLabel(summary.value);
        if (this._reminderWaterCaption)
            this._reminderWaterCaption.text = summary.caption;
        if (this._reminderWaterValue)
            this._reminderWaterValue.text = summary.value;
        if (this._reminderWaterDetail)
            this._reminderWaterDetail.text = summary.detail;
        if (this._reminderWaterFill)
            this._reminderWaterFill.set_size(
                Math.max(0, Math.round(this._reminderWaterTrackWidth * summary.progress)),
                4
            );
    }

    _stylePrayerLabel(label, base, state) {
        for (const suffix of ['next', 'passed']) {
            const name = `${base}--${suffix}`;
            if (state === suffix)
                label.add_style_class_name(name);
            else
                label.remove_style_class_name(name);
        }
    }

    _renderInfoPage(body, key) {
        if (key === 'shelf')
            this._renderShelfPage(body);
        else if (key === 'clipboard')
            this._renderClipboardPage(body);
        else if (key === 'today')
            this._renderTodayPage(body);
        else if (key === 'summary')
            this._renderSummaryPage(body);
        else if (key === 'shelfsegment')
            this._renderShelfSegment(body);
        else if (key === 'messages')
            this._renderMessagesPage(body);
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
        const cardTop = 8;
        const cardHeight = this._bodyHeight() - cardTop - 8;
        const card = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            style_class: 'perdana-island__shelf-card',
        });
        const view = this._preferences.shelfView;
        const compactControls = cardWidth < 480;
        this._renderShelfSegment(card);
        const addWidth = compactControls ? 72 : 86;
        const folderWidth = 30;
        const captureWidth = 30;
        const viewWidth = compactControls ? 84 : 140;
        const buttonGap = 6;
        const addX = cardWidth - 10 - addWidth;
        const folderX = compactControls
            ? addX - buttonGap - folderWidth
            : addX - buttonGap - captureWidth - buttonGap - folderWidth;
        const viewX = folderX - buttonGap - viewWidth;
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
            attachButtonMotion(button, {hoverScale: 1.03});
            viewGroup.add_child(button);
        }
        place(card, viewGroup, viewX, 8, viewWidth, 30);

        if (!compactControls) {
            const captureButton = makeIconButton(
                'camera-photo-symbolic',
                'Save a screenshot to Shelf',
                () => this._captureScreenshotToShelf(),
                'perdana-button--shelf-folder'
            );
            place(card, captureButton, addX - buttonGap - captureWidth, 8, captureWidth, 30);
        }

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
                overlay_scrollbars: false,
                style_class: 'perdana-island__shelf-scroll',
            });
            scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
            const content = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
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
        place(body, card, 0, cardTop, cardWidth, cardHeight);
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
        attachButtonMotion(button, {hoverScale: 1.02, pressScale: 0.97});
        return button;
    }

    _renderClipboardPage(body) {
        const cardWidth = this._pageWidth();
        const cardTop = 8;
        const cardHeight = this._bodyHeight() - cardTop - 8;
        const card = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            style_class: 'perdana-island__shelf-card perdana-island__clipboard-card',
        });
        this._renderShelfSegment(card);
        const armed = this._clearClipboardArmed();
        place(card, makeTextButton(armed ? 'Confirm' : 'Clear', 'Clear clipboard history',
            () => this._clearClipboardPressed(),
            `perdana-island__clipboard-action${armed ? ' perdana-island__clipboard-action--armed' : ''}`),
            cardWidth - 82, 8, 72, 28);
        const hint = this._clipboardNotice || `${this._clipboardItems.length} recent ${this._clipboardItems.length === 1 ? 'copy' : 'copies'} · email and links masked`;
        const hintStyle = this._clipboardNotice
            ? 'perdana-island__clipboard-notice'
            : 'perdana-island__muted';
        place(card, makeLabel(hint, hintStyle), 210, 12, Math.max(0, cardWidth - 310), 18);
        if (!this._clipboardItems.length) {
            place(card, makeLabel('Copy text while the extension is enabled', 'perdana-island__empty-media'),
                0, 76, cardWidth, 24);
            place(body, card, 0, cardTop, cardWidth, cardHeight);
            return;
        }
        const clipScroll = new St.ScrollView({
            overlay_scrollbars: false,
            style_class: 'perdana-island__clipboard-scroll',
        });
        clipScroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        clipScroll.set_position(8, 44);
        clipScroll.set_size(cardWidth - 16, Math.max(0, cardHeight - 52));
        const clipListWidth = Math.max(1, cardWidth - 36);
        const visibleItems = this._clipboardItems.slice(0, CLIPBOARD_LIMIT);
        const clipList = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'perdana-island__clip-list',
        });
        clipList.set_size(clipListWidth, Math.max(1, visibleItems.length * 34));
        visibleItems.forEach(item => {
            const preview = maskClipboardPreview(item);
            const hasMaskedValue = preview !== item;
            const row = new St.BoxLayout({style_class: 'perdana-island__clip-row'});
            row.set_size(clipListWidth, 32);
            row.x_expand = true;
            const contents = new St.BoxLayout({style_class: 'perdana-island__clip-contents'});
            contents.add_child(new St.Icon({icon_name: 'edit-copy-symbolic', style_class: 'perdana-island__icon'}));
            const label = makeLabel(preview, 'perdana-island__clip-text');
            label.clutter_text.max_width = Math.max(0, clipListWidth - 92);
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
            button.set_height(32);
            button.connect('clicked', () => {
                St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, item);
            });
            attachButtonMotion(button, {hoverScale: 1.015, pressScale: 0.98});
            row.add_child(button);
            row.add_child(makeIconButton(
                'user-trash-symbolic',
                'Delete clipboard item',
                () => this._deleteClipboardItem(item),
                'perdana-island__clip-delete'
            ));
            clipList.add_child(row);
        });
        clipScroll.add_child(clipList);
        card.add_child(clipScroll);
        place(body, card, 0, cardTop, cardWidth, cardHeight);
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

    _formatMmSs(seconds) {
        const total = Math.max(0, Math.floor(seconds));
        return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
    }

    _makeSummaryIcon(kind) {
        const styleClass = kind === 'lyrics'
            ? 'perdana-island__summary-lyrics-icon'
            : 'perdana-island__summary-row-icon';
        const icon = new St.DrawingArea({style_class: styleClass});
        icon.connect('repaint', area => {
            const [width, height] = area.get_surface_size();
            if (width <= 0 || height <= 0)
                return;
            const color = hexColorToRgb(this._preferences?.accentColor || DEFAULT_ACCENT_COLOR);
            const cr = area.get_context();
            cr.scale(width / 24, height / 24);
            cr.setLineWidth(1.7);
            cr.setLineCap(1);
            cr.setLineJoin(1);
            cr.setSourceRGBA(color[0], color[1], color[2], 1);

            if (kind === 'focus') {
                cr.arc(12, 13, 7.5, 0, Math.PI * 2);
                cr.moveTo(12, 9);
                cr.lineTo(12, 13);
                cr.lineTo(15, 14.8);
                cr.moveTo(9.5, 2.7);
                cr.lineTo(14.5, 2.7);
            } else if (kind === 'tasks') {
                cr.arc(12, 12, 8.5, 0, Math.PI * 2);
                cr.moveTo(8.2, 12.1);
                cr.lineTo(10.7, 14.6);
                cr.lineTo(15.9, 9.4);
            } else if (kind === 'lyrics') {
                cr.moveTo(6, 6.5);
                cr.lineTo(18, 6.5);
                cr.moveTo(6, 10.5);
                cr.lineTo(18, 10.5);
                cr.moveTo(6, 14.5);
                cr.lineTo(16, 14.5);
                cr.moveTo(6, 18.5);
                cr.lineTo(13, 18.5);
            } else {
                cr.moveTo(5, 5.5);
                cr.lineTo(19, 5.5);
                cr.curveTo(20.4, 5.5, 21, 6.1, 21, 7.5);
                cr.lineTo(21, 14.8);
                cr.curveTo(21, 16.2, 20.3, 17, 18.8, 17);
                cr.lineTo(12, 17);
                cr.lineTo(7.5, 20.2);
                cr.lineTo(7.5, 17);
                cr.lineTo(5, 17);
                cr.curveTo(3.6, 17, 3, 16.3, 3, 14.8);
                cr.lineTo(3, 7.8);
                cr.curveTo(3, 6.2, 3.8, 5.5, 5, 5.5);
                cr.closePath();
            }
            cr.stroke();
            cr.$dispose();
        });
        icon.set_size(18, 18);
        this._summaryIconActors.push(icon);
        return icon;
    }

    _renderSummaryPage(body) {
        const width = this._pageWidth();
        const gap = 16;
        const leftWidth = Math.round((width - gap) * (1.06 / 2.06));
        const rightX = leftWidth + gap;
        const rightWidth = width - rightX;
        const contentTop = 6;
        const bodyHeight = this._bodyHeight() - contentTop;
        const player = this._getSelectedPlayer();
        const metadata = player ? this._getMetadata(player.proxy) : null;

        // Match the preview's compact player card: cover, metadata, current
        // lyric, seek bar, and transport controls all stay in one fixed card.
        const musicCard = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            reactive: true,
            style_class: 'perdana-island__summary-card',
        });
        place(body, musicCard, 0, contentTop, leftWidth, bodyHeight);
        if (player && metadata) {
            this._summaryMediaBody = new St.Widget({layout_manager: new Clutter.FixedLayout()});
            this._summaryMediaEmpty = null;
            place(musicCard, this._summaryMediaBody, 0, 0, leftWidth, bodyHeight);
            const artwork = new St.Widget({
                layout_manager: new Clutter.BinLayout(),
                clip_to_allocation: true,
                style_class: 'perdana-island__album-art perdana-island__summary-art',
            });
            const artworkIcon = new St.Icon({
                icon_name: 'audio-x-generic-symbolic',
                style_class: 'perdana-island__album-art-icon',
            });
            artwork.add_child(artworkIcon);
            const localArt = this._localArtIcon(metadata.artUrl);
            if (localArt)
                artworkIcon.gicon = localArt;
            this._loadArtwork(artwork, artworkIcon, metadata.artUrl, 46, 11);
            place(this._summaryMediaBody, artwork, 11, 11, 46, 46);

            this._summaryTitle = makeLabel(metadata.title || 'Unknown title',
                'perdana-island__summary-title');
            this._summaryTitle.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            this._summaryArtist = makeLabel(metadata.artist || '', 'perdana-island__summary-artist');
            this._summaryArtist.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            const equalizerX = leftWidth - 66;
            const metadataWidth = Math.max(40, equalizerX - 76);
            place(this._summaryMediaBody, this._summaryTitle, 68, 12, metadataWidth, 18);
            place(this._summaryMediaBody, this._summaryArtist, 68, 32, metadataWidth, 16);

            const equalizer = this._makeEqualizer();
            equalizer.add_style_class_name('perdana-island__summary-equalizer');
            equalizer.visible = this._isPlaying();
            this._mediaEqualizer = equalizer;
            place(this._summaryMediaBody, equalizer, equalizerX, 25, 22, 18);
            const lyricsLink = new St.Button({
                child: this._makeSummaryIcon('lyrics'),
                can_focus: true,
                reactive: true,
                track_hover: true,
                style_class: 'perdana-button perdana-island__summary-lyrics-link',
                accessible_name: 'Open synchronized lyrics',
            });
            lyricsLink.connect('clicked', () => this._selectPage('lyrics'));
            attachButtonMotion(lyricsLink, {hoverScale: 1.07, pressScale: 0.93});
            place(this._summaryMediaBody, lyricsLink, leftWidth - 38, 20, 26, 26);

            this._summaryLyric = makeLabel('', 'perdana-island__summary-lyric');
            this._summaryLyric.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            place(this._summaryMediaBody, this._summaryLyric, 12, 62, leftWidth - 24, 18);

            this._mediaPositionLabel = makeLabel('0:00', 'perdana-island__summary-time');
            this._mediaDurationLabel = makeLabel('0:00', 'perdana-island__summary-time');
            this._mediaDurationLabel.clutter_text.x_align = Clutter.ActorAlign.END;
            place(this._summaryMediaBody, this._mediaPositionLabel, 12, 84, 30, 14);
            place(this._summaryMediaBody, this._mediaDurationLabel, leftWidth - 42, 84, 30, 14);
            this._createProgressControl(this._summaryMediaBody, 46, 84, leftWidth - 92);

            const playback = this._getProperty(player.proxy, 'PlaybackStatus') || 'Paused';
            const isPlaying = playback === 'Playing';
            const center = Math.round(leftWidth / 2);
            place(this._summaryMediaBody, this._mediaButton(
                'media-skip-backward-symbolic', 'Previous track', player.proxy, 'Previous',
                this._canControl(player.proxy, 'CanGoPrevious')
            ), center - 51, 112, 30, 30);
            place(this._summaryMediaBody, this._mediaButton(
                isPlaying ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic',
                isPlaying ? 'Pause' : 'Play', player.proxy, isPlaying ? 'Pause' : 'Play',
                this._canControl(player.proxy, isPlaying ? 'CanPause' : 'CanPlay'), true
            ), center - 18, 109, 36, 36);
            place(this._summaryMediaBody, this._mediaButton(
                'media-skip-forward-symbolic', 'Next track', player.proxy, 'Next',
                this._canControl(player.proxy, 'CanGoNext')
            ), center + 21, 112, 30, 30);
            this._ensureLyrics(metadata, player.name);
            this._updateSummaryMedia();
        } else {
            this._summaryMediaBody = null;
            this._summaryTitle = null;
            this._summaryArtist = null;
            this._summaryLyric = null;
            const empty = new St.Widget({
                layout_manager: new Clutter.FixedLayout(),
                style_class: 'perdana-island__summary-empty',
            });
            const emptyIcon = new St.Icon({
                icon_name: 'audio-x-generic-symbolic',
                style_class: 'perdana-island__summary-empty-icon',
            });
            this._summaryMediaEmpty = empty;
            musicCard.add_child(empty);
            empty.set_position(0, 0);
            empty.set_size(leftWidth, bodyHeight);
            const emptyGroupHeight = 70;
            const emptyTop = Math.max(0, Math.round((bodyHeight - emptyGroupHeight) / 2));
            place(empty, emptyIcon, Math.round((leftWidth - 26) / 2), emptyTop, 26, 26);
            const emptyTitle = makeLabel('Nothing playing', 'perdana-island__summary-empty-title');
            emptyTitle.clutter_text.x_align = Clutter.ActorAlign.CENTER;
            place(empty, emptyTitle, 12, emptyTop + 32, leftWidth - 24, 18);
            const emptySubtitle = makeLabel('Start a player, or open Lyrics', 'perdana-island__summary-empty-sub');
            emptySubtitle.clutter_text.x_align = Clutter.ActorAlign.CENTER;
            place(empty, emptySubtitle, 12, emptyTop + 52, leftWidth - 24, 16);
            musicCard.connect('button-press-event', () => {
                this._selectPage('lyrics');
                return Clutter.EVENT_STOP;
            });
        }

        // Right: priorities, each opens its page
        const openTasks = this._tasks.filter(task => !task.done);
        const chatItems = this._notificationItems.filter(item => isChatItem(item)
            && this._isNotificationSourceEnabled(item.appKey));
        const latestMessage = chatItems.find(item => !item.read) || chatItems[0];
        const totalTasks = this._tasks.length;
        const completedTasks = Math.max(0, totalTasks - openTasks.length);
        const rows = [
            {key: 'focus', title: 'Focus', icon: 'focus',
                sub: this._focusSource ? `${this._formatMmSs(this._focusRemaining)} · ${this._focusModeLabel()}` : '25:00 · Focus',
                value: this._focusSource ? 'Running' : 'Ready', live: Boolean(this._focusSource)},
            {key: 'tasks', title: 'To-do', icon: 'tasks',
                sub: openTasks[0]?.text || 'Your list is clear', value: `${completedTasks}/${totalTasks}`,
                live: openTasks.length > 0},
            {key: 'messages', title: 'Messages', icon: 'messages',
                sub: latestMessage ? `${latestMessage.title} · ${latestMessage.app}` : 'No new messages',
                value: `${chatItems.filter(item => !item.read).length} new`,
                live: Boolean(latestMessage && !latestMessage.read)},
        ];
        const rowGap = 4;
        const rowHeight = Math.max(1, (bodyHeight - rowGap * (rows.length - 1)) / rows.length);
        this._summaryRows = {};
        rows.forEach((row, index) => {
            const content = new St.Widget({
                layout_manager: new Clutter.FixedLayout(),
            });
            content.set_size(rightWidth, rowHeight);
            const card = new St.Button({
                child: content,
                can_focus: true,
                reactive: true,
                track_hover: true,
                style_class: `perdana-button perdana-island__summary-row${row.live ? ' perdana-island__summary-row--live' : ''}`,
                accessible_name: `${row.title}: ${row.sub}. ${row.value}`,
            });
            const y = contentTop + index * (rowHeight + rowGap);
            place(body, card, rightX, y, rightWidth, rowHeight);
            const icon = this._makeSummaryIcon(row.icon);
            place(content, icon, 13, Math.round((rowHeight - 18) / 2), 18, 18);
            const title = makeLabel(row.title, 'perdana-island__summary-row-title');
            title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            place(content, title, 42,
                Math.round(rowHeight / 2) - 15, Math.max(0, rightWidth - 132), 16);
            const subtitle = makeLabel(row.sub, 'perdana-island__summary-row-sub');
            subtitle.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            place(content, subtitle, 42,
                Math.round(rowHeight / 2) + 1, Math.max(0, rightWidth - 132), 15);
            const value = makeLabel(row.value, 'perdana-island__summary-row-value');
            value.clutter_text.x_align = Clutter.ActorAlign.END;
            place(content, value, rightWidth - 79, Math.round((rowHeight - 16) / 2), 67, 16);
            this._summaryRows[row.key] = {title, subtitle, value};
            card.connect('clicked', () => {
                this._activePage = row.key;
                this._renderPanel();
            });
        });
        this._updateSummaryRows();
    }

    _updateSummaryRows() {
        const focus = this._summaryRows?.focus;
        if (focus) {
            const remaining = this._focusSource && this._focusDeadline
                ? Math.max(0, Math.ceil(this._focusDeadline - GLib.get_monotonic_time() / MICROSECONDS_PER_SECOND))
                : this._focusRemaining;
            focus.subtitle.text = `${this._formatMmSs(remaining)} · ${this._focusModeLabel()}`;
            focus.value.text = this._focusSource ? 'Running'
                : this._focusWasStarted && remaining > 0 ? 'Paused' : 'Ready';
        }

        const tasks = this._summaryRows?.tasks;
        if (tasks) {
            const pending = this._tasks.filter(task => !task.done);
            const completed = Math.max(0, this._tasks.length - pending.length);
            tasks.subtitle.text = pending[0]?.text || (this._tasks.length ? 'All tasks done' : 'No tasks yet');
            tasks.value.text = `${completed}/${this._tasks.length}`;
        }

        const messages = this._summaryRows?.messages;
        if (messages) {
            const chats = this._notificationItems.filter(item => isChatItem(item)
                && this._isNotificationSourceEnabled(item.appKey));
            const latest = chats.find(item => !item.read) || chats[0];
            messages.subtitle.text = latest ? `${latest.title} · ${latest.app}` : 'No new messages';
            messages.value.text = `${chats.filter(item => !item.read).length} new`;
        }
    }

    _updateSummaryMedia() {
        const player = this._getSelectedPlayer();
        const hasPlayer = Boolean(player);
        if (this._summaryMediaBody)
            this._summaryMediaBody.visible = hasPlayer;
        if (this._summaryMediaEmpty) {
            this._summaryMediaEmpty.visible = !hasPlayer;
            return;
        }
        if (!this._summaryMediaBody)
            return;
        if (!player)
            return;
        const metadata = this._getMetadata(player.proxy);
        if (this._summaryTitle)
            this._summaryTitle.text = metadata.title || player.name.replace(MPRIS_PREFIX, '');
        if (this._summaryArtist)
            this._summaryArtist.text = metadata.artist || '';
        if (this._summaryLyric) {
            const lyric = this._currentLyricsText(this._positionForPlayer(player));
            this._summaryLyric.text = lyric
                || (this._lyricsStatus === 'Finding lyrics…' ? 'Finding lyrics…'
                    : this._lyricsStatus === 'No lyrics found' ? 'No synced lyrics found'
                        : 'Synced lyric appears here');
        }
        if (this._mediaEqualizer) {
            const playing = this._getProperty(player.proxy, 'PlaybackStatus') === 'Playing';
            this._mediaEqualizer.visible = playing;
            this._setEqualizerPlaying(this._mediaEqualizer,
                Boolean(playing && this._expanded && this._activePage === 'summary'));
        }
    }

    _clipboardVisible() {
        return this._activePage === 'clipboard'
            || (this._activePage === 'shelf' && this._shelfSegment === 'clipboard');
    }

    _renderShelfSegment(body) {
        const segment = this._shelfSegment === 'clipboard' ? 'clipboard' : 'files';
        const tabs = new St.BoxLayout({style_class: 'perdana-island__shelf-tabs'});
        const makeTab = (key, label, selected) => {
            const text = makeLabel(label, 'perdana-island__shelf-tab-label');
            const button = new St.Button({
                child: text,
                can_focus: true,
                reactive: true,
                track_hover: true,
                style_class: `perdana-button perdana-button--segment perdana-island__shelf-tab${selected ? ' perdana-button--segment-active perdana-island__shelf-tab--active' : ''}`,
                accessible_name: `${key === 'files' ? 'Shelf files' : 'Clipboard history'}${selected ? ', selected' : ''}`,
            });
            button.connect('clicked', () => {
                this._shelfSegment = key;
                if (this._activePage === 'clipboard' && key === 'files')
                    this._activePage = 'shelf';
                this._renderPanel();
                if (key === 'clipboard')
                    this._captureClipboard();
            });
            attachButtonMotion(button, {hoverScale: 1.025, pressScale: 0.98});
            return {button, text};
        };
        const filesTab = makeTab('files', `Files ${this._shelfItems.length}`, segment === 'files');
        const clipboardTab = makeTab('clipboard', `Clipboard ${this._clipboardItems.length}`, segment === 'clipboard');
        this._shelfFilesCountLabel = filesTab.text;
        this._shelfClipboardCountLabel = clipboardTab.text;
        filesTab.button.set_size(78, 28);
        clipboardTab.button.set_size(104, 28);
        tabs.add_child(filesTab.button);
        tabs.add_child(clipboardTab.button);
        place(body, tabs, 10, 8, 190, 28);
        return segment;
    }

    _updateClipboardIndicator() {
        if (this._shelfClipboardCountLabel)
            this._shelfClipboardCountLabel.text = `Clipboard ${this._clipboardItems.length}`;
    }

    _startDownloadWatch() {
        if (this._downloadWatch)
            return;
        // Fall back to ~/Downloads when the desktop does not register the folder
        const dir = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD)
            || GLib.build_filenamev([GLib.get_home_dir(), 'Downloads']);
        const file = Gio.File.new_for_path(dir);
        this._downloadWatch = {file, monitor: null, signal: 0, timer: 0};
        // Re-read the folder every second as well, so a finished download is noticed even
        // when the monitor does not deliver the rename promptly.
        this._downloadWatch.timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            if (!this._downloadWatch)
                return GLib.SOURCE_REMOVE;
            this._syncDownloadActivities();
            return GLib.SOURCE_CONTINUE;
        });
        try {
            this._downloadWatch.monitor = file.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
            this._downloadWatch.signal = this._downloadWatch.monitor.connect('changed', () => this._syncDownloadActivities());
        } catch (_error) {
            this._downloadWatch.monitor = null;
        }
        this._syncDownloadActivities();
    }

    _stopDownloadWatch() {
        const watch = this._downloadWatch;
        if (!watch)
            return;
        if (watch.timer)
            GLib.source_remove(watch.timer);
        if (watch.monitor) {
            if (watch.signal)
                watch.monitor.disconnect(watch.signal);
            watch.monitor.cancel();
        }
        this._downloadWatch = null;
    }

    _connectActivityService() {
        if (this._activityDbus)
            return;
        const api = {
            StartActivity: (id, title, subtitle, progress, icon) => {
                this._startActivity({
                    id: `app:${id}`,
                    title,
                    sub: subtitle,
                    progress,
                    icon,
                    source: 'app',
                });
                return [];
            },
            UpdateActivity: (id, progress, subtitle) => {
                this._updateActivity(`app:${id}`, {progress, sub: subtitle});
                return [];
            },
            FinishActivity: (id, success) => {
                this._finishActivity(`app:${id}`, success);
                return [];
            },
            ListActivities: () => new GLib.Variant('(s)', [JSON.stringify(this._activitySnapshot())]),
        };
        try {
            this._activityDbus = Gio.DBusExportedObject.wrapJSObject(ACTIVITY_DBUS_XML, api);
            this._activityDbus.export(Gio.DBus.session, ACTIVITY_DBUS_PATH);
            this._activityDbusOwnerId = Gio.bus_own_name_on_connection(
                Gio.DBus.session,
                ACTIVITY_DBUS_NAME,
                Gio.BusNameOwnerFlags.NONE,
                null,
                null
            );
            this._activityApi = api;
        } catch (error) {
            logError(error, 'Perdana Island could not export its Activity D-Bus interface');
            this._activityDbus = null;
            this._activityDbusOwnerId = 0;
            this._activityApi = null;
        }
    }

    _disconnectActivityService() {
        if (this._activityDbusOwnerId) {
            Gio.bus_unown_name(this._activityDbusOwnerId);
            this._activityDbusOwnerId = 0;
        }
        if (this._activityDbus) {
            try {
                this._activityDbus.unexport();
            } catch (_error) {
                // Shell shutdown also closes the session connection.
            }
            this._activityDbus = null;
        }
        this._activityApi = null;
        for (const source of this._activityExpirySources.values())
            GLib.source_remove(source);
        this._activityExpirySources.clear();
    }

    _startActivity(raw, notify = true) {
        const externalId = cleanActivityId(raw?.id);
        if (!externalId)
            return false;
        const id = raw?.source === 'download' ? externalId : `app:${externalId.replace(/^app:/, '')}`;
        const now = Date.now();
        let item = this._activities.find(activity => activity.id === id);
        const structural = !item || item.state !== 'running';
        const appActivityCount = this._activities.filter(activity => activity.source !== 'download').length;
        if (!item && raw?.source !== 'download' && appActivityCount >= ACTIVITY_LIMIT) {
            const removable = this._activities.find(activity => activity.state !== 'running'
                && activity.source !== 'download');
            if (!removable)
                return false;
            this._dismissActivity(removable, false);
        }
        if (!item) {
            item = {id};
            this._activities.push(item);
        }
        this._clearActivityExpiry(id);
        Object.assign(item, {
            title: cleanActivityText(raw?.title) || externalId,
            sub: cleanActivityText(raw?.sub ?? raw?.subtitle),
            icon: cleanActivityIcon(raw?.icon),
            progress: normalizeProgress(raw?.progress),
            bytes: Math.max(0, Number(raw?.bytes ?? raw?.receivedBytes) || 0),
            total: Math.max(0, Number(raw?.total ?? raw?.totalBytes) || 0),
            source: raw?.source === 'download' ? 'download' : 'app',
            state: 'running',
            startedAt: structural ? now : item.startedAt,
            updatedAt: now,
            doneAt: 0,
            path: raw?.path || '',
        });
        if (notify)
            this._refreshActivityUi(structural);
        return true;
    }

    _updateActivity(id, changes = {}) {
        const key = cleanActivityId(id);
        const item = this._activities.find(activity => activity.id === key);
        if (!item || item.state !== 'running')
            return false;
        if ('progress' in changes)
            item.progress = normalizeProgress(changes.progress);
        if ('sub' in changes || 'subtitle' in changes)
            item.sub = cleanActivityText(changes.sub ?? changes.subtitle);
        const bytes = Number(changes.bytes ?? changes.receivedBytes);
        if (Number.isFinite(bytes))
            item.bytes = Math.max(0, bytes);
        const total = Number(changes.total ?? changes.totalBytes);
        if (Number.isFinite(total))
            item.total = Math.max(0, total);
        item.updatedAt = Date.now();
        this._refreshActivityUi(false);
        return true;
    }

    _finishActivity(id, success) {
        const key = cleanActivityId(id);
        const item = this._activities.find(activity => activity.id === key);
        if (!item || item.state !== 'running')
            return false;
        item.state = success ? 'done' : 'failed';
        item.doneAt = Date.now();
        item.updatedAt = item.doneAt;
        if (success)
            item.progress = 1;
        if (item.source !== 'download')
            this._scheduleActivityExpiry(item.id);
        this._refreshActivityUi(true);
        return true;
    }

    _scheduleActivityExpiry(id) {
        this._clearActivityExpiry(id);
        const source = GLib.timeout_add(GLib.PRIORITY_DEFAULT, APP_ACTIVITY_EXPIRY_MS, () => {
            this._activityExpirySources.delete(id);
            const item = this._activities.find(activity => activity.id === id);
            if (item && item.source !== 'download' && item.state !== 'running')
                this._dismissActivity(item);
            return GLib.SOURCE_REMOVE;
        });
        this._activityExpirySources.set(id, source);
    }

    _clearActivityExpiry(id) {
        const source = this._activityExpirySources.get(id);
        if (!source)
            return;
        GLib.source_remove(source);
        this._activityExpirySources.delete(id);
    }

    _activitySnapshot() {
        return this._activities.map(item => ({
            id: item.id,
            title: item.title,
            subtitle: item.sub,
            icon: item.icon,
            progress: item.progress,
            receivedBytes: item.bytes,
            totalBytes: item.total,
            source: item.source,
            state: item.state,
            startedAt: item.startedAt,
            updatedAt: item.updatedAt,
            finishedAt: item.doneAt,
        }));
    }

    _refreshActivityUi(structural) {
        if (this._uiActorsAlive)
            this._updateCollapsedLabel();
        if (structural) {
            try {
                this._activityDbus?.emit_signal('ActivityChanged', null);
            } catch (_error) {
                // A lost D-Bus connection must not interrupt the UI.
            }
        }
        this._renderActivityIfVisible();
    }

    _syncDownloadActivities() {
        if (!this._downloadWatch?.file)
            return;
        const seen = new Map();
        let scanned = false;
        try {
            const enumerator = this._downloadWatch.file.enumerate_children(
                'standard::name,standard::size,standard::type', Gio.FileQueryInfoFlags.NONE, null);
            let info;
            while ((info = enumerator.next_file(null)) !== null) {
                const name = info.get_name();
                const suffix = partialSuffix(name);
                const aria2 = isAria2Control(name);
                if (!suffix && !aria2)
                    continue;
                const finalName = downloadTitle(name);
                if (!finalName || finalName.startsWith('.'))
                    continue;
                const record = seen.get(finalName) || {finalName, bytes: 0, total: 0, partialName: '', aria2Name: ''};
                if (suffix) {
                    record.partialName = name;
                    record.bytes = Math.max(record.bytes, info.get_size());
                }
                if (aria2) {
                    record.aria2Name = name;
                    const controlFile = this._downloadWatch.file.get_child(name);
                    try {
                        const controlInfo = controlFile.query_info(
                            'standard::size', Gio.FileQueryInfoFlags.NONE, null);
                        if (controlInfo.get_size() <= 4096) {
                            const [ok, contents] = controlFile.load_contents(null);
                            if (ok)
                                record.total = aria2TotalLength(contents) || 0;
                        }
                    } catch (_error) {
                        record.total = 0;
                    }
                    try {
                        const outputInfo = this._downloadWatch.file.get_child(finalName).query_info(
                            'standard::size,standard::type', Gio.FileQueryInfoFlags.NONE, null);
                        if (outputInfo.get_file_type() === Gio.FileType.REGULAR)
                            record.bytes = Math.max(record.bytes, outputInfo.get_size());
                    } catch (_error) {
                        // aria2 creates the output file after the control file.
                    }
                }
                seen.set(finalName, record);
            }
            enumerator.close(null);
            scanned = true;
        } catch (_error) {
            // Keep the last known activities if Downloads cannot be read.
        }
        const now = Date.now();
        let structuralChanged = false;
        for (const [finalName, record] of seen) {
            const id = `dl:${finalName}`;
            const previous = this._activities.find(item => item.id === id);
            if (!previous || previous.state !== 'running')
                structuralChanged = true;
            const elapsed = previous?.sampledAt ? Math.max(0.001, (now - previous.sampledAt) / 1000) : 0;
            const speedBytes = previous && elapsed > 0 ? Math.max(0, record.bytes - previous.bytes) / elapsed : 0;
            this._startActivity({
                id,
                title: finalName,
                sub: record.total > 0 ? 'Downloading' : 'Download in progress',
                icon: 'folder-download-symbolic',
                bytes: record.bytes,
                total: record.total,
                progress: record.total > 0 ? record.bytes / record.total : null,
                source: 'download',
                path: GLib.build_filenamev([this._downloadWatch.file.get_path(), finalName]),
            }, false);
            const item = this._activities.find(activity => activity.id === id);
            if (item) {
                item.partialName = record.partialName;
                item.aria2Name = record.aria2Name;
                item.speedBytes = speedBytes;
                item.sampledAt = now;
                item.missingSince = 0;
            }
        }
        if (!scanned)
            return;
        for (const item of this._activities) {
            if (item.source === 'download' && item.state === 'running' && !seen.has(item.title)) {
                const finalFile = this._downloadWatch.file.get_child(item.title);
                if (finalFile.query_exists(null)) {
                    item.state = 'done';
                    item.doneAt = now;
                    item.path = finalFile.get_path();
                    item.progress = 1;
                    item.total = Math.max(item.total, item.bytes);
                    item.sub = 'Download complete';
                    structuralChanged = true;
                    try {
                        item.bytes = finalFile.query_info(
                            'standard::size', Gio.FileQueryInfoFlags.NONE, null
                        ).get_size();
                    } catch (_error) {
                        // Keep the last partial-file size if the final entry is not readable yet.
                    }
                } else {
                    if (!item.missingSince)
                        item.missingSince = now;
                    else if (now - item.missingSince > 3500)
                        item.state = 'cancelled';
                }
            }
        }
        const cancelled = this._activities.filter(item => item.state === 'cancelled');
        for (const item of cancelled) {
            structuralChanged = true;
            this._dismissActivity(item, false);
        }
        this._refreshActivityUi(structuralChanged);
    }

    _makeNotificationIcon(item, size, styleClass) {
        const fallback = Gio.ThemedIcon.new('application-x-executable-symbolic');
        let gicon = null;
        if (item.appIconFile && GLib.file_test(item.appIconFile, GLib.FileTest.EXISTS)) {
            try {
                gicon = Gio.FileIcon.new(Gio.File.new_for_path(item.appIconFile));
            } catch (_error) {
                gicon = null;
            }
        }
        if (!gicon && item.appIconName) {
            try {
                gicon = Gio.ThemedIcon.new(item.appIconName);
            } catch (_error) {
                gicon = null;
            }
        }
        if (!gicon)
            gicon = item.notification?.gicon || item.source?.icon || item.source?.app?.get_icon?.() || null;
        return new St.Icon({
            gicon: gicon || fallback,
            fallback_gicon: fallback,
            icon_size: size,
            style_class: styleClass,
        });
    }

    _notificationAge(item) {
        const age = Math.max(0, Date.now() - (Number(item.receivedAt) || Date.now()));
        if (age < 60_000)
            return 'now';
        if (age < 60 * 60_000)
            return `${Math.floor(age / 60_000)}m`;
        if (age < 24 * 60 * 60_000)
            return `${Math.floor(age / (60 * 60_000))}h`;
        return new Intl.DateTimeFormat('en-GB', {day: '2-digit', month: 'short'}).format(item.receivedAt);
    }

    _activateNotificationItem(item) {
        if (!item)
            return;
        item.read = true;
        this._updateSummaryRows();
        if (this._expanded)
            this._renderPanel();
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
    }

    _getNotificationReplyAction(item) {
        const actions = item?.notification?.actions;
        if (!Array.isArray(actions))
            return null;
        return actions.find(action => /reply|respond|answer|balas|répond|responder|rispondi|antwort/i.test(
            String(action?.label || '')
        ) && typeof action?.activate === 'function') || null;
    }

    _activateNotificationReply(item, action) {
        if (!item || !action || this._getNotificationReplyAction(item) !== action)
            return;
        item.read = true;
        this._updateSummaryRows();
        try {
            // This invokes the reply action provided by the originating app.
            // GNOME notifications do not expose a generic text-input reply API.
            action.activate();
        } catch (error) {
            logError(error, 'Perdana Island could not activate the notification reply action');
        }
        if (this._expanded)
            this._renderPanel();
    }

    _renderMessagesPage(body) {
        const contentWidth = this._pageWidth();
        const chats = this._notificationItems.filter(isChatItem)
            .filter(item => this._isNotificationSourceEnabled(item.appKey));
        const compactHeader = contentWidth < 300;
        const groupsByKey = new Map();
        for (const item of [...chats].sort((first, second) =>
            (Number(second.receivedAt) || 0) - (Number(first.receivedAt) || 0))) {
            const key = `${item.appKey || item.app}\u0000${item.title}`;
            if (!groupsByKey.has(key))
                groupsByKey.set(key, {key, sender: item.title, app: item.app, items: []});
            groupsByKey.get(key).items.push(item);
        }
        const groups = [...groupsByKey.values()];
        const unread = chats.filter(item => !item.read).length;
        const header = new St.BoxLayout({
            style_class: `perdana-island__messages-header${compactHeader
                ? ' perdana-island__messages-header--compact' : ''}`,
            y_align: Clutter.ActorAlign.CENTER,
        });
        header.add_child(makeLabel('Messages', 'perdana-island__todo-heading'));
        const unreadLabel = makeLabel(chats.length
            ? (unread ? `${unread} unread` : 'All read') : 'No messages',
        'perdana-island__messages-count');
        unreadLabel.x_expand = true;
        unreadLabel.x_align = Clutter.ActorAlign.END;
        header.add_child(unreadLabel);
        const markRead = makeTextButton(contentWidth >= 340
            ? 'Mark all read' : compactHeader ? 'Read' : 'Mark read',
            'Mark all messages as read', () => {
            this._notificationItems.forEach(item => {
                if (isChatItem(item) && this._isNotificationSourceEnabled(item.appKey))
                    item.read = true;
            });
            this._updateSummaryRows();
            this._renderPanel();
        }, 'perdana-island__notification-clear');
        const markReadWidth = contentWidth >= 340 ? 88 : compactHeader ? 48 : 70;
        markRead.set_size(markReadWidth, 26);
        header.add_child(markRead);
        const clear = makeTextButton('Clear', 'Clear chat messages', () =>
            this._clearNotifications(isChatItem), 'perdana-island__notification-clear');
        clear.set_size(compactHeader ? 48 : 54, 26);
        header.add_child(clear);
        place(body, header, 0, 8, contentWidth, 28);

        if (!groups.length) {
            const empty = makeLabel('No chat messages yet', 'perdana-island__empty-media');
            empty.clutter_text.x_align = Clutter.ActorAlign.CENTER;
            place(body, empty, 0, 43, contentWidth, this._bodyHeight() - 47);
            return;
        }
        const rowHeight = 50;
        const rowGap = 5;
        const list = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'perdana-island__messages-list',
        });
        const listWidth = Math.max(1, contentWidth - 18);
        const replyGroupCount = groups.filter(group => {
            const latest = [...group.items].sort((first, second) =>
                (Number(second.receivedAt) || 0) - (Number(first.receivedAt) || 0))[0];
            return Boolean(this._getNotificationReplyAction(latest));
        }).length;
        list.set_size(listWidth,
            groups.length * rowHeight + replyGroupCount * 27 + Math.max(0, groups.length - 1) * rowGap);
        groups.forEach(group => {
            const latest = [...group.items].sort((first, second) =>
                (Number(second.receivedAt) || 0) - (Number(first.receivedAt) || 0))[0];
            const groupUnread = group.items.filter(item => !item.read).length;
            const row = new St.BoxLayout({
                style_class: `perdana-island__message-row${groupUnread ? ' perdana-island__message-row--unread' : ''}`,
                clip_to_allocation: true,
                y_align: Clutter.ActorAlign.CENTER,
            });
            row.set_size(listWidth, rowHeight);
            row.add_child(this._makeNotificationIcon(latest, 26, 'perdana-island__message-icon'));
            const copy = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
                style_class: 'perdana-island__message-copy',
                clip_to_allocation: true,
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            });
            const top = new St.BoxLayout({
                style_class: 'perdana-island__message-top',
                y_align: Clutter.ActorAlign.CENTER,
            });
            const sender = makeLabel(group.sender || group.app, 'perdana-island__message-sender');
            sender.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            sender.clutter_text.line_wrap = false;
            sender.x_expand = true;
            sender.x_align = Clutter.ActorAlign.FILL;
            top.add_child(sender);
            const appLabel = makeLabel(group.app, 'perdana-island__message-app');
            appLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            appLabel.clutter_text.line_wrap = false;
            top.add_child(appLabel);
            copy.add_child(top);
            const messageBody = makeLabel(latest.body || latest.title || 'New message',
                'perdana-island__message-body');
            messageBody.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            messageBody.clutter_text.line_wrap = false;
            messageBody.x_expand = true;
            messageBody.x_align = Clutter.ActorAlign.FILL;
            copy.add_child(messageBody);
            row.add_child(copy);
            const meta = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
                style_class: 'perdana-island__message-meta',
                y_align: Clutter.ActorAlign.CENTER,
            });
            meta.add_child(makeLabel(this._notificationAge(latest), 'perdana-island__message-time'));
            if (groupUnread)
                meta.add_child(makeLabel(String(groupUnread), 'perdana-island__message-badge'));
            row.add_child(meta);
            const button = new St.Button({
                child: row,
                can_focus: true,
                reactive: true,
                track_hover: true,
                style_class: 'perdana-button perdana-island__message-button',
                accessible_name: `Open ${group.app} message from ${group.sender}`,
            });
            button.set_size(listWidth, rowHeight);
            button.x_expand = true;
            button.connect('clicked', () => {
                group.items.forEach(item => item.read = true);
                this._activateNotificationItem(latest);
            });
            const entry = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
                style_class: 'perdana-island__message-entry',
            });
            entry.add_child(button);
            const replyAction = this._getNotificationReplyAction(latest);
            if (replyAction) {
                const reply = new St.Button({
                    child: makeLabel('Reply', 'perdana-island__message-reply-label'),
                    can_focus: true,
                    reactive: true,
                    track_hover: true,
                    style_class: 'perdana-button perdana-island__message-reply',
                    accessible_name: `Reply to ${group.sender} in ${group.app}`,
                });
                reply.set_size(62, 24);
                reply.x_align = Clutter.ActorAlign.END;
                reply.connect('clicked', () => this._activateNotificationReply(latest, replyAction));
                entry.add_child(reply);
            }
            list.add_child(entry);
        });
        const scroll = new St.ScrollView({
            overlay_scrollbars: false,
            style_class: 'perdana-island__notification-scroll',
        });
        scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        scroll.add_child(list);
        place(body, scroll, 0, 43, contentWidth, Math.max(0, this._bodyHeight() - 47));
    }

    _renderActivityPanel(body, top = 52) {
        const contentWidth = this._pageWidth();
        const listWidth = Math.max(1, contentWidth - 12);
        const running = this._activities.filter(item => item.state === 'running');
        const finished = this._activities.filter(item => item.state === 'done' || item.state === 'failed');
        const shown = running.concat(finished);
        this._activityRows = new Map();
        if (!shown.length) {
            place(body, makeLabel('No downloads or app tasks right now', 'perdana-island__empty-media'),
                0, top + 16, contentWidth, 24);
            return;
        }
        const rowHeight = 54;
        const rowGap = 5;
        const list = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'perdana-island__activity-list',
        });
        list.set_size(listWidth, shown.length * (rowHeight + rowGap) - rowGap);
        shown.forEach(item => {
            const terminal = item.state !== 'running';
            const complete = item.state === 'done';
            const downloadable = item.source === 'download' && complete;
            const row = new St.Widget({
                layout_manager: new Clutter.FixedLayout(),
                reactive: terminal,
                can_focus: terminal,
                track_hover: terminal,
                style_class: `perdana-island__activity-row${terminal ? ' perdana-island__activity-row--done' : ''}`,
            });
            row.set_size(listWidth, rowHeight);
            row.accessible_name = terminal
                ? downloadable ? `Download complete: ${item.title}. Press Enter to open and dismiss.`
                    : `${complete ? 'Activity complete' : 'Activity stopped'}: ${item.title}. Press Enter to dismiss.`
                : `${item.source === 'download' ? 'Downloading' : 'In progress'}: ${item.title}`;
            const icon = new St.Icon({
                icon_name: complete ? 'emblem-ok-symbolic'
                    : item.state === 'failed' ? 'dialog-warning-symbolic' : cleanActivityIcon(item.icon),
                icon_size: 16,
                style_class: 'perdana-island__activity-icon',
            });
            const titleLabel = makeLabel(cleanActivityText(item.title, 80), 'perdana-island__activity-title');
            titleLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            titleLabel.clutter_text.line_wrap = false;
            const stateText = terminal
                ? downloadable ? 'Complete · open' : complete ? 'Complete · dismiss' : 'Stopped · dismiss'
                : item.source === 'download' ? formatActivityValue(item) : 'Running';
            const stateLabel = makeLabel(stateText, 'perdana-island__activity-sub');
            stateLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            stateLabel.clutter_text.line_wrap = false;
            const detailLabel = makeLabel(terminal
                ? item.source === 'download' ? `Download complete · ${formatBytes(item.bytes)}` : item.sub || 'Finished'
                : formatActivityDetail(item), 'perdana-island__activity-sub');
            detailLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            detailLabel.clutter_text.line_wrap = false;
            place(row, icon, 10, 6, 16, 16);
            place(row, titleLabel, 34, 4, Math.max(1, listWidth - 142), 16);
            place(row, stateLabel, listWidth - 104, 4, 94, 16);
            place(row, detailLabel, 34, 21, listWidth - 46, 14);
            const bar = new St.Widget({
                layout_manager: new Clutter.FixedLayout(),
                style_class: 'perdana-island__activity-bar',
            });
            place(row, bar, 34, 42, listWidth - 46, 4);
            const fill = new St.Widget({style_class: `perdana-island__activity-fill${item.progress === null && !terminal
                ? ' perdana-island__activity-fill--indeterminate' : ''}`});
            bar.add_child(fill);
            const barWidth = listWidth - 46;
            const progress = terminal ? complete ? 1 : 0 : normalizeProgress(item.progress);
            const initialWidth = progress === null ? Math.round(barWidth * 0.35)
                : Math.round(barWidth * progress);
            place(bar, fill, 0, 0, initialWidth, 4);
            const entry = {row, icon, titleLabel, stateLabel, detailLabel, fill, barWidth, connected: false};
            this._activityRows.set(item.id, entry);
            if (terminal)
                this._connectCompletedActivityRow(entry, item);
            list.add_child(row);
        });
        const scroll = new St.ScrollView({
            overlay_scrollbars: false,
            style_class: 'perdana-island__notification-scroll',
        });
        scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        scroll.add_child(list);
        place(body, scroll, 0, top, contentWidth, Math.max(0, this._bodyHeight() - top - 4));
    }

    _activityPercent(item) {
        return formatActivityValue(item);
    }

    _formatBytes(bytes) {
        return formatBytes(bytes);
    }

    _renderActivityIfVisible() {
        if (!this._enabled || !this._expanded || this._activePage !== 'notifications' || this._noticeTab !== 'activity')
            return;
        if (!this._updateActivityRows())
            this._renderPanel();
    }

    _connectCompletedActivityRow(entry, item) {
        if (!entry || entry.connected)
            return;
        entry.connected = true;
        const open = () => item.source === 'download' && item.state === 'done'
            ? this._openCompletedDownload(item)
            : this._dismissActivity(item);
        entry.row.connect('button-press-event', (_actor, event) => {
            if (event.get_button() !== 1)
                return Clutter.EVENT_PROPAGATE;
            open();
            return Clutter.EVENT_STOP;
        });
        entry.row.connect('key-press-event', (_actor, event) => {
            const key = event.get_key_symbol();
            if (key !== Clutter.KEY_Return && key !== Clutter.KEY_KP_Enter && key !== Clutter.KEY_space)
                return Clutter.EVENT_PROPAGATE;
            open();
            return Clutter.EVENT_STOP;
        });
    }

    _updateActivityRows() {
        if (!this._activityRows || this._activityRows.size !== this._activities.length)
            return false;
        for (const item of this._activities) {
            const entry = this._activityRows.get(item.id);
            if (!entry)
                return false;
            const terminal = item.state !== 'running';
            const complete = item.state === 'done';
            const downloadable = item.source === 'download' && complete;
            entry.titleLabel.text = cleanActivityText(item.title, 80);
            entry.stateLabel.text = terminal
                ? downloadable ? 'Complete · open' : complete ? 'Complete · dismiss' : 'Stopped · dismiss'
                : item.source === 'download' ? formatActivityValue(item) : 'Running';
            entry.detailLabel.text = terminal
                ? item.source === 'download' ? `Download complete · ${formatBytes(item.bytes)}` : item.sub || 'Finished'
                : formatActivityDetail(item);
            const progress = terminal ? complete ? 1 : 0 : normalizeProgress(item.progress);
            entry.fill.width = progress === null ? Math.max(1, Math.round(entry.barWidth * 0.35))
                : Math.round(entry.barWidth * progress);
            if (terminal && !entry.connected) {
                entry.row.reactive = true;
                entry.row.can_focus = true;
                entry.row.track_hover = true;
                entry.row.accessible_name = downloadable
                    ? `Download complete: ${item.title}. Press Enter to open and dismiss.`
                    : `${complete ? 'Activity complete' : 'Activity stopped'}: ${item.title}. Press Enter to dismiss.`;
                entry.row.add_style_class_name('perdana-island__activity-row--done');
                this._connectCompletedActivityRow(entry, item);
            } else if (!terminal && entry.connected) {
                entry.row.reactive = false;
                entry.row.can_focus = false;
                entry.row.track_hover = false;
                entry.row.remove_style_class_name('perdana-island__activity-row--done');
                entry.row.accessible_name = `Downloading ${item.title}`;
            }
            if (progress === null && !terminal)
                entry.fill.add_style_class_name('perdana-island__activity-fill--indeterminate');
            else
                entry.fill.remove_style_class_name('perdana-island__activity-fill--indeterminate');
        }
        return true;
    }

    _dismissActivity(item, refresh = true) {
        if (!item)
            return;
        this._clearActivityExpiry(item.id);
        this._activities = this._activities.filter(activity => activity !== item);
        if (refresh)
            this._refreshActivityUi(true);
    }

    _openCompletedDownload(item) {
        if (!item || item.source !== 'download' || item.state !== 'done')
            return;
        try {
            const file = Gio.File.new_for_path(item.path);
            if (file.query_exists(null))
                Gio.AppInfo.launch_default_for_uri(file.get_uri(), null);
        } catch (error) {
            logError(error, 'Perdana Island could not open the completed download');
        }
        this._dismissActivity(item);
    }

    _renderNotificationsPage(body) {
        const contentWidth = this._pageWidth();
        // Keep Alerts and Activity in a single header row, matching the preview.
        const tabs = new St.BoxLayout({style_class: 'perdana-island__notification-tabs'});
        const tabStyle = key => `perdana-island__rem-tab${this._noticeTab === key ? ' perdana-island__rem-tab--on' : ''}`;
        const alertItems = this._notificationItems.filter(item => !isChatItem(item));
        const visibleItems = this._visibleNotifications().filter(item => !isChatItem(item));
        const activityCount = this._activities.length;
        const tabWidth = Math.min(98, Math.max(72, Math.floor((contentWidth - 108) / 2)));
        const alertsTab = makeTextButton(`Alerts ${visibleItems.length}`, 'Alerts', () => {
            this._noticeTab = 'alerts';
            this._renderPanel();
        }, `perdana-island__notification-tab ${tabStyle('alerts')}`);
        const activityTab = makeTextButton(`Activity ${activityCount}`, 'Activity', () => {
            this._noticeTab = 'activity';
            this._renderPanel();
        }, `perdana-island__notification-tab ${tabStyle('activity')}`);
        alertsTab.set_size(tabWidth, 22);
        activityTab.set_size(tabWidth, 22);
        tabs.add_child(alertsTab);
        tabs.add_child(activityTab);
        const tabsWidth = tabWidth * 2 + 8;
        tabs.set_size(tabsWidth, 28);
        place(body, tabs, 0, 8, tabsWidth, 28);
        const clearWidth = Math.min(76, Math.max(58, Math.round(contentWidth * 0.15)));
        const clearButton = makeTextButton('Clear all', 'Clear all app notifications', () =>
            this._clearNotifications(item => !isChatItem(item)),
        'perdana-island__notification-clear');
        clearButton.reactive = alertItems.length > 0;
        clearButton.opacity = alertItems.length > 0 ? 255 : 110;
        const clearX = Math.max(tabsWidth + 8, contentWidth - clearWidth);
        const safeClearWidth = Math.max(1, Math.min(clearWidth, contentWidth - clearX));
        place(body, clearButton, clearX, 8, safeClearWidth, 26);
        const status = this._noticeTab === 'activity'
            ? 'Click a completed download to open it and dismiss it.'
            : 'Chat notifications appear under Messages.';
        place(body, makeLabel(status, 'perdana-island__notification-hint'), 0, 43, contentWidth - 4, 20);
        if (this._noticeTab === 'activity') {
            this._renderActivityPanel(body, 70);
            return;
        }

        if (!visibleItems.length) {
            const emptyText = alertItems.length
                ? 'All app sources are turned off' : 'No notifications yet';
            const empty = makeLabel(emptyText, 'perdana-island__empty-media');
            empty.clutter_text.x_align = Clutter.ActorAlign.CENTER;
            place(body, empty, 0, 70, contentWidth, this._bodyHeight() - 74);
            return;
        }
        const cardWidth = Math.max(1, contentWidth - 18);
        const rowHeight = 42;
        const rowGap = 5;
        const list = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'perdana-island__notification-list',
        });
        list.set_size(cardWidth, visibleItems.length * (rowHeight + rowGap) - rowGap);
        visibleItems.forEach(item => {
            const unread = !item.read;
            const row = new St.BoxLayout({
                style_class: `perdana-island__notification-row${unread ? ' perdana-island__notification-row--unread' : ''}`,
                clip_to_allocation: true,
                y_align: Clutter.ActorAlign.CENTER,
            });
            row.set_size(cardWidth, rowHeight);
            row.add_child(this._makeNotificationIcon(item, 22, 'perdana-island__notification-icon'));
            const copy = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
                style_class: 'perdana-island__notification-copy',
                clip_to_allocation: true,
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            });
            const top = new St.BoxLayout({
                style_class: 'perdana-island__notification-top',
                y_align: Clutter.ActorAlign.CENTER,
            });
            const title = makeLabel(item.title, 'perdana-island__notification-title');
            title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            title.clutter_text.line_wrap = false;
            title.x_expand = true;
            title.x_align = Clutter.ActorAlign.FILL;
            top.add_child(title);
            const appLabel = makeLabel(item.app, 'perdana-island__notification-app');
            appLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            appLabel.clutter_text.line_wrap = false;
            top.add_child(appLabel);
            copy.add_child(top);
            const bodyLabel = makeLabel(item.body || item.title, 'perdana-island__notification-body');
            bodyLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            bodyLabel.clutter_text.line_wrap = false;
            bodyLabel.x_expand = true;
            bodyLabel.x_align = Clutter.ActorAlign.FILL;
            copy.add_child(bodyLabel);
            row.add_child(copy);
            const button = new St.Button({
                child: row,
                can_focus: true,
                reactive: true,
                track_hover: true,
                style_class: 'perdana-button perdana-island__notification-button',
                accessible_name: `Open ${item.app}: ${item.title}`,
            });
            button.connect('clicked', () => this._activateNotificationItem(item));
            button.set_size(cardWidth, rowHeight);
            button.x_expand = true;
            attachButtonMotion(button, {hoverScale: 1.015, pressScale: 0.98});
            list.add_child(button);
        });
        const scroll = new St.ScrollView({
            overlay_scrollbars: false,
            style_class: 'perdana-island__notification-scroll',
        });
        scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        scroll.add_child(list);
        place(body, scroll, 0, 70, contentWidth, Math.max(0, this._bodyHeight() - 74));
    }

    _backupFolder() {
        return GLib.build_filenamev([this._taskDirectory, 'backups']);
    }

    _fileChooser(method, title, options, callback) {
        // Desktop file dialog via xdg-desktop-portal. callback(path|null, reason).
        let proxy;
        try {
            proxy = Gio.DBusProxy.new_for_bus_sync(
                Gio.BusType.SESSION, Gio.DBusProxyFlags.NONE, null,
                'org.freedesktop.portal.Desktop', '/org/freedesktop/portal/desktop',
                'org.freedesktop.portal.FileChooser', null);
        } catch (_error) {
            callback(null, 'unavailable');
            return;
        }
        const owner = proxy.get_name_owner();
        if (!owner) {
            callback(null, 'unavailable');
            return;
        }
        const handleToken = `perdana${Date.now()}`;
        // The portal names its request object after the caller's unique bus name and our handle token
        const request = `/org/freedesktop/portal/desktop/request/${owner.slice(1).replace(/\./g, '_')}/${handleToken}`;
        let signal = 0;
        const connection = proxy.get_connection();
        signal = connection.signal_subscribe(
            'org.freedesktop.portal.Desktop', 'org.freedesktop.portal.Request', 'Response',
            request, null, Gio.DBusSignalFlags.NO_MATCH_RULE,
            (_conn, _sender, _path, _iface, _signal, parameters) => {
                if (answered)
                    return;
                answered = true;
                GLib.source_remove(timeout);
                connection.signal_unsubscribe(signal);
                const [code, results] = parameters.deepUnpack();
                const uris = results?.uris?.deepUnpack?.() ?? [];
                if (code !== 0 || !uris.length)
                    callback(null, 'cancelled');
                else
                    callback(Gio.File.new_for_uri(uris[0]).get_path(), null);
            });
        // If the portal never answers (no dialog service), stop waiting and report it as unavailable
        let answered = false;
        const timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 8, () => {
            if (!answered) {
                answered = true;
                connection.signal_unsubscribe(signal);
                callback(null, 'unavailable');
            }
            return GLib.SOURCE_REMOVE;
        });
        try {
            proxy.call(method, new GLib.Variant('(ssa{sv})', ['', title, {
                handle_token: GLib.Variant.new_string(handleToken),
                ...options,
            }]), Gio.DBusCallFlags.NONE, -1, null, (_proxy, result) => {
                try {
                    proxy.call_finish(result);
                } catch (_error) {
                    connection.signal_unsubscribe(signal);
                    callback(null, 'unavailable');
                }
            });
        } catch (_error) {
            connection.signal_unsubscribe(signal);
            callback(null, 'unavailable');
        }
    }

    _saveBackup() {
        const now = new Date();
        const version = this.metadata?.['version-name']
            || (this.metadata?.version ? `v${this.metadata.version}` : '');
        const doc = buildBackup({
            tasks: this._tasks,
            notes: this._notes,
            preferences: this._preferences,
            focusLog: this._focusLog,
        }, {version, now});
        const write = path => {
            try {
                if (!GLib.file_set_contents(path, JSON.stringify(doc, null, 2)))
                    throw new Error('Backup was not written');
                this._backupStatus = `Saved to ${path}`;
            } catch (_error) {
                this._backupStatus = 'Could not save the backup. Check the folder permissions.';
            }
            this._renderPanel();
        };
        this._fileChooser('SaveFile', 'Save Perdana Island backup', {
            current_name: GLib.Variant.new_string(backupFileName(now)),
            filters: GLib.Variant.new_array(null, []),
        }, (path, reason) => {
            if (path) {
                write(path);
                return;
            }
            if (reason === 'cancelled') {
                this._backupStatus = 'Save cancelled.';
                this._renderPanel();
                return;
            }
            // No portal: keep the backup in the app folder instead of failing
            try {
                GLib.mkdir_with_parents(this._backupFolder(), 0o700);
                write(GLib.build_filenamev([this._backupFolder(), backupFileName(now)]));
            } catch (_error) {
                this._backupStatus = 'Could not create the backup folder. Check the folder permissions.';
                this._renderPanel();
            }
        });
    }

    _requestRestore() {
        this._fileChooser('OpenFile', 'Restore Perdana Island backup', {
            multiple: GLib.Variant.new_boolean(false),
        }, (path, reason) => {
            if (path) {
                this._loadRestoreFile(path);
                return;
            }
            if (reason === 'cancelled') {
                this._backupStatus = 'Restore cancelled.';
                this._renderPanel();
                return;
            }
            this._requestRestoreFromFolder();
        });
    }

    _loadRestoreFile(path) {
        let result;
        try {
            const [ok, contents] = GLib.file_get_contents(path);
            result = ok
                ? validateBackup(new TextDecoder().decode(contents))
                : {ok: false, reason: 'The file could not be read.'};
        } catch (_error) {
            result = {ok: false, reason: 'The file could not be read.'};
        }
        if (!result.ok) {
            this._pendingRestore = null;
            this._backupStatus = result.reason;
        } else {
            this._pendingRestore = {name: GLib.path_get_basename(path), path, summary: result.summary, data: result.data};
            this._backupStatus = null;
        }
        this._renderPanel();
    }

    _requestRestoreFromFolder() {
        // Used when the desktop file dialog is not available: newest backup in the app folder.
        let newest = null;
        try {
            const dir = Gio.File.new_for_path(this._backupFolder());
            const en = dir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
            let info;
            while ((info = en.next_file(null)) !== null) {
                const name = info.get_name();
                if (/^perdana-island-backup-\d{4}-\d{2}-\d{2}\.json$/.test(name)
                    && (!newest || name > newest))
                    newest = name;
            }
            en.close(null);
        } catch (_error) {
            newest = null;
        }
        if (!newest) {
            this._backupStatus = 'No backup found yet. Save one first.';
            this._renderPanel();
            return;
        }
        const path = GLib.build_filenamev([this._backupFolder(), newest]);
        let result;
        try {
            const [ok, contents] = GLib.file_get_contents(path);
            result = ok
                ? validateBackup(new TextDecoder().decode(contents))
                : {ok: false, reason: 'The file could not be read.'};
        } catch (_error) {
            result = {ok: false, reason: 'The file could not be read.'};
        }
        if (!result.ok) {
            this._pendingRestore = null;
            this._backupStatus = result.reason;
        } else {
            this._pendingRestore = {name: newest, path, summary: result.summary, data: result.data};
            this._backupStatus = null;
        }
        this._renderPanel();
    }

    _applyRestore() {
        const pending = this._pendingRestore;
        if (!pending)
            return;
        const previous = {
            tasks: this._tasks,
            notes: this._notes,
            focusLog: this._focusLog,
            preferences: this._preferences,
        };
        // Keep a copy of the current data first, so a restore is never destructive by surprise
        try {
            GLib.mkdir_with_parents(this._taskDirectory, 0o700);
            const safety = buildBackup(previous);
            if (!GLib.file_set_contents(GLib.build_filenamev([this._taskDirectory, 'pre-restore.json']),
                JSON.stringify(safety, null, 2)))
                throw new Error('Safety copy was not written');
        } catch (_error) {
            this._backupStatus = 'Restore cancelled because a safety copy could not be saved.';
            this._renderPanel();
            return;
        }
        this._preferences = {...this._preferences, ...pending.data.preferences};
        if (!this._savePreferences()) {
            this._preferences = previous.preferences;
            this._backupStatus = 'Restore cancelled because settings could not be saved.';
            this._renderPanel();
            return;
        }
        this._preferences = this._loadPreferences();
        this._tasks = pending.data.tasks.map(task => ({...task, id: task.id || GLib.uuid_string_random()}));
        this._notes = pending.data.notes.map(note => ({
            id: note.id || GLib.uuid_string_random(),
            text: note.text,
            updatedAt: Number.isFinite(note.updatedAt) ? note.updatedAt
                : Number.isFinite(note.updated) ? note.updated : Date.now(),
        }));
        this._focusLog = pending.data.focusLog;
        const focusLogSaved = this._saveFocusLog();
        const tasksSaved = this._saveTasks();
        const notesSaved = this._saveNotes();
        if (!focusLogSaved || !tasksSaved || !notesSaved) {
            this._tasks = previous.tasks;
            this._notes = previous.notes;
            this._focusLog = previous.focusLog;
            this._preferences = previous.preferences;
            this._saveFocusLog();
            this._saveTasks();
            this._saveNotes();
            this._savePreferences();
            this._backupStatus = 'Restore could not be saved completely. Previous data was reinstated where possible; a safety copy is available as pre-restore.json.';
            this._renderPanel();
            return;
        }
        this._pendingRestore = null;
        this._backupStatus = `Restored ${summarizeBackup(pending.summary)}. Copy of the previous data saved as pre-restore.json.`;
        if (!this._visiblePages().some(page => page.key === this._activePage))
            this._activePage = 'settings';
        this._applyFontPreference();
        this._applyTheme();
        this._applyAccentStyles();
        this._applyGlassPreference();
        this._updateIslandShapePreference();
        this._positionIsland();
        this._applyKeepAwake();
        this._prayerRetryAt = 0;
        this._fetchPrayerTimes();
        if (!this._preferences.browserOverlap)
            this._setBrowserTucked(false);
        this._renderPanel();
    }

    _renderSettingsPage(body) {
        const layoutWidth = Math.max(0, this._pageWidth() - 8);
        const navWidth = Math.min(280, Math.max(196, Math.round(layoutWidth * 0.26)));
        const panelX = navWidth + 24;
        const panelWidth = Math.max(0, layoutWidth - panelX);
        // Keep fixed-position controls clear of St.ScrollView's non-overlay
        // scrollbar and leave a visible safe inset at the right edge.
        const contentWidth = Math.max(0, panelWidth - 30);
        const columnGap = 10;
        const halfWidth = Math.max(0, (contentWidth - columnGap) / 2);
        const sections = [
            ['island', 'Island'],
            ['greeting', 'Greeting'],
            ['music', 'Music'],
            ['messages', 'Messages'],
            ['reminders', 'Reminders'],
            ['notifications', 'Notifications'],
            ['tabs', 'Tabs'],
            ['data', 'Data'],
        ];
        if (!sections.some(([key]) => key === this._settingsSection))
            this._settingsSection = 'island';

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
        navList.set_size(navItemWidth, sections.length * navRowStep);
        navScroll.add_child(navList);
        place(body, navScroll, 4, 29, navWidth - 12, Math.max(0, this._bodyHeight() - 29));

        sections.forEach(([key, label]) => {
            const selected = this._settingsSection === key;
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
                if (this._settingsSection === key)
                    return;
                this._settingsSection = key;
                this._renderPanel();
            });
            attachButtonMotion(button, {hoverScale: 1, pressScale: 0.98});
            button.set_size(navItemWidth, 21);
            navList.add_child(button);
        });

        const selectedIndex = sections.findIndex(([key]) => key === this._settingsSection);
        this._settingsNavScrollSource = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._settingsNavScrollSource = 0;
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

        const contentHeights = {
            island: 670,
            greeting: 414,
            music: 206,
            messages: 210,
            reminders: 326,
            notifications: 240,
            tabs: 206,
            data: 230,
        };
        const contentHeight = contentHeights[this._settingsSection];
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
        place(body, scroll, panelX, 29, panelWidth, Math.max(0, this._bodyHeight() - 29));

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
            button.connect('clicked', callback);
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
            const selected = this._theme().key === theme.key;
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
            button.connect('clicked', () => this._setPreference('theme', theme.key));
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

        this._positionButtons = null;

        if (this._settingsSection === 'island') {
            heading('Theme', 0);
            const themeGap = 7;
            const themeWidth = (contentWidth - themeGap * 2) / 3;
            THEMES.forEach((theme, index) => {
                const row = Math.floor(index / 3);
                const column = index % 3;
                themeButton(theme, column * (themeWidth + themeGap), 22 + row * 34, themeWidth);
            });

            heading('Resting island', 94);
            settingButton('Clock on hover', this._preferences.restingStyle === 'hover-clock',
                0, 116, halfWidth, () => this._setPreference('restingStyle', 'hover-clock'), 'alarm-symbolic');
            settingButton('Eyes + clock', this._preferences.restingStyle === 'eyes-clock',
                halfWidth + columnGap, 116, halfWidth,
                () => this._setPreference('restingStyle', 'eyes-clock'), 'preferences-system-symbolic');

            heading('Island shape', 152);
            settingButton('Notch', this._preferences.islandShape !== 'pill',
                0, 174, halfWidth, () => this._setPreference('islandShape', 'notch'),
                'view-fullscreen-symbolic');
            settingButton('Pill', this._preferences.islandShape === 'pill',
                halfWidth + columnGap, 174, halfWidth,
                () => this._setPreference('islandShape', 'pill'), 'media-playlist-repeat-symbolic');
            settingButton(this._preferences.browserOverlap ? 'Browser tuck on' : 'Browser tuck off',
                this._preferences.browserOverlap, 0, 210, contentWidth,
                () => this._setPreference('browserOverlap', !this._preferences.browserOverlap),
                'web-browser-symbolic');
            place(content, makeLabel('Tuck under a browser when the pointer reaches the top edge.',
                'perdana-island__settings-hint'), 0, 240, contentWidth, 24);

            heading('Appearance', 270);
            settingButton(this._preferences.glass ? 'Glass on' : 'Glass off', this._preferences.glass,
                0, 292, halfWidth, () => this._setPreference('glass', !this._preferences.glass),
                'preferences-desktop-appearance-symbolic');

            heading('Accent color · Navy is the default', 328);
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
                attachButtonMotion(swatch, {hoverScale: 1.1, pressScale: 0.9});
                place(content, swatch, index * 40, 350, 34, 32);
            });
            const colorEntry = new St.Entry({
                hint_text: DEFAULT_ACCENT_COLOR,
                can_focus: true,
                style_class: 'perdana-island__color-entry',
                accessible_name: 'Accent color hex code',
            });
            colorEntry.set_text(this._preferences.accentColor);
            colorEntry.clutter_text.connect('text-changed', () =>
                colorEntry.remove_style_class_name('perdana-island__color-entry--invalid'));
            const applyColor = () => {
                const color = normalizeHexColor(colorEntry.get_text());
                if (color)
                    this._setPreference('accentColor', color);
                else
                    colorEntry.add_style_class_name('perdana-island__color-entry--invalid');
            };
            colorEntry.clutter_text.connect('activate', applyColor);
            place(content, colorEntry, 0, 389, 132, 32);
            place(content, makeTextButton('Apply', 'Apply accent color', applyColor,
                'perdana-island__color-apply'), 142, 389, 82, 32);

            heading('Font', 428);
            const fontOptions = [
                ['cantarell', 'Cantarell'],
                ['noto-sans', 'Noto Sans'],
                ['plus-jakarta-sans', 'Plus Jakarta Sans'],
            ];
            const fontWidth = (contentWidth - columnGap * 2) / 3;
            fontOptions.forEach(([key, label], index) => {
                settingButton(label, this._preferences.fontFamily === key,
                    index * (fontWidth + columnGap), 450, fontWidth,
                    () => this._setPreference('fontFamily', key), 'font-x-generic-symbolic');
            });
            place(content, makeLabel('Uses Plus Jakarta Sans when available; otherwise falls back to Cantarell.',
                'perdana-island__settings-hint'), 0, 482, contentWidth, 24);

            heading('Session', 516);
            settingButton(this._preferences.keepAwake ? 'Keep awake on' : 'Keep awake off',
                this._preferences.keepAwake === true, 0, 538, halfWidth,
                () => this._setPreference('keepAwake', this._preferences.keepAwake !== true),
                'preferences-desktop-screensaver-symbolic');
            place(content, makeLabel(this._keepAwakeStatusText(), 'perdana-island__settings-hint'),
                halfWidth + columnGap, 543, halfWidth, 30);

            heading('Position · drag to move', 578);
            const positionGap = 6;
            const positionWidth = (contentWidth - positionGap * 4) / 5;
            this._positionButtons = new Map();
            [['top', 'Top'], ['bottom', 'Bottom'], ['left', 'Left'],
                ['right', 'Right'], ['free', 'Free']].forEach(([key, label], index) => {
                const button = settingButton(label, this._preferences.positionMode === key,
                    index * (positionWidth + positionGap), 600, positionWidth,
                    () => this._setPositionMode(key));
                this._positionButtons.set(key, button);
            });
            place(content, makeLabel('Drag the resting pill or header. Release near an edge to snap.',
                'perdana-island__settings-hint'), 0, 636, contentWidth, 26);

        } else if (this._settingsSection === 'greeting') {
            heading('Session greeting', 0);
            settingButton(this._preferences.greetingEnabled ? 'Greeting on' : 'Greeting off',
                this._preferences.greetingEnabled, 0, 22, contentWidth,
                () => this._setPreference('greetingEnabled', !this._preferences.greetingEnabled),
                'user-available-symbolic');
            place(content, makeLabel('First use shows the welcome text; later sessions show the returning text.',
                'perdana-island__settings-hint'), 0, 57, contentWidth, 30);

            heading('Name to show', 88);
            const nameSources = [
                ['account', 'Linux user', 'system-users-symbolic'],
                ['device', 'Device', 'computer-symbolic'],
                ['custom', 'Custom', 'document-edit-symbolic'],
            ];
            const sourceGap = 7;
            const sourceWidth = (contentWidth - sourceGap * 2) / 3;
            nameSources.forEach(([key, label, icon], index) => {
                settingButton(label, this._preferences.greetingNameSource === key,
                    index * (sourceWidth + sourceGap), 110, sourceWidth,
                    () => this._setPreference('greetingNameSource', key), icon);
            });
            if (this._preferences.greetingNameSource === 'custom') {
                heading('Custom name', 148);
                addEntry('Custom greeting name', this._preferences.greetingCustomName, 0, 170,
                    contentWidth, value => this._setPreference('greetingCustomName',
                        value.replace(/[\r\n]+/g, ' ').slice(0, 40), false), 'Your name');
            } else {
                const currentName = this._greetingName();
                place(content, makeLabel(`Name preview · ${currentName}`,
                    'perdana-island__settings-hint'), 0, 148, contentWidth, 20);
            }

            heading('Greeting text', 206);
            place(content, makeLabel('First sign-in', 'perdana-island__settings-hint'), 0, 229, contentWidth, 16);
            addEntry('First sign-in greeting', this._preferences.greetingWelcomeText, 0, 246,
                contentWidth, value => this._setPreference('greetingWelcomeText',
                    value.replace(/[\r\n]+/g, ' ').slice(0, 56), false), 'Hello, {name}');
            place(content, makeLabel('Returning', 'perdana-island__settings-hint'), 0, 282, contentWidth, 16);
            addEntry('Returning greeting', this._preferences.greetingReturnText, 0, 299,
                contentWidth, value => this._setPreference('greetingReturnText',
                    value.replace(/[\r\n]+/g, ' ').slice(0, 56), false), "You're back, {name}");
            place(content, makeLabel('Use {name} to insert the selected name. Text is saved on this device.',
                'perdana-island__settings-hint'), 0, 336, contentWidth, 28);
            settingButton('Preview first sign-in', false, 0, 368, halfWidth,
                () => this._previewGreeting(false), 'user-available-symbolic');
            settingButton('Preview returning', false, halfWidth + columnGap, 368, halfWidth,
                () => this._previewGreeting(true), 'user-available-symbolic');
        } else if (this._settingsSection === 'music') {
            heading('Playback detection', 0);
            settingButton(this._preferences.smartMusicDetection
                ? 'Smart detection on' : 'Smart detection off',
                this._preferences.smartMusicDetection, 0, 22, contentWidth,
                () => this._setPreference('smartMusicDetection', !this._preferences.smartMusicDetection),
                'audio-x-generic-symbolic');
            place(content, makeLabel('Recognizes song metadata from Spotify, YouTube Music, Apple Music, Deezer, and SoundCloud.',
                'perdana-island__settings-hint'), 0, 57, contentWidth, 30);
            place(content, makeLabel('Podcasts, films, social clips, and unclear media stay out of the playing island.',
                'perdana-island__settings-hint'), 0, 77, contentWidth, 30);
        } else if (this._settingsSection === 'reminders') {
            heading('Daily agenda', 0);
            settingButton('Morning 08:00', this._preferences.morningAgenda !== false,
                0, 22, halfWidth,
                () => this._setPreference('morningAgenda', this._preferences.morningAgenda === false),
                'x-office-calendar-symbolic');
            settingButton('Evening 17:00', this._preferences.eveningRecap !== false,
                halfWidth + columnGap, 22, halfWidth,
                () => this._setPreference('eveningRecap', this._preferences.eveningRecap === false),
                'emblem-ok-symbolic');
            heading('Focus guard', 60);
            settingButton(this._preferences.focusGuard !== false ? 'Guard on' : 'Guard off',
                this._preferences.focusGuard !== false, 0, 82, halfWidth,
                () => this._setPreference('focusGuard', this._preferences.focusGuard === false),
                'dialog-warning-symbolic');
            place(content, makeLabel('Warns after 5 min on a distraction', 'perdana-island__settings-hint'),
                halfWidth + columnGap, 88, halfWidth, 28);
            heading('Water & prayer', 122);
            settingButton(this._preferences.waterReminder ? 'Water on' : 'Water off',
                this._preferences.waterReminder === true, 0, 144, halfWidth,
                () => this._setPreference('waterReminder', !this._preferences.waterReminder), 'alarm-symbolic');
            settingButton(this._preferences.prayerReminder ? 'Prayer on' : 'Prayer off',
                this._preferences.prayerReminder === true, halfWidth + columnGap, 144, halfWidth,
                () => this._setPreference('prayerReminder', !this._preferences.prayerReminder),
                'x-office-calendar-symbolic');
            heading('Prayer location', 184);
            const cityEntry = new St.Entry({
                hint_text: 'City, Country',
                text: this._preferences.prayerCity,
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
                this._setPreference('prayerCity', value);
            };
            cityEntry.clutter_text.connect('text-changed', () =>
                cityEntry.remove_style_class_name('perdana-island__settings-entry--invalid'));
            cityEntry.clutter_text.connect('activate', applyCity);
            place(content, cityEntry, 0, 206, Math.max(0, contentWidth - 76), 30);
            place(content, makeTextButton('Apply', 'Apply prayer city', applyCity,
                'perdana-island__color-apply'), contentWidth - 68, 206, 68, 30);
            const methodIndex = PRAYER_METHODS.findIndex(([method]) => method === this._preferences.prayerMethod);
            const methodName = PRAYER_METHODS[Math.max(0, methodIndex)][1];
            place(content, makeTextButton(methodName,
                `Prayer calculation method, ${methodName}. Click to change`, () => {
                    const index = PRAYER_METHODS.findIndex(([method]) => method === this._preferences.prayerMethod);
                    const next = PRAYER_METHODS[(index + 1) % PRAYER_METHODS.length];
                    this._setPreference('prayerMethod', next[0]);
                }, 'perdana-island__color-apply'), 0, 244, contentWidth, 30);
            place(content, makeLabel(this._prayerStatusText(), 'perdana-island__settings-hint'),
                0, 280, contentWidth, 26);
        } else if (this._settingsSection === 'messages') {
            heading('Chat apps · shown on Messages', 0);
            const chatGap = 8;
            const chatWidth = (contentWidth - chatGap) / 2;
            CHAT_SOURCE_OPTIONS.forEach(([key, label, iconName], index) => {
                const enabled = this._preferences.notificationSources?.[key] !== false;
                const row = Math.floor(index / 2);
                const column = index % 2;
                const x = column * (chatWidth + chatGap);
                const y = 22 + row * 36;
                settingButton(`${label} ${enabled ? 'on' : 'off'}`, enabled, x, y,
                    chatWidth, () => this._setPreference('notificationSources', {
                        ...this._preferences.notificationSources,
                        [key]: !enabled,
                    }), iconName);
            });
            place(content, makeLabel('Chat messages are grouped by sender on the Messages page.',
                'perdana-island__settings-hint'), 0, 150, contentWidth, 24);
        } else if (this._settingsSection === 'notifications') {
            heading('Island notification banners', 0);
            settingButton(this._preferences.systemNotices ? 'Notices on' : 'Notices off',
                this._preferences.systemNotices, 0, 22, halfWidth,
                () => this._setPreference('systemNotices', !this._preferences.systemNotices),
                'preferences-system-notifications-symbolic');
            place(content, makeLabel('Controls banners shown by the island; GNOME notifications stay unchanged.',
                'perdana-island__settings-hint'), halfWidth + columnGap, 22, halfWidth, 32);

            heading('System alerts · shown on Notifications', 62);
            const sourceGap = 8;
            const sourceWidth = (contentWidth - sourceGap) / 2;
            SYSTEM_SOURCE_OPTIONS.forEach(([key, label, iconName], index) => {
                const enabled = this._preferences.notificationSources?.[key] !== false;
                const row = Math.floor(index / 2);
                const column = index % 2;
                const x = column * (sourceWidth + sourceGap);
                const y = 84 + row * 36;
                settingButton(`${label} ${enabled ? 'on' : 'off'}`, enabled, x, y,
                    sourceWidth, () => this._setPreference('notificationSources', {
                        ...this._preferences.notificationSources,
                        [key]: !enabled,
                    }), iconName);
            });
            place(content, makeLabel('Chat apps are on the Messages section. These switches only filter the island.',
                'perdana-island__settings-hint'), 0, 192, contentWidth, 24);
        } else if (this._settingsSection === 'data') {
            heading('Backup file', 0);
            settingButton('Save backup', false, 0, 22, halfWidth, () => this._saveBackup(),
                'document-save-symbolic');
            settingButton('Restore backup', false, halfWidth + columnGap, 22, halfWidth,
                () => this._requestRestore(), 'document-open-symbolic');
            const restore = this._pendingRestore;
            if (restore) {
                place(content, makeLabel(`${restore.name} · ${summarizeBackup(restore.summary)}`,
                    'perdana-island__settings-hint'), 0, 64, contentWidth, 18);
                settingButton('Restore now', false, 0, 86, halfWidth, () => this._applyRestore(),
                    'object-select-symbolic');
                settingButton('Cancel', false, halfWidth + columnGap, 86, halfWidth,
                    () => { this._pendingRestore = null; this._renderPanel(); }, 'window-close-symbolic');
            }
            let backupStatus = this._backupStatus
                || 'Tasks, notes, settings, and focus history. Clipboard and Shelf files are not included.';
            if (backupStatus.startsWith('Saved to ')) {
                const fileName = backupStatus.slice('Saved to '.length).split(/[\\/]/).pop();
                backupStatus = `Backup saved · ${fileName}`;
            }
            place(content, makeLabel(backupStatus,
                'perdana-island__settings-hint'), 0, restore ? 118 : 64, contentWidth, 34);
        } else {
            heading('Visible tabs · Settings stays available', 0);
            place(content, makeLabel('Drag tabs in the bar to reorder. The first tab opens with the island.',
                'perdana-island__settings-hint'), 0, 20, contentWidth, 18);
            const pages = this._orderedPages().filter(page =>
                !['settings', 'media', 'clipboard'].includes(page.key));
            const gap = 7;
            const itemWidth = (contentWidth - gap * 3) / 4;
            pages.forEach((page, index) => {
                const row = Math.floor(index / 4);
                const column = index % 4;
                const label = page.key === 'notifications' ? 'Alerts' : page.label;
                settingButton(label, this._preferences.visiblePages[page.key] !== false,
                    column * (itemWidth + gap), 44 + row * 34, itemWidth, () =>
                        this._setPageVisible(page.key, this._preferences.visiblePages[page.key] === false), page.icon);
            });
        }
    }

    _previewGreeting(returning) {
        if (!this._preferences?.greetingEnabled)
            return;
        this._clearTimeout('_greetingSource');
        const sessionId = this._sessionIdentifier();
        if (sessionId) {
            this._preferences.greetingLastSession = sessionId;
            this._savePreferences();
        }
        if (this._expanded)
            this._setExpanded(false);
        this._clearTimeout('_greetingPreviewSource');
        this._greetingPreviewSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 560, () => {
            this._greetingPreviewSource = 0;
            this._showSystemNotice('greeting', {
                title: this._greetingMessage(returning),
                subtitle: '',
            });
            return GLib.SOURCE_REMOVE;
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
            this._focusTickSecond = 0;
            this._resetFocusGuard();
            this._renderPanel();
            this._updateCollapsedLabel();
            return;
        }

        if (this._focusRemaining <= 0) {
            this._focusRemaining = this._focusDuration;
        }
        this._focusWasStarted = true;
        this._resetFocusGuard();
        this._focusTickSecond = 0;
        this._focusDeadline = GLib.get_monotonic_time() / MICROSECONDS_PER_SECOND + this._focusRemaining;
        this._focusSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            const remaining = Math.ceil(this._focusDeadline - GLib.get_monotonic_time() / MICROSECONDS_PER_SECOND);
            if (remaining <= 0) {
                const completedMode = this._focusMode;
                const completedDuration = this._focusDuration;
                if (completedMode === 'focus' || completedMode === 'custom') {
                    this._focusSessionsToday++;
                    this._recordFocusSeconds(completedDuration);
                }
                this._focusRemaining = 0;
                this._focusDeadline = 0;
                this._focusSource = 0;
                this._resetFocusGuard();
                if (this._activePage === 'focus')
                    this._renderPanel();
                this._updateSummaryRows();
                this._updateCollapsedLabel();
                this._showFocusCompleteNotice(completedMode, completedDuration);
                return GLib.SOURCE_REMOVE;
            }
            // Repaint the ring ten times a second so the arc grows smoothly,
            // but only touch the text and the compact label when the second
            // actually changes.
            this._focusRing?.queue_repaint();
            if (remaining !== this._focusTickSecond) {
                this._focusTickSecond = remaining;
                this._updateFocusPage(remaining);
                this._updateCollapsedLabel();
                if (remaining % 15 === 0)
                    this._trackFocusDistraction();
                if (remaining <= 5)
                    this._pulseFocusLabel();
            }
            return GLib.SOURCE_CONTINUE;
        });
        this._renderPanel();
        this._updateCollapsedLabel();
    }

    _resetFocusGuard() {
        this._focusGuardSeconds = 0;
        this._focusGuardNotified = false;
        this._focusGuardTick = GLib.get_monotonic_time() / MICROSECONDS_PER_SECOND;
    }

    _focusDistractionLabel() {
        try {
            const window = global.display.get_focus_window();
            if (!window)
                return null;
            return distractionLabel(`${window.get_wm_class?.() || ''} ${window.get_title?.() || ''}`);
        } catch (_error) {
            return null;
        }
    }

    _trackFocusDistraction() {
        if (!this._preferences?.focusGuard || !this._focusSource)
            return;
        const now = GLib.get_monotonic_time() / MICROSECONDS_PER_SECOND;
        const last = this._focusGuardTick || now;
        this._focusGuardTick = now;
        const delta = Math.max(0, Math.min(30, now - last));
        const label = this._focusDistractionLabel();
        if (!label) {
            this._focusGuardSeconds = Math.max(0, this._focusGuardSeconds - delta);
            return;
        }
        this._focusGuardSeconds += delta;
        if (this._focusGuardSeconds < FOCUS_GUARD_SECONDS || this._focusGuardNotified)
            return;
        const shown = this._showSystemNotice('focus-guard', {
            title: `5 min on ${label}`,
            subtitle: 'Focus session is still running',
        });
        this._focusGuardNotified = shown;
    }

    _openPage(key) {
        this._pinned = true;
        this._setExpanded(true);
        this._selectPage(key);
    }

    _setFocusDuration(seconds, mode = null) {
        this._clearTimeout('_focusSource');
        this._focusDeadline = 0;
        this._focusTickSecond = 0;
        this._resetFocusGuard();
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
        this._updateSummaryRows();
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

    _pulseFocusLabel() {
        const label = this._focusLabel;
        if (!label || this._reducedMotion)
            return;
        label.set_pivot_point(0.5, 0.5);
        label.remove_all_transitions();
        label.set_scale(1.06, 1.06);
        label.ease({
            scale_x: 1,
            scale_y: 1,
            duration: 340,
            mode: Clutter.AnimationMode.EASE_OUT_BACK,
        });
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
                    if (this._expanded && ['media', 'lyrics', 'summary'].includes(this._activePage))
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
                    if (this._expanded && ['media', 'lyrics', 'summary'].includes(this._activePage)
                        && (visualChanged || (playbackChanged && ['media', 'summary'].includes(this._activePage))))
                        this._renderPanel();
                    else if (this._expanded && ['media', 'lyrics', 'summary'].includes(this._activePage))
                        this._updateMediaProgress();
                });
                entry.seekedSignalId = proxy.connect('g-signal', (_proxy, _sender, signalName, parameters) => {
                    if (signalName !== 'Seeked')
                        return;
                    entry.positionBase = Number(parameters.deep_unpack()[0]) || 0;
                    entry.positionStamp = GLib.get_monotonic_time();
                    if (this._expanded && ['media', 'lyrics', 'summary'].includes(this._activePage))
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
        if (this._expanded && ['media', 'lyrics', 'summary'].includes(this._activePage))
            this._renderPanel();
    }

    _updateMediaTicker() {
        const player = this._getSelectedPlayer();
        const playing = player
            && this._getProperty(player.proxy, 'PlaybackStatus') === 'Playing';
        const smoothLyrics = this._expanded && this._activePage === 'lyrics';
        const interval = smoothLyrics ? 250 : 1000;
        this._updateRestingLyricsTicker();
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

    _updateRestingLyricsTicker() {
        const player = this._getSelectedPlayer();
        const shouldRun = Boolean(this._preferences?.showRestingLyrics && player
            && this._getProperty(player.proxy, 'PlaybackStatus') === 'Playing');
        if (!shouldRun) {
            this._clearTimeout('_restingLyricsSource');
            return;
        }
        if (this._restingLyricsSource)
            return;

        this._restingLyricsSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 180, () => {
            if (!this._enabled || !this._preferences?.showRestingLyrics) {
                this._restingLyricsSource = 0;
                return GLib.SOURCE_REMOVE;
            }
            const currentPlayer = this._getSelectedPlayer();
            if (!currentPlayer || this._getProperty(currentPlayer.proxy, 'PlaybackStatus') !== 'Playing') {
                this._restingLyricsSource = 0;
                return GLib.SOURCE_REMOVE;
            }
            const metadata = this._getMetadata(currentPlayer.proxy);
            this._ensureLyrics(metadata, currentPlayer.name);
            const lyric = this._currentLyricsText(this._positionForPlayer(currentPlayer));
            if (!this._expanded && !this._closing && !this._systemNoticeActive && !this._tuckedByBrowser)
                this._setCompactTrackText(lyric || metadata.title || currentPlayer.name.replace(MPRIS_PREFIX, ''));
            return GLib.SOURCE_CONTINUE;
        });
    }

    _getSelectedPlayer() {
        const players = [...this._players.values()];
        if (this._preferences?.smartMusicDetection === false) {
            const playing = players.find(player =>
                this._getProperty(player.proxy, 'PlaybackStatus') === 'Playing');
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

        const playingMusic = players.find(player =>
            this._getProperty(player.proxy, 'PlaybackStatus') === 'Playing'
            && this._classifyPlayer(player).kind === 'music');
        if (playingMusic) {
            this._selectedPlayerName = playingMusic.name;
            return playingMusic;
        }

        // Do not keep displaying a paused song while another app plays speech or video.
        if (players.some(player => this._getProperty(player.proxy, 'PlaybackStatus') === 'Playing')) {
            this._selectedPlayerName = null;
            return null;
        }

        const remembered = this._players.get(this._selectedPlayerName);
        if (remembered && this._classifyPlayer(remembered, false).kind === 'music')
            return remembered;

        const pausedMusic = players.find(player => this._classifyPlayer(player, false).kind === 'music');
        this._selectedPlayerName = pausedMusic?.name || null;
        return pausedMusic || null;
    }

    _classifyPlayer(player, requirePlaying = true) {
        const metadata = this._getMetadata(player.proxy);
        return classifyMedia({
            source: player.name.replace(MPRIS_PREFIX, ''),
            desktopEntry: player.name,
            title: metadata.title,
            artist: metadata.artist,
            album: metadata.album,
            genre: metadata.genre,
            contentType: metadata.contentType,
            url: metadata.url,
            trackId: metadata.trackId,
            durationSeconds: metadata.length / 1_000_000,
            playbackStatus: this._getProperty(player.proxy, 'PlaybackStatus'),
        }, {enabled: this._preferences?.smartMusicDetection !== false, requirePlaying});
    }

    _getProperty(proxy, property) {
        return unpack(proxy.get_cached_property(property));
    }

    _getMetadata(proxy) {
        const metadata = unpack(proxy.get_cached_property('Metadata')) || {};
        const title = unpack(metadata['xesam:title']);
        const rawArtist = unpack(metadata['xesam:artist']);
        const album = unpack(metadata['xesam:album']);
        const genre = unpack(metadata['xesam:genre']);
        const contentType = unpack(metadata['xesam:contentType'])
            || unpack(metadata['xesam:mediaType']);
        const url = unpack(metadata['xesam:url']);
        const lyrics = unpack(metadata['xesam:asText']);
        const artist = Array.isArray(rawArtist) ? rawArtist.join(', ') : rawArtist;
        return {
            title: typeof title === 'string' ? title : '',
            artist: typeof artist === 'string' ? artist : '',
            album: typeof album === 'string' ? album : '',
            genre: Array.isArray(genre) ? genre : typeof genre === 'string' ? genre : '',
            contentType: typeof contentType === 'string' ? contentType : '',
            url: typeof url === 'string' ? url : '',
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
            const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, size, size);
            const cr = new Cairo.Context(surface);
            const corner = Math.min(Math.round(radius), Math.floor(size / 2));
            const offsetX = Math.floor((size - source.width) / 2);
            const offsetY = Math.floor((size - source.height) / 2);

            if (!this._artworkCacheDirectory)
                this._artworkCacheDirectory = GLib.dir_make_tmp('perdana-island-art-XXXXXX');
            const digest = GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, key, -1);
            const roundedPath = GLib.build_filenamev([
                this._artworkCacheDirectory,
                `${digest}.png`,
            ]);

            cr.setOperator(Cairo.Operator.CLEAR);
            cr.paint();
            cr.setOperator(Cairo.Operator.OVER);
            cr.newPath();
            cr.moveTo(corner, 0);
            cr.lineTo(size - corner, 0);
            cr.arc(size - corner, corner, corner, -Math.PI / 2, 0);
            cr.lineTo(size, size - corner);
            cr.arc(size - corner, size - corner, corner, 0, Math.PI / 2);
            cr.lineTo(corner, size);
            cr.arc(corner, size - corner, corner, Math.PI / 2, Math.PI);
            cr.lineTo(0, corner);
            cr.arc(corner, corner, corner, Math.PI, Math.PI * 1.5);
            cr.closePath();
            cr.clip();
            Gdk.cairo_set_source_pixbuf(cr, source, offsetX, offsetY);
            cr.paint();
            cr.$dispose();
            surface.writeToPNG(roundedPath);

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
        if (!this._expanded || !['media', 'lyrics', 'summary'].includes(this._activePage)
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
        const fillWidth = Math.max(1, this._progressLine.width * ratio);
        const smooth = !this._reducedMotion && this._progressFill._perdanaSmoothReady
            && !this._progressSeeking && this._isPlaying();
        if (smooth) {
            // The ticker repeats every 250 ms on Lyrics and every second on
            // Music. Matching the tween to that interval keeps the fill moving
            // between updates instead of stepping once per tick.
            this._progressFill.ease({
                width: fillWidth,
                duration: Math.max(200, this._mediaTickerInterval || 1000),
                mode: Clutter.AnimationMode.LINEAR,
            });
        } else {
            this._progressFill.remove_all_transitions();
            this._progressFill.width = fillWidth;
        }
        this._progressFill._perdanaSmoothReady = true;
        if (this._activePage === 'lyrics')
            this._updateLyricsLines(position);
        else if (this._activePage === 'summary')
            this._updateSummaryMedia();
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

        const lyricsMode = Boolean(this._preferences?.showRestingLyrics);
        const rawDisplayText = String(text || '');
        const displayText = lyricsMode
            ? rawDisplayText.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()
            : rawDisplayText;
        const previousText = label.text;
        const textChanged = previousText !== displayText;
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
            'perdana-island__compact-track-title--lyrics-tiny',
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
            const fitKey = `${this._restingLyricsWidth}\u001f${this._preferences?.fontFamily || ''}\u001f${displayText}`;
            if (fitKey !== this._compactLyricsFitKey) {
                this._compactLyricsFitKey = fitKey;
                for (const fitClass of fitClasses)
                    label.remove_style_class_name(fitClass);

                const candidates = [
                    {className: null, lineHeight: 16},
                    {className: fitClasses[0], lineHeight: 15},
                    {className: fitClasses[1], lineHeight: 12},
                    {className: fitClasses[2], lineHeight: 10},
                ];
                const fit = candidates.find(candidate =>
                    this._measureCompactLyricsHeight(
                        displayText,
                        availableTextWidth,
                        candidate.className,
                        candidate.lineHeight
                    ) <= RESTING_LYRICS_HEIGHT - 12
                ) || candidates[candidates.length - 1];
                this._compactLyricsFitClass = fit.className;
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
        if (lyricsMode && textChanged) {
            this._compactTextTransitionGeneration++;
            this._compactTrackPendingText = null;
            label.remove_all_transitions();
            applyFitClass();
            label.text = displayText;
            this._layoutCompactTrackTitle();
            if (previousText && label.visible && geometryStable && !this._reducedMotion) {
                label.opacity = 0;
                label.ease({
                    opacity: 255,
                    duration: this._motionDuration(105),
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            } else {
                label.opacity = 255;
            }
            return;
        }
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
                    this._layoutCompactTrackTitle();
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
            this._layoutCompactTrackTitle();
            if (lyricsMode && previousText && label.visible && !this._expanded && !this._closing)
                label.opacity = 255;
        } else if (this._compactTrackPendingText === displayText) {
            return;
        } else if (this._compactLyricsAppliedFitClass !== desiredFitClass) {
            applyFitClass();
            this._layoutCompactTrackTitle();
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
        if (!this._uiActorsAlive || !this._compact || this._systemNoticeActive || this._tuckedByBrowser)
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
        this._compactTextSpacer.visible = Boolean(showMedia && player);
        this._focusCompact.visible = focusRunning;
        const running = selectActivity(this._activities);
        const showActivity = Boolean(!focusRunning && !showMedia && running);
        this._activityCompact.visible = showActivity;
        if (showActivity) {
            this._activityCompactLabel.text = cleanActivityText(running.title, 64);
            const progress = normalizeProgress(running.progress);
            const ratio = progress ?? (running.total > 0
                ? Math.min(1, running.bytes / running.total) : 0.35);
            this._activityCompactFill.width = Math.round(this._activityCompactBar.width * ratio);
        }
        if (focusRunning) {
            const remaining = Math.max(0, Math.ceil(
                this._focusDeadline - GLib.get_monotonic_time() / MICROSECONDS_PER_SECOND
            ));
            this._focusCompactLabel.text = this._focusModeLabel();
            this._focusCompactTime.text = formatTime(remaining);
        }
        this._compactCenter.visible = !showMedia && !focusRunning && !showActivity;
        this._compactCenter.opacity = 255;
        this._idleEyes.visible = !showMedia && !focusRunning && !showActivity;
        this._compactClockLabel.visible = !showMedia && !focusRunning && !showActivity;
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
                Boolean(playing && this._expanded
                    && ['media', 'summary'].includes(this._activePage))
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
        if ((playing || focusRunning) && this._root.hover && !this._expanded
            && !this._tuckedByBrowser && !this._hoverOpenSource) {
            this._hoverOpenSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 160, () => {
                this._hoverOpenSource = 0;
                if (this._root?.hover && !this._islandDrag?.moved
                    && (this._isPlaying() || this._focusSource)) {
                    const page = this._focusSource ? 'focus'
                        : (this._isPlaying()
                            ? (this._preferences?.showRestingLyrics ? 'lyrics' : 'media')
                            : 'focus');
                    if (this._visiblePages().some(entry => entry.key === page))
                        this._activePage = page;
                    this._updateMediaTicker();
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

    _connectClipboardMonitor() {
        if (!this._enabled || this._clipboardOwnerChangedSignal || this._clipboardPollSource)
            return;

        try {
            this._clipboardSelection = global.display.get_selection();
            this._clipboardOwnerChangedSignal = this._clipboardSelection.connect(
                'owner-changed', (_selection, selectionType) => {
                    if (!this._enabled || selectionType !== Meta.SelectionType.SELECTION_CLIPBOARD)
                        return;

                    // A new owner means a new copy, including when the copied
                    // value matches an item the user previously deleted.
                    this._clipboardSuppressedValue = null;
                    this._scheduleClipboardCapture();
                }
            );
        } catch (error) {
            this._clipboardSelection = null;
            this._clipboardOwnerChangedSignal = 0;
            logError(error, 'Perdana Island could not monitor clipboard changes');
            this._setClipboardNotice('Clipboard event monitor unavailable; fallback active');
        }

        // Mutter may miss owner-changed events for clipboard managers or some
        // Wayland clients. Poll as a fallback; history de-duplication keeps the
        // same value from being added again, while copies still appear promptly.
        this._scheduleClipboardCapture();
        this._clipboardPollSource = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
            if (!this._enabled) {
                this._clipboardPollSource = 0;
                return GLib.SOURCE_REMOVE;
            }
            this._captureClipboard();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _disconnectClipboardMonitor() {
        this._clearTimeout('_clipboardSource');
        this._clearTimeout('_clipboardRequestTimeoutSource');
        this._clearTimeout('_clipboardPollSource');
        this._clipboardRequestGeneration++;
        this._clipboardInFlight = false;
        if (this._clipboardSelection && this._clipboardOwnerChangedSignal) {
            this._clipboardSelection.disconnect(this._clipboardOwnerChangedSignal);
            this._clipboardOwnerChangedSignal = 0;
        }
        this._clipboardSelection = null;
    }

    _scheduleClipboardCapture(delayMs = 150) {
        this._clearTimeout('_clipboardSource');

        // If the clipboard changes while a request is in flight, discard the
        // stale result and read from the newest owner after it settles.
        if (this._clipboardInFlight) {
            this._clipboardRequestGeneration++;
            this._clipboardInFlight = false;
            this._clearTimeout('_clipboardRequestTimeoutSource');
        }

        this._clipboardSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delayMs, () => {
            this._clipboardSource = 0;
            if (this._enabled)
                this._captureClipboard();
            return GLib.SOURCE_REMOVE;
        });
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
            return GLib.file_set_contents(path, JSON.stringify(tasks));
        } catch (error) {
            logError(error, 'Perdana Island could not synchronize its task list');
            return false;
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
        if (this._clipboardInFlight || !this._enabled)
            return;

        let requestGeneration = 0;
        try {
            const clipboard = St.Clipboard.get_default();
            const mimeTypes = clipboard.get_mimetypes(St.ClipboardType.CLIPBOARD) || [];
            if (mimeTypes.some(isSensitiveClipboardMimeType)) {
                this._setClipboardNotice('Password skipped');
                return;
            }
            const hasTextContent = mimeTypes.some(mimeType =>
                /^text\//i.test(mimeType)
                || ['utf8_string', 'string', 'compound_text'].includes(String(mimeType).toLowerCase()));
            if (mimeTypes.length && !hasTextContent) {
                this._setClipboardNotice('Only text copies are saved');
                return;
            }
            this._clipboardInFlight = true;
            requestGeneration = ++this._clipboardRequestGeneration;
            this._clipboardRequestTimeoutSource = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT, 5, () => {
                    this._clipboardRequestTimeoutSource = 0;
                    if (requestGeneration === this._clipboardRequestGeneration) {
                        this._clipboardInFlight = false;
                        this._clipboardReadFailed = true;
                        log('Perdana Island clipboard read timed out');
                        this._setClipboardNotice('Clipboard read timed out');
                    }
                    return GLib.SOURCE_REMOVE;
                }
            );
            clipboard.get_text(St.ClipboardType.CLIPBOARD, (_clipboard, text) => {
                if (requestGeneration !== this._clipboardRequestGeneration)
                    return;

                this._clearTimeout('_clipboardRequestTimeoutSource');
                this._clipboardInFlight = false;
                if (!this._enabled)
                    return;

                this._clipboardReadFailed = false;
                const rawValue = String(text || '').trim();
                if (isPasswordLikeClipboardText(rawValue)) {
                    this._setClipboardNotice('Password skipped');
                    return;
                }
                if (!rawValue && mimeTypes.length) {
                    this._setClipboardNotice('No readable text in the current clipboard');
                    return;
                }

                const noticeChanged = this._clipboardNotice !== null;
                this._clipboardNotice = null;
                if (!rawValue) {
                    if (noticeChanged && this._expanded && this._clipboardVisible())
                        this._renderPanel();
                    return;
                }

                const value = rawValue.slice(0, 1200);
                if (this._clipboardSuppressedValue !== null) {
                    if (value === this._clipboardSuppressedValue) {
                        if (noticeChanged)
                            this._renderPanel();
                        return;
                    }
                    this._clipboardSuppressedValue = null;
                }
                if (!value) {
                    if (noticeChanged)
                        this._renderPanel();
                    return;
                }

                const duplicateIndex = this._clipboardItems.findIndex(item =>
                    areClipboardHistoryValuesEqual(item, value));
                if (duplicateIndex >= 0) {
                    if (duplicateIndex > 0) {
                        const [existingValue] = this._clipboardItems.splice(duplicateIndex, 1);
                        this._clipboardItems.unshift(existingValue);
                        this._saveClipboardItems();
                    }
                    if (noticeChanged || duplicateIndex > 0)
                        this._renderPanel();
                    return;
                }

                this._clipboardItems.unshift(value);
                this._clipboardItems = this._clipboardItems.slice(0, CLIPBOARD_LIMIT);
                this._saveClipboardItems();
                this._updateClipboardIndicator();
                if (this._expanded && this._clipboardVisible())
                    this._renderPanel();
            });
        } catch (error) {
            if (requestGeneration)
                this._clipboardRequestGeneration++;
            this._clearTimeout('_clipboardRequestTimeoutSource');
            this._clipboardInFlight = false;
            if (!this._clipboardReadFailed) {
                logError(error, 'Perdana Island could not read the clipboard');
                this._setClipboardNotice('Clipboard read failed');
            }
            this._clipboardReadFailed = true;
        }
    }

    _setClipboardNotice(message) {
        if (this._clipboardNotice === message)
            return;
        this._clipboardNotice = message;
        if (this._enabled && this._expanded && this._clipboardVisible())
            this._renderPanel();
    }

    _clearClipboardArmed() {
        return Boolean(this._clipboardArmTimer);
    }

    _clearClipboardPressed() {
        if (!this._clipboardItems.length)
            return;
        if (!this._clearClipboardArmed()) {
            this._clipboardArmTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 4000, () => {
                this._clipboardArmTimer = 0;
                this._renderPanel();
                return GLib.SOURCE_REMOVE;
            });
            this._renderPanel();
            return;
        }
        GLib.source_remove(this._clipboardArmTimer);
        this._clipboardArmTimer = 0;
        this._clipboardItems = [];
        this._saveClipboardItems();
        this._updateClipboardIndicator();
        this._renderPanel();
    }

    _deleteClipboardItem(item) {
        this._clipboardItems = this._clipboardItems.filter(value => value !== item);
        this._clipboardSuppressedValue = item;
        this._saveClipboardItems();
        this._updateClipboardIndicator();
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
            const normalized = data
                .filter(value => typeof value === 'string')
                .map(value => value.trim().slice(0, 1200))
                .filter(Boolean);
            const uniqueItems = [];
            const seenKeys = new Set();
            let skippedSensitiveItem = false;
            normalized.forEach(value => {
                if (isPasswordLikeClipboardText(value)) {
                    skippedSensitiveItem = true;
                    return;
                }
                const key = normalizeClipboardHistoryKey(value);
                if (!seenKeys.has(key)) {
                    seenKeys.add(key);
                    uniqueItems.push(value);
                }
            });
            const safeItems = uniqueItems.slice(0, CLIPBOARD_LIMIT);
            if (skippedSensitiveItem)
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
            GLib.file_set_contents(this._clipboardFile, JSON.stringify(items.slice(0, CLIPBOARD_LIMIT)));
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

    _setShelfNotice(text) {
        this._shelfNotice = text;
        this._clearTimeout('_shelfNoticeSource');
        this._shelfNoticeSource = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
            this._shelfNoticeSource = 0;
            this._shelfNotice = null;
            if (this._activePage === 'shelf')
                this._renderPanel();
            return GLib.SOURCE_REMOVE;
        });
        if (this._activePage === 'shelf')
            this._renderPanel();
    }

    _captureScreenshotToShelf() {
        if (this._screenshotRequest)
            return;
        this._screenshotRequest = true;
        const token = `perdana_${Date.now()}`;
        const sender = Gio.DBus.session.get_unique_name()?.slice(1).replace(/\./g, '_') || '';
        const requestPath = `/org/freedesktop/portal/desktop/request/${sender}/${token}`;
        const stamp = GLib.DateTime.new_now_local().format('%Y-%m-%d %H-%M-%S');
        const destination = GLib.build_filenamev([this._shelfDirectory, `Screenshot ${stamp}.png`]);
        let done = false;

        const finish = uri => {
            if (done)
                return;
            done = true;
            if (this._screenshotTimeout) {
                GLib.source_remove(this._screenshotTimeout);
                this._screenshotTimeout = 0;
            }
            if (this._screenshotSubscription) {
                Gio.DBus.session.signal_unsubscribe(this._screenshotSubscription);
                this._screenshotSubscription = 0;
            }
            this._screenshotRequest = false;
            if (!this._enabled)
                return;
            if (!uri) {
                this._setShelfNotice('Screenshot failed');
                return;
            }
            try {
                GLib.mkdir_with_parents(this._shelfDirectory, 0o755);
                const source = Gio.File.new_for_uri(uri);
                const target = Gio.File.new_for_path(destination);
                try {
                    source.move(target, Gio.FileCopyFlags.OVERWRITE, null, null);
                } catch (_moveError) {
                    // Pictures and the data directory can live on different filesystems.
                    source.copy(target, Gio.FileCopyFlags.OVERWRITE, null, null);
                    source.delete(null);
                }
                this._shelfItems = this._loadShelfItems();
                this._setShelfNotice('Screenshot saved');
            } catch (error) {
                logError(error, 'Perdana Island could not store the screenshot in the Shelf');
                this._setShelfNotice('Screenshot failed');
            }
        };

        this._screenshotSubscription = Gio.DBus.session.signal_subscribe(
            'org.freedesktop.portal.Desktop',
            'org.freedesktop.portal.Request',
            'Response',
            requestPath,
            null,
            Gio.DBusSignalFlags.NONE,
            (_connection, _senderName, _objectPath, _interface, _signal, parameters) => {
                try {
                    const [code, results] = parameters.deep_unpack();
                    const uri = results?.uri?.deep_unpack?.() ?? results?.uri ?? null;
                    finish(code === 0 && uri ? uri : null);
                } catch (_error) {
                    finish(null);
                }
            }
        );
        this._screenshotTimeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 10, () => {
            this._screenshotTimeout = 0;
            finish(null);
            return GLib.SOURCE_REMOVE;
        });

        try {
            Gio.DBus.session.call(
                'org.freedesktop.portal.Desktop',
                '/org/freedesktop/portal/desktop',
                'org.freedesktop.portal.Screenshot',
                'Screenshot',
                new GLib.Variant('(sa{sv})', ['', {
                    interactive: new GLib.Variant('b', false),
                    modal: new GLib.Variant('b', false),
                    handle_token: new GLib.Variant('s', token),
                }]),
                new GLib.VariantType('(o)'),
                Gio.DBusCallFlags.NONE,
                -1,
                null,
                (connection, result) => {
                    try {
                        connection.call_finish(result);
                    } catch (error) {
                        logError(error, 'Perdana Island could not request a screenshot');
                        finish(null);
                    }
                }
            );
        } catch (error) {
            logError(error, 'Perdana Island could not request a screenshot');
            finish(null);
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
        const restoreExpanded = type === 'brightness' && this._expanded;
        if (!this._enabled || !this._root || this._userHidden || (this._expanded && !restoreExpanded)
            || (type === 'greeting' ? !this._preferences.greetingEnabled : !this._preferences.systemNotices))
            return false;
        // A system OSD takes over the island's current geometry. Interrupt a
        // closing transition so the banner uses the notice radius and cannot
        // inherit the expanded page's temporary shape.
        this._closing = false;
        if (restoreExpanded) {
            this._brightnessRestoreExpanded = true;
            this._brightnessRestorePage = this._activePage;
            this._brightnessRestorePinned = this._pinned;
            this._expanded = false;
            this._pinned = false;
            this._collapsedTargetSize = null;
            this._root.remove_style_class_name('perdana-island--expanded');
            this._stopTodayTicker();
            this._setEqualizerPlaying(this._mediaEqualizer, false);
        }
        if (this._tuckedByBrowser)
            this._setBrowserTucked(false);
        const sameNotice = this._systemNoticeActive && this._systemNoticeType === type;
        this._clearTimeout('_noticeDismissSource');
        this._systemNoticeActive = true;
        this._systemNoticeType = type;
        this._noticeNotificationItem = type === 'application' ? data : null;

        const duration = ['volume', 'brightness'].includes(type) ? 2
            : ['agenda', 'recap', 'focus-guard'].includes(type) ? 7
                : type === 'water' || type === 'prayer' ? 6
                : ['focus', 'application', 'greeting'].includes(type) ? 4 : 3;
        this._noticeDismissSource = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, duration, () => {
            this._noticeDismissSource = 0;
            this._dismissSystemNotice(true);
            return GLib.SOURCE_REMOVE;
        });

        try {
            if (!sameNotice) {
                const actionable = type === 'application'
                    || ['agenda', 'recap', 'focus-guard', 'water', 'prayer'].includes(type);
                this._noticeBanner?.destroy();
                this._root.remove_all_transitions();
                this._root.add_style_class_name('perdana-island--notice');
                this._content.hide();
                this._noticeBanner = new St.BoxLayout({
                    style_class: 'perdana-island__notice-banner',
                    clip_to_allocation: true,
                    reactive: actionable,
                    can_focus: actionable,
                    track_hover: actionable,
                    accessible_name: actionable ? 'Open the matching page' : null,
                });
                this._noticeBanner.set_position(0, 0);
                this._noticeBanner.set_size(394, 76);
                this._noticeBanner.opacity = 0;
                this._noticeBanner.translation_y = 8;
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
                } else if (['agenda', 'recap', 'focus-guard', 'water', 'prayer'].includes(type)) {
                    const openNoticePage = () => {
                        this._dismissSystemNotice(true);
                        const page = type === 'agenda' ? 'tasks'
                            : type === 'recap' ? 'today'
                                : type === 'focus-guard' ? 'focus' : 'reminders';
                        this._openPage(page);
                    };
                    this._noticeBanner.connect('button-release-event', () => {
                        openNoticePage();
                        return Clutter.EVENT_STOP;
                    });
                    this._noticeBanner.connect('key-press-event', (_actor, event) => {
                        const symbol = event.get_key_symbol();
                        if (symbol !== Clutter.KEY_Return && symbol !== Clutter.KEY_KP_Enter
                            && symbol !== Clutter.KEY_space)
                            return Clutter.EVENT_PROPAGATE;
                        openNoticePage();
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
                    orientation: Clutter.Orientation.VERTICAL,
                    x_expand: true,
                    y_align: Clutter.ActorAlign.CENTER,
                    style_class: 'perdana-island__notice-copy',
                });
                this._noticeTitle = makeLabel('', 'perdana-island__notice-title');
                this._noticeSubtitle = makeLabel('', 'perdana-island__notice-subtitle');
                for (const label of [this._noticeTitle, this._noticeSubtitle]) {
                    label.x_expand = true;
                    label.x_align = Clutter.ActorAlign.FILL;
                    label.clutter_text.line_wrap = false;
                    label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
                }
                if (type === 'greeting') {
                    this._noticeTitle.add_style_class_name('perdana-island__notice-title--greeting');
                    this._noticeTitle.clutter_text.line_wrap = true;
                    this._noticeTitle.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
                    this._noticeTitle.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
                    this._noticeSubtitle.hide();
                }
                this._noticeCopy.add_child(this._noticeTitle);
                this._noticeCopy.add_child(this._noticeSubtitle);
                this._noticeBanner.add_child(this._noticeCopy);

                this._noticeRight = null;
                this._noticePercent = null;
                this._noticeVolumeTrack = null;
                this._noticeVolumeFill = null;
                if (['agenda', 'recap', 'focus-guard', 'water', 'prayer'].includes(type)) {
                    this._noticeRight = new St.BoxLayout({
                        orientation: Clutter.Orientation.VERTICAL,
                        y_align: Clutter.ActorAlign.CENTER,
                        style_class: 'perdana-island__notice-right',
                    });
                    this._noticeRight.add_child(makeLabel('View', 'perdana-island__notice-action'));
                    this._noticeBanner.add_child(this._noticeRight);
                } else if (!['application', 'greeting'].includes(type)) {
                    this._noticeRight = new St.BoxLayout({
                        orientation: Clutter.Orientation.VERTICAL,
                        y_align: Clutter.ActorAlign.CENTER,
                        style_class: 'perdana-island__notice-right',
                    });
                    this._noticePercent = makeLabel('', 'perdana-island__notice-percent');
                    this._noticePercent.set_size(type === 'volume' ? 84 : 72, 36);
                    this._noticeRight.add_child(this._noticePercent);
                    if (['volume', 'brightness'].includes(type)) {
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
                    duration: this._motionDuration(320),
                    mode: Clutter.AnimationMode.EASE_OUT_QUINT,
                    onComplete: () => this._layoutIsland(),
                });
                this._layoutIsland();
                this._noticeBanner.ease({
                    opacity: 255,
                    translation_y: 0,
                    duration: this._motionDuration(280),
                    mode: Clutter.AnimationMode.EASE_OUT_QUINT,
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
                this._noticeVolumeFill.ease({
                    width: 84 * Math.min(100, percent) / 100,
                    duration: 130,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            } else if (type === 'brightness') {
                const percent = Math.max(0, Math.min(100, Number(data.percent) || 0));
                this._noticeTitle.text = 'Brightness';
                this._noticeSubtitle.text = 'Display brightness';
                this._noticePercent.text = `${percent}%`;
                this._noticeVolumeIcon.icon_name = 'display-brightness-symbolic';
                this._noticeVolumeFill.ease({
                    width: 84 * percent / 100,
                    duration: 130,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            } else if (type === 'application') {
                const oneLine = value => String(value || '')
                    .replace(/[\r\n\t\u2028\u2029]+/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                const appName = oneLine(data.app) || 'Notification';
                const title = oneLine(data.title);
                const body = oneLine(data.body);
                this._noticeTitle.text = appName;
                this._noticeSubtitle.text = [title, body].filter(Boolean).join(' · ');
                const sourceIcon = data.notification?.gicon
                    || data.source?.icon || data.source?.app?.get_icon?.()
                    || Gio.ThemedIcon.new('application-x-executable-symbolic');
                if (data.appIconFile && GLib.file_test(data.appIconFile, GLib.FileTest.EXISTS)) {
                    this._noticeVolumeIcon.gicon = Gio.FileIcon.new(Gio.File.new_for_path(data.appIconFile));
                } else {
                    this._noticeVolumeIcon.gicon = data.appIconName
                        ? Gio.ThemedIcon.new(data.appIconName) : sourceIcon;
                }
                this._noticeVolumeIcon.fallback_gicon = isChatItem(data)
                    ? Gio.ThemedIcon.new('application-x-executable-symbolic') : sourceIcon;
            } else if (type === 'greeting') {
                this._noticeTitle.text = data.title;
                this._noticeVolumeIcon.icon_name = 'avatar-default-symbolic';
            } else if (['agenda', 'recap', 'focus-guard', 'water', 'prayer'].includes(type)) {
                this._noticeTitle.text = data.title;
                this._noticeSubtitle.text = data.subtitle;
                this._noticeVolumeIcon.icon_name = type === 'agenda'
                    ? 'x-office-calendar-symbolic'
                    : type === 'recap' ? 'emblem-ok-symbolic'
                        : type === 'focus-guard' ? 'dialog-warning-symbolic'
                            : type === 'water' ? 'alarm-symbolic' : 'x-office-calendar-symbolic';
            } else {
                this._noticeTitle.text = data.title;
                this._noticeSubtitle.text = data.subtitle;
                this._noticePercent.text = formatTime(data.duration);
                this._noticePercent.add_style_class_name('perdana-island__notice-time');
                this._noticeVolumeIcon.icon_name = 'alarm-symbolic';
            }
            return true;
        } catch (error) {
            logError(error, 'Perdana Island could not render a system notice');
            return false;
        }
    }

    _dismissSystemNotice(animate = true) {
        this._clearTimeout('_noticeDismissSource');
        if (!this._systemNoticeActive)
            return;
        const restoreExpanded = this._brightnessRestoreExpanded && this._enabled;
        const restorePage = this._brightnessRestorePage;
        const restorePinned = this._brightnessRestorePinned;
        this._brightnessRestoreExpanded = false;
        this._brightnessRestorePage = null;
        this._brightnessRestorePinned = false;
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
        if (restoreExpanded) {
            if (noticeBanner?.get_parent())
                noticeBanner.destroy();
            if (this._noticeBanner === noticeBanner)
                this._noticeBanner = null;
            if (restorePage && this._visiblePages().some(page => page.key === restorePage))
                this._activePage = restorePage;
            this._pinned = restorePinned;
            this._setExpanded(true);
            return;
        }
        if (animate) {
            noticeBanner?.ease({
                opacity: 0,
                translation_y: 5,
                duration: this._motionDuration(170),
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
            });
            this._root.ease({
                width: this._collapsedWidth(),
                height: this._collapsedHeight(),
                duration: this._motionDuration(240),
                mode: Clutter.AnimationMode.EASE_OUT_QUINT,
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

    _addTask(text, due = null, priority = null, dueDate = null) {
        const trimmed = text.trim().slice(0, 120);
        if (!trimmed)
            return;
        const scheduleDate = typeof dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dueDate)
            ? dueDate
            : Number.isInteger(due) ? dateKey() : null;
        this._tasks.push({
            id: GLib.uuid_string_random(),
            text: trimmed,
            done: false,
            doneAt: null,
            due: Number.isInteger(due) ? due : null,
            dueDate: scheduleDate,
            priority: TASK_PRIORITIES.includes(priority) ? priority : null,
        });
        this._saveTasks();
        this._renderPanel();
    }

    _toggleTask(id) {
        const now = new Date();
        this._tasks = this._tasks.map(task => task.id === id
            ? {...task, done: !task.done, doneAt: task.done ? null : now.toISOString()}
            : task);
        this._saveTasks();
        this._renderPanel();
    }

    _setTaskTime(id, minutes) {
        this._tasks = this._tasks.map(task => task.id === id
            ? {
                ...task,
                due: Number.isInteger(minutes) ? minutes : null,
                dueDate: task.dueDate || (Number.isInteger(minutes) ? dateKey() : null),
            }
            : task);
        this._saveTasks();
        this._renderPanel();
    }

    _cycleTaskPriority(id) {
        this._tasks = this._tasks.map(task => {
            if (task.id !== id)
                return task;
            const order = [null, ...TASK_PRIORITIES];
            const index = order.indexOf(task.priority ?? null);
            return {...task, priority: order[(index + 1) % order.length]};
        });
        this._saveTasks();
        this._renderPanel();
    }

    _cycleTaskDraftPriority() {
        this._taskDraftText = this._taskTextEntry?.get_text() ?? this._taskDraftText ?? '';
        this._taskDraftDueText = this._taskTimeEntry?.get_text() ?? this._taskDraftDueText ?? '';
        const order = [null, ...TASK_PRIORITIES];
        const index = order.indexOf(this._taskDraftPriority ?? null);
        this._taskDraftPriority = order[(index + 1) % order.length];
        this._renderPanel();
    }

    _submitTaskDraft() {
        const text = this._taskTextEntry?.get_text() ?? this._taskDraftText ?? '';
        const dueText = (this._taskTimeEntry?.get_text() ?? this._taskDraftDueText ?? '').trim();
        const due = parseClockTime(dueText);
        if (dueText && due === null) {
            this._taskTimeEntry?.add_style_class_name('perdana-island__task-entry--invalid');
            return;
        }
        const priority = this._taskDraftPriority ?? null;
        this._taskAdding = false;
        this._taskDraftText = '';
        this._taskDraftDueText = '';
        this._taskDraftPriority = null;
        if (text.trim())
            this._addTask(text, due, priority);
        else
            this._renderPanel();
    }

    _agendaTasks(key = dateKey()) {
        return this._tasks
            .filter(task => !task.done && task.dueDate === key)
            .sort((first, second) => (first.due ?? Number.MAX_SAFE_INTEGER)
                - (second.due ?? Number.MAX_SAFE_INTEGER));
    }

    _tasksDoneToday() {
        const today = dateKey();
        return this._tasks.filter(task => task.done && task.doneAt
            && dateKey(new Date(task.doneAt)) === today);
    }

    _focusSecondsToday() {
        return Number(this._focusLog?.[dateKey()]) || 0;
    }

    _dailyReportText() {
        const now = new Date();
        const formatted = new Intl.DateTimeFormat('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric',
        }).format(now);
        const agenda = this._agendaTasks();
        const done = this._tasksDoneToday().length;
        const open = this._tasks.filter(task => !task.done).length;
        const focus = Math.round(this._focusSecondsToday() / 60);
        const lines = [
            `Perdana Island · ${formatted}`,
            `Tasks done: ${done}`,
            `Open tasks: ${open}`,
        ];
        if (agenda.length) {
            lines.push(`Scheduled: ${agenda
                .map(task => `${Number.isInteger(task.due) ? `${formatClockTime(task.due)} ` : ''}${task.text}`)
                .join(', ')}`);
        }
        lines.push(`Focus: ${focus} min`);
        return lines.join('\n');
    }

    _copyDailyReport() {
        St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, this._dailyReportText());
        this._reportCopied = true;
        this._renderPanel();
        this._clearTimeout('_reportCopiedSource');
        this._reportCopiedSource = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
            this._reportCopiedSource = 0;
            this._reportCopied = false;
            if (this._activePage === 'tasks' && !this._taskAdding)
                this._renderPanel();
            return GLib.SOURCE_REMOVE;
        });
    }

    _openPage(key) {
        this._pinned = true;
        this._setExpanded(true);
        this._selectPage(key);
    }

    _checkAgendaNotices(now = new Date()) {
        if (!this._enabled || !this._preferences || !this._uiActorsAlive)
            return;
        const minutes = now.getHours() * 60 + now.getMinutes();
        const today = dateKey(now);
        const preferences = this._preferences;

        if (preferences.morningAgenda !== false && preferences.lastAgendaBriefing !== today
            && minutes >= AGENDA_BRIEFING_MINUTES && minutes < 12 * 60) {
            const agenda = this._agendaTasks(today);
            if (agenda.length) {
                const shown = this._showSystemNotice('agenda', {
                    title: `${agenda.length} ${agenda.length === 1 ? 'task' : 'tasks'} today`,
                    subtitle: agenda.slice(0, 2)
                        .map(task => `${Number.isInteger(task.due) ? `${formatClockTime(task.due)} ` : ''}${task.text}`)
                        .join(' · '),
                });
                if (!shown)
                    return;
            }
            preferences.lastAgendaBriefing = today;
            this._savePreferences();
        }

        if (preferences.eveningRecap === false || preferences.lastAgendaRecap === today
            || minutes < AGENDA_RECAP_MINUTES || minutes >= 21 * 60)
            return;
        const done = this._tasksDoneToday().length;
        const focusMinutes = Math.round(this._focusSecondsToday() / 60);
        if (done || focusMinutes) {
            const shown = this._showSystemNotice('recap', {
                title: 'Day recap',
                subtitle: `${done} ${done === 1 ? 'task' : 'tasks'} done · ${focusMinutes} min focus`,
            });
            if (!shown)
                return;
        }
        preferences.lastAgendaRecap = today;
        this._savePreferences();
    }

    _loadFocusLog() {
        try {
            const parsed = JSON.parse(this._readText(this._focusLogFile) || '{}');
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch (_error) {
            return {};
        }
    }

    _saveFocusLog() {
        try {
            GLib.mkdir_with_parents(this._taskDirectory, 0o755);
            return GLib.file_set_contents(this._focusLogFile,
                JSON.stringify(this._focusLog, null, 2));
        } catch (error) {
            logError(error, 'Perdana Island could not save the focus log');
            return false;
        }
    }

    _recordFocusSeconds(seconds) {
        const amount = Math.max(0, Math.round(Number(seconds) || 0));
        if (!amount)
            return;
        const today = dateKey();
        this._focusLog[today] = (Number(this._focusLog[today]) || 0) + amount;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 60);
        const oldest = dateKey(cutoff);
        for (const key of Object.keys(this._focusLog)) {
            if (key < oldest)
                delete this._focusLog[key];
        }
        this._saveFocusLog();
    }

    _removeTask(id) {
        this._tasks = this._tasks.filter(task => task.id !== id);
        this._saveTasks();
        this._renderPanel();
    }

    _loadTasks() {
        const tasks = this._readTasksFromFile(this._taskFile) ?? [];
        return tasks.map(task => ({
            ...task,
            done: Boolean(task.done),
            doneAt: typeof task.doneAt === 'string' ? task.doneAt : null,
            due: Number.isInteger(task.due) ? task.due : null,
            dueDate: typeof task.dueDate === 'string' ? task.dueDate : null,
            priority: TASK_PRIORITIES.includes(task.priority) ? task.priority : null,
        }));
    }

    _saveTasks() {
        const currentSaved = this._writeTasksToFile(this._taskFile, this._tasks);
        const legacySaved = this._writeTasksToFile(this._legacyTaskFile, this._tasks);
        return currentSaved && legacySaved;
    }

    _loadNotes() {
        try {
            const parsed = JSON.parse(this._readText(this._notesFile) || '[]');
            if (!Array.isArray(parsed))
                return [];
            return parsed
                .filter(note => note && typeof note.id === 'string' && typeof note.text === 'string')
                .map(note => ({
                    id: note.id,
                    text: note.text.slice(0, NOTE_MAX_CHARS),
                    updatedAt: Number.isFinite(note.updatedAt) ? note.updatedAt : Date.now(),
                }))
                .sort((first, second) => second.updatedAt - first.updatedAt)
                .slice(0, MAX_NOTES);
        } catch (_error) {
            return [];
        }
    }

    _saveNotes() {
        try {
            GLib.mkdir_with_parents(this._taskDirectory, 0o755);
            return GLib.file_set_contents(this._notesFile,
                JSON.stringify(this._notes, null, 2));
        } catch (error) {
            logError(error, 'Perdana Island could not save the notes');
            return false;
        }
    }

    _noteTitle(note) {
        const line = note.text.split('\n').map(item => item.trim()).find(item => item.length);
        if (!line)
            return 'Empty note';
        return line.length > 64 ? `${line.slice(0, 63)}…` : line;
    }

    _notePreview(note) {
        const lines = note.text.split('\n').map(item => item.trim()).filter(item => item.length);
        if (!lines.length)
            return 'No text yet';
        const rest = lines.slice(1).join(' ');
        if (!rest)
            return 'Single line';
        return rest.length > 80 ? `${rest.slice(0, 79)}…` : rest;
    }

    _noteDateText(updatedAt) {
        const date = new Date(Number(updatedAt) || Date.now());
        if (dateKey(date) === dateKey())
            return new Intl.DateTimeFormat('en-GB', {hour: '2-digit', minute: '2-digit'}).format(date);
        return new Intl.DateTimeFormat('en-GB', {day: '2-digit', month: 'short'}).format(date);
    }

    _noteWordCount(text) {
        const trimmed = String(text || '').trim();
        return trimmed ? trimmed.split(/\s+/).length : 0;
    }

    _notesStatusLine(state) {
        const note = this._notes.find(item => item.id === this._notesSelectedId);
        if (!note)
            return state;
        const words = this._noteWordCount(note.text);
        return `${state} · ${words} ${words === 1 ? 'word' : 'words'}`;
    }

    _setNotesStatus(state) {
        this._notesStatusValue = state;
        this._notesSaveLabel?.set_text(this._notesStatusLine(state));
    }

    _onNoteTextChanged(entry, id) {
        const note = this._notes.find(item => item.id === id);
        if (!note)
            return;
        const text = entry.get_text().slice(0, NOTE_MAX_CHARS);
        if (text === note.text)
            return;
        note.text = text;
        note.updatedAt = Date.now();
        const labels = this._notesRowLabels?.get(id);
        if (labels) {
            labels.title.set_text(this._noteTitle(note));
            labels.preview.set_text(this._notePreview(note));
            labels.date.set_text(this._noteDateText(note.updatedAt));
        }
        this._setNotesStatus('Saving…');
        this._clearTimeout('_notesSaveSource');
        this._notesSaveSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, NOTE_AUTOSAVE_MS, () => {
            this._notesSaveSource = 0;
            this._flushNotesSave();
            return GLib.SOURCE_REMOVE;
        });
        this._resizeNotesEditor();
        this._scheduleNotesResize();
        this._keepNotesCursorVisible();
    }

    _insertNoteLineBreak(entry, id) {
        // ClutterText binds Return to activate before it can insert a line
        // break, so a multiline entry needs the newline added here.
        const textActor = entry.clutter_text;
        const text = entry.get_text();
        let cursor = text.length;
        try {
            cursor = textActor.get_cursor_position();
        } catch (_error) {
            cursor = text.length;
        }
        if (cursor < 0)
            cursor = text.length;
        cursor = Math.max(0, Math.min(text.length, cursor));
        let selectionBound = cursor;
        try {
            selectionBound = textActor.get_selection_bound();
        } catch (_error) {
            selectionBound = cursor;
        }
        if (selectionBound < 0)
            selectionBound = cursor;
        selectionBound = Math.max(0, Math.min(text.length, selectionBound));
        const start = Math.min(cursor, selectionBound);
        const end = Math.max(cursor, selectionBound);
        const next = `${text.slice(0, start)}\n${text.slice(end)}`;
        entry.set_text(next.slice(0, NOTE_MAX_CHARS));
        const inserted = entry.get_text();
        try {
            textActor.set_cursor_position(Math.min(inserted.length, start + 1));
            textActor.set_selection_bound(Math.min(inserted.length, start + 1));
        } catch (_error) {
            // Cursor placement is best effort; the text is already inserted.
        }
        const note = this._notes.find(item => item.id === id);
        if (note) {
            note.text = inserted.slice(0, NOTE_MAX_CHARS);
            note.updatedAt = Date.now();
        }
        this._resizeNotesEditor();
        this._scheduleNotesResize();
        this._keepNotesCursorVisible();
    }

    _resizeNotesEditor() {
        const entry = this._notesEditorEntry;
        const box = this._notesEditorBox;
        if (!entry || !box)
            return;
        const width = Math.max(1, Math.round(this._notesEditorWidth || box.width || 0));
        // The entry reports a fixed preferred height once one is set, so drop
        // the explicit height before measuring the wrapped text again.
        entry.set_height(-1);
        const [, naturalHeight] = entry.get_preferred_height(width);
        const height = Math.max(108, Math.round(naturalHeight));
        entry.set_size(width, height);
        box.set_size(width, height);
    }

    _scheduleNotesResize() {
        this._clearTimeout('_notesResizeSource');
        this._notesResizeSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 60, () => {
            this._notesResizeSource = 0;
            this._resizeNotesEditor();
            return GLib.SOURCE_REMOVE;
        });
    }

    _flushNotesSave() {
        this._clearTimeout('_notesSaveSource');
        if (!this._notes || !this._notesFile)
            return;
        this._saveNotes();
        this._setNotesStatus('Saved locally');
    }

    _dropEmptyNotes() {
        if (!this._notes)
            return;
        const notes = this._notes.filter(note => note.text.trim() !== '');
        if (notes.length === this._notes.length)
            return;
        this._notes = notes;
        if (!this._notes.some(note => note.id === this._notesSelectedId))
            this._notesSelectedId = [...this._notes]
                .sort((first, second) => second.updatedAt - first.updatedAt)[0]?.id || null;
    }

    _leaveNotes() {
        this._dropEmptyNotes();
        this._flushNotesSave();
    }

    _selectNote(id) {
        if (id === this._notesSelectedId)
            return;
        this._dropEmptyNotes();
        this._flushNotesSave();
        if (!this._notes.some(note => note.id === id))
            return;
        this._notesSelectedId = id;
        this._renderPanel();
        this._focusNotesEditor();
    }

    _addNote() {
        this._dropEmptyNotes();
        this._flushNotesSave();
        const note = {
            id: `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
            text: '',
            updatedAt: Date.now(),
        };
        this._notes.push(note);
        this._notesSelectedId = note.id;
        this._renderPanel();
        this._focusNotesEditor();
    }

    _deleteNote(id) {
        this._flushNotesSave();
        const index = this._notes.findIndex(note => note.id === id);
        if (index < 0)
            return;
        const ordered = [...this._notes].sort((first, second) => second.updatedAt - first.updatedAt);
        const position = ordered.findIndex(note => note.id === id);
        const [note] = this._notes.splice(index, 1);
        const next = ordered[position + 1] || ordered[position - 1] || null;
        this._notesSelectedId = next && next.id !== id ? next.id : null;
        this._notesUndo = {note, index};
        this._saveNotes();
        this._startNotesUndoTimer();
        this._renderPanel();
    }

    _startNotesUndoTimer() {
        this._clearTimeout('_notesUndoSource');
        this._notesUndoSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, NOTE_UNDO_MS, () => {
            this._notesUndoSource = 0;
            this._notesUndo = null;
            this._notesUndoBanner?.hide();
            return GLib.SOURCE_REMOVE;
        });
    }

    _undoNoteDelete() {
        if (!this._notesUndo)
            return;
        this._clearTimeout('_notesUndoSource');
        this._notesUndoSource = 0;
        const {note, index} = this._notesUndo;
        this._notesUndo = null;
        this._notes.splice(Math.min(index, this._notes.length), 0, note);
        this._notesSelectedId = note.id;
        this._saveNotes();
        this._renderPanel();
        this._focusNotesEditor();
    }

    _focusNotesEditor() {
        this._clearTimeout('_notesFocusSource');
        this._notesFocusSource = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._notesFocusSource = 0;
            if (this._notesEditorEntry?.get_stage())
                this._notesEditorEntry.grab_key_focus();
            return GLib.SOURCE_REMOVE;
        });
    }

    _keepNotesCursorVisible() {
        const scroll = this._notesEditorScroll;
        const entry = this._notesEditorEntry;
        if (!scroll || !entry || !entry.clutter_text?.has_key_focus?.())
            return;
        const adjustment = scroll.get_vadjustment?.();
        if (!adjustment || adjustment.page_size <= 0)
            return;
        try {
            const rawPosition = entry.clutter_text.get_cursor_position();
            const position = rawPosition < 0 ? entry.get_text().length : rawPosition;
            const [_x, y, _line, lineHeight] = entry.clutter_text.position_to_coords(position);
            const top = adjustment.value;
            const bottom = top + adjustment.page_size;
            if (y + lineHeight > bottom)
                adjustment.value = Math.min(adjustment.upper - adjustment.page_size,
                    y + lineHeight - adjustment.page_size + 8);
            else if (y < top)
                adjustment.value = Math.max(0, y - 8);
        } catch (_error) {
            // Cursor coordinates are only needed when the text outgrows the box.
        }
    }

    _applyKeepAwake() {
        const generation = ++this._keepAwakeGeneration;
        this._releaseKeepAwake();
        if (this._preferences?.keepAwake !== true)
            return;
        try {
            Gio.DBus.session.call(
                'org.gnome.SessionManager',
                '/org/gnome/SessionManager',
                'org.gnome.SessionManager',
                'Inhibit',
                new GLib.Variant('(susu)', [
                    'perdana.island',
                    0,
                    'Perdana Island keeps the screen awake',
                    KEEP_AWAKE_FLAGS,
                ]),
                new GLib.VariantType('(u)'),
                Gio.DBusCallFlags.NONE,
                -1,
                null,
                (connection, result) => this._onKeepAwakeInhibited(connection, result, generation)
            );
        } catch (error) {
            logError(error, 'Perdana Island could not keep the screen awake');
        }
        this._refreshKeepAwakeStatus();
    }

    _onKeepAwakeInhibited(connection, result, generation) {
        let cookie = 0;
        try {
            [cookie] = connection.call_finish(result).deep_unpack();
        } catch (error) {
            logError(error, 'Perdana Island could not keep the screen awake');
        }
        if (!this._enabled || this._preferences?.keepAwake !== true
            || generation !== this._keepAwakeGeneration) {
            if (cookie)
                this._uninhibitSession(cookie);
            this._refreshKeepAwakeStatus();
            return;
        }
        this._keepAwakeCookie = cookie || 0;
        this._refreshKeepAwakeStatus();
    }

    _releaseKeepAwake() {
        const cookie = this._keepAwakeCookie;
        this._keepAwakeCookie = 0;
        if (cookie)
            this._uninhibitSession(cookie);
    }

    _uninhibitSession(cookie) {
        try {
            Gio.DBus.session.call(
                'org.gnome.SessionManager',
                '/org/gnome/SessionManager',
                'org.gnome.SessionManager',
                'Uninhibit',
                new GLib.Variant('(u)', [cookie]),
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null,
                null
            );
        } catch (error) {
            logError(error, 'Perdana Island could not release the sleep inhibitor');
        }
    }

    _keepAwakeStatusText() {
        if (this._preferences?.keepAwake !== true)
            return 'The screen can sleep normally';
        if (this._keepAwakeCookie)
            return 'Idle and suspend blocked';
        return 'Waiting for the session manager';
    }

    _refreshKeepAwakeStatus() {
        if (this._activePage === 'settings' && this._settingsSection === 'island'
            && this._pageViewport)
            this._renderPanel();
    }

    _loadPrayerCache() {
        try {
            const parsed = JSON.parse(this._readText(this._prayerCacheFile) || '{}');
            if (!parsed || typeof parsed !== 'object' || !parsed.times || typeof parsed.times !== 'object')
                return null;
            return parsed;
        } catch (_error) {
            return null;
        }
    }

    _savePrayerCache() {
        try {
            GLib.mkdir_with_parents(this._taskDirectory, 0o755);
            GLib.file_set_contents(this._prayerCacheFile, JSON.stringify(this._prayerCache, null, 2));
        } catch (error) {
            logError(error, 'Perdana Island could not save prayer times');
        }
    }

    _parsePrayerPayload(body, now = new Date()) {
        const payload = JSON.parse(body);
        const timings = payload?.data?.timings;
        if (!timings || typeof timings !== 'object')
            throw new Error('Prayer timings missing');
        const timezone = payload?.data?.meta?.timezone || null;
        let zone = null;
        if (timezone) {
            try {
                zone = GLib.TimeZone.new_identifier(timezone);
            } catch (_error) {
                zone = null;
            }
        }
        const local = GLib.TimeZone.new_local();
        const times = {};
        for (const name of PRAYER_NAMES) {
            const match = String(timings[name] || '').match(/^(\d{1,2}):(\d{2})/);
            if (!match)
                continue;
            const hours = Number(match[1]);
            const minutes = Number(match[2]);
            let value = hours * 60 + minutes;
            if (zone) {
                const date = GLib.DateTime.new(zone, now.getFullYear(), now.getMonth() + 1,
                    now.getDate(), hours, minutes, 0);
                if (date) {
                    const shifted = date.to_timezone(local);
                    value = shifted.get_hour() * 60 + shifted.get_minute();
                }
            }
            times[name] = value;
        }
        return times;
    }

    _prayerCacheValid() {
        const cache = this._prayerCache;
        if (!cache || cache.date !== dateKey())
            return false;
        const [city] = splitCity(this._preferences?.prayerCity);
        return cache.city === city
            && cache.method === this._preferences?.prayerMethod
            && PRAYER_NAMES.every(name => Number.isInteger(cache.times?.[name]));
    }

    _prayerTimesForToday() {
        return this._prayerCacheValid() ? this._prayerCache.times : null;
    }

    _fetchPrayerTimes() {
        if (this._prayerFetching)
            return;
        const [city, country] = splitCity(this._preferences?.prayerCity);
        if (!city) {
            this._prayerError = 'Set a city for prayer times';
            if (['settings', 'reminders'].includes(this._activePage))
                this._renderPanel();
            return;
        }
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const date = `${day}-${month}-${now.getFullYear()}`;
        const url = 'https://api.aladhan.com/v1/timingsByCity/'
            + `${date}?city=${encodeURIComponent(city)}`
            + `&country=${encodeURIComponent(country)}`
            + `&method=${this._preferences.prayerMethod}`;
        const message = Soup.Message.new('GET', url);
        if (!message) {
            this._prayerError = 'Could not load prayer times';
            return;
        }
        this._prayerFetching = true;
        this._prayerError = null;
        this._prayerSession ??= new Soup.Session();
        this._prayerSession.send_and_read_async(
            message,
            GLib.PRIORITY_DEFAULT,
            this._prayerCancellable,
            (session, result) => {
                this._prayerFetching = false;
                try {
                    const bytes = session.send_and_read_finish(result);
                    if (message.get_status() !== Soup.Status.OK)
                        throw new Error(`Prayer request failed with ${message.get_status()}`);
                    const times = this._parsePrayerPayload(new TextDecoder().decode(bytes.get_data()), now);
                    if (!PRAYER_NAMES.every(name => Number.isInteger(times[name])))
                        throw new Error('Prayer times incomplete');
                    this._prayerCache = {
                        date: dateKey(now),
                        city,
                        country,
                        method: this._preferences.prayerMethod,
                        times,
                    };
                    this._savePrayerCache();
                    this._prayerError = null;
                    this._prayerRetryAt = 0;
                } catch (error) {
                    this._prayerError = 'Could not load prayer times';
                    this._prayerRetryAt = Date.now() + 15 * 60 * 1000;
                    logError(error, 'Perdana Island could not fetch prayer times');
                }
                if (['settings', 'reminders'].includes(this._activePage))
                    this._renderPanel();
            }
        );
    }

    _ensurePrayerTimes() {
        if (!this._preferences?.prayerReminder || this._prayerFetching || this._prayerCacheValid())
            return;
        if (this._prayerRetryAt && Date.now() < this._prayerRetryAt)
            return;
        this._fetchPrayerTimes();
    }

    _prayerStatusText() {
        if (!this._preferences?.prayerReminder)
            return 'Prayer reminders are off';
        if (this._prayerFetching)
            return 'Loading prayer times...';
        if (this._prayerError)
            return this._prayerError;
        const times = this._prayerTimesForToday();
        if (!times)
            return 'No prayer times for today yet';
        const now = new Date();
        const minutes = now.getHours() * 60 + now.getMinutes();
        const next = PRAYER_NAMES
            .map(name => [name, times[name]])
            .find(([, value]) => value > minutes);
        return next ? `Next: ${next[0]} ${formatClockTime(next[1])}` : 'All prayers passed for today';
    }

    _checkReminders(now = new Date()) {
        if (!this._enabled || !this._preferences)
            return;
        const minutes = now.getHours() * 60 + now.getMinutes();
        const today = dateKey(now);

        if (this._preferences.waterReminder
            && minutes >= WATER_WINDOW_START && minutes < WATER_WINDOW_END) {
            const nowSeconds = Math.floor(now.getTime() / 1000);
            let lastReminder = Number(this._preferences.lastWaterReminderAt) || 0;
            if (!lastReminder) {
                this._preferences.lastWaterReminderAt = nowSeconds;
                this._savePreferences();
                lastReminder = nowSeconds;
            }
            if (nowSeconds - lastReminder >= WATER_REMINDER_SECONDS) {
                const shown = this._showSystemNotice('water', {
                    title: 'Drink water',
                    subtitle: 'Time for a glass of water',
                });
                if (shown) {
                    this._preferences.lastWaterReminderAt = nowSeconds;
                    this._savePreferences();
                }
            }
        }

        if (!this._preferences.prayerReminder)
            return;
        this._ensurePrayerTimes();
        const times = this._prayerTimesForToday();
        if (!times)
            return;
        for (const name of PRAYER_NAMES) {
            if (times[name] !== minutes)
                continue;
            const key = `${today}:${name}`;
            if (this._preferences.lastPrayerNotice === key)
                break;
            const shown = this._showSystemNotice('prayer', {
                title: `${name} ${formatClockTime(times[name])}`,
                subtitle: 'Prayer time',
            });
            if (shown) {
                this._preferences.lastPrayerNotice = key;
                this._savePreferences();
            }
            break;
        }
    }

    _clearTimeout(property) {
        if (this[property]) {
            GLib.source_remove(this[property]);
            this[property] = 0;
        }
    }
}
