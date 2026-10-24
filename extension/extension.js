import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gvc from 'gi://Gvc';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as VolumeStatus from 'resource:///org/gnome/shell/ui/status/volume.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const MPRIS_PREFIX = 'org.mpris.MediaPlayer2.';
const MPRIS_PATH = '/org/mpris/MediaPlayer2';
const MPRIS_PLAYER_IFACE = 'org.mpris.MediaPlayer2.Player';
const DEFAULT_FOCUS_SECONDS = 25 * 60;
const DEFAULT_BREAK_SECONDS = 5 * 60;
const MICROSECONDS_PER_SECOND = 1_000_000;
const LEGACY_DATA_DIRECTORY = 'pulo-island';
const COLLAPSED_WIDTH = 150;
const PLAYING_WIDTH = 236;
const COLLAPSED_HEIGHT = 38;
const CONTENT_WIDTH = 460;
const OPEN_HEIGHT = 256;
const HEADER_HEIGHT = 42;
const TABBAR_HEIGHT = 46;
const PAGE_HEIGHT = OPEN_HEIGHT - HEADER_HEIGHT - TABBAR_HEIGHT;
const PAGE_INSET = 28;
const MEDIA_ART_SIZE = 58;
const MEDIA_COPY_GAP = 22;
const MEDIA_COPY_RIGHT_INSET = 38;
const PAGES = [
    {key: 'media', label: 'Music', icon: 'audio-x-generic-symbolic'},
    {key: 'focus', label: 'Focus', icon: 'alarm-symbolic'},
    {key: 'shelf', label: 'Shelf', icon: 'folder-symbolic'},
    {key: 'tasks', label: 'To-do', icon: 'view-list-symbolic'},
    {key: 'clipboard', label: 'Clipboard', icon: 'edit-copy-symbolic'},
    {key: 'today', label: 'Today', icon: 'x-office-calendar-symbolic'},
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
        this._pageBody = null;
        this._outgoingPageBodies = new Set();
        this._tabSwitching = false;
        this._mediaPositionLabel = null;
        this._mediaDurationLabel = null;
        this._progressTrack = null;
        this._progressLine = null;
        this._progressFill = null;
        this._mediaEqualizer = null;
        this._pinned = false;
        this._activePage = 'media';
        this._clipboardItems = [];
        this._clipboardSuppressedValue = null;
        this._shelfItems = [];
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
        this._todaySource = 0;
        this._chargingSource = 0;
        this._noticeDismissSource = 0;
        this._blinkSource = 0;
        this._clipboardSource = 0;
        this._systemNoticeActive = false;
        this._systemNoticeType = null;
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
        this._shelfDirectory = GLib.build_filenamev([this._taskDirectory, 'shelf']);
        this._migrateLegacyData();
        this._tasks = this._loadTasks();
        this._shelfItems = this._loadShelfItems();
        this._shelfMonitor = this._monitorShelfDirectory();
        this._shelfRefreshSource = 0;
        this._playersLoaded = false;
        this._playersError = false;

        this._buildInterface();
        this._monitorSignal = Main.layoutManager.connect('monitors-changed', () => {
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
        this._chargingSource = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => {
            if (!this._enabled)
                return GLib.SOURCE_REMOVE;
            this._pollChargingState();
            return GLib.SOURCE_CONTINUE;
        });

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

    disable() {
        this._enabled = false;
        this._clearTimeout('_hoverOpenSource');
        this._clearTimeout('_hoverCloseSource');
        this._clearTimeout('_focusSource');
        this._clearTimeout('_focusNoticeSource');
        this._clearTimeout('_clockSource');
        this._clearTimeout('_mediaSource');
        this._clearTimeout('_todaySource');
        this._clearTimeout('_chargingSource');
        this._clearTimeout('_noticeDismissSource');
        this._clearTimeout('_blinkSource');
        this._clearTimeout('_clipboardSource');
        this._clearTimeout('_shelfRefreshSource');

        if (this._shelfMonitor) {
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

        if (this._stageSignal) {
            global.stage.disconnect(this._stageSignal);
            this._stageSignal = 0;
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
            this._root.disconnect(this._allocationSignal);
            Main.layoutManager.removeChrome(this._root);
            this._root.destroy();
            this._root = null;
        }
        this._pageBody = null;
        this._mediaPositionLabel = null;
        this._mediaDurationLabel = null;
        this._progressTrack = null;
        this._progressLine = null;
        this._progressFill = null;
        this._mediaEqualizer = null;

    }

    _buildInterface() {
        this._root = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            reactive: true,
            track_hover: true,
            can_focus: false,
            clip_to_allocation: true,
            style_class: 'perdana-island',
        });
        this._root.add_style_class_name('perdana-island--custom-shape');
        this._root.add_style_class_name('perdana-island--v12');
        if (this._reducedMotion)
            this._root.add_style_class_name('perdana-island--reduced-motion');
        Main.layoutManager.addChrome(this._root, {affectsStruts: false});
        this._surface = new St.DrawingArea();
        this._surface.connect('repaint', area => this._paintIslandShape(area));
        this._root.add_child(this._surface);

        this._content = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            reactive: false,
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

        this._compact = new St.BoxLayout({
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
            style_class: 'perdana-island__compact',
        });
        this._compactLeading = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            style_class: 'perdana-island__compact-leading',
        });
        this._compactArtwork = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            style_class: 'perdana-island__compact-artwork',
        });
        this._compactArtwork.set_position(0, 7);
        this._compactArtwork.set_size(24, 24);
        this._compactArtworkIcon = new St.Icon({
            icon_name: 'audio-x-generic-symbolic',
            style_class: 'perdana-island__compact-artwork-icon',
        });
        this._compactArtwork.add_child(this._compactArtworkIcon);
        this._compactLeading.add_child(this._compactArtwork);

        this._compactTrackTitle = makeLabel('', 'perdana-island__compact-track-title');
        this._compactTrackTitle.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this._compactTrackTitle.x_expand = true;
        this._compactTrackTitle.visible = false;

        this._compactCenter = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            x_expand: true,
            style_class: 'perdana-island__compact-center',
        });
        this._idleEyes = new St.BoxLayout({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'perdana-island__idle-eyes',
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
        this._equalizer = this._makeEqualizer();
        this._compact.add_child(this._compactLeading);
        this._compact.add_child(this._compactTrackTitle);
        this._compact.add_child(this._compactCenter);
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
        this._compactButton.set_child(this._compact);
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
        this._renderPanel();
        this._updateHeaderClock();
        this._updateCollapsedLabel();
        this._layoutIsland();
        this._scheduleBlink();
    }

    _layoutIsland() {
        if (!this._root || !this._content)
            return;
        const width = Math.max(1, this._root.width);
        const height = Math.max(1, this._root.height);
        this._surface.set_position(0, 0);
        this._surface.set_size(width, height);
        this._surface.queue_repaint();
        this._content.set_position(0, 0);
        this._content.set_size(width, height);
        if (this._compactButton) {
            this._compactButton.set_position(0, 0);
            this._compactButton.set_size(width, height);
        }
        if (this._compact) {
            this._compact.set_position(0, 0);
            this._compact.set_size(width, height);
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
        if (!this._panel || !this._pageViewport || !this._tabBar)
            return;
        const pageHeight = PAGE_HEIGHT;
        this._pageViewport.set_position(PAGE_INSET, 0);
        this._pageViewport.set_size(Math.max(1, width - 2 * PAGE_INSET), pageHeight);
        this._tabBar.set_position(0, pageHeight);
        this._tabBar.set_size(width, TABBAR_HEIGHT);
        if (this._pageBody)
            this._pageBody.set_size(this._pageWidth(), this._bodyHeight());
        this._layoutTabs(width);
    }

    _layoutCompactCenter() {
        if (!this._compactCenter || !this._idleEyes || !this._compactClockLabel)
            return;
        const width = Math.max(0, Math.round(this._compactCenter.width));
        const height = Math.max(0, Math.round(this._compactCenter.height));
        const eyesWidth = 34;
        const eyesHeight = 20;
        const clockWidth = 56;
        const clockHeight = 24;
        this._idleEyes.set_size(eyesWidth, eyesHeight);
        this._idleEyes.set_position(
            Math.round((width - eyesWidth) / 2),
            Math.round((height - eyesHeight) / 2)
        );
        this._compactClockLabel.set_size(clockWidth, clockHeight);
        this._compactClockLabel.set_position(
            Math.round((width - clockWidth) / 2),
            Math.round((height - clockHeight) / 2)
        );
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

    _paintIslandShape(area) {
        const [surfaceWidth, surfaceHeight] = area.get_surface_size();
        if (surfaceWidth <= 0 || surfaceHeight <= 0 || area.width <= 0 || area.height <= 0)
            return;
        const cr = area.get_context();
        cr.scale(surfaceWidth / area.width, surfaceHeight / area.height);
        const width = area.width;
        const height = area.height;
        const radius = Math.min(
            34,
            Math.max(1, 19 + (height - COLLAPSED_HEIGHT) * 15 / (OPEN_HEIGHT - COLLAPSED_HEIGHT)),
            height / 2,
            width / 2
        );
        cr.newPath();
        cr.moveTo(0, 0);
        cr.lineTo(width, 0);
        cr.lineTo(width, height - radius);
        cr.arc(width - radius, height - radius, radius, 0, Math.PI / 2);
        cr.lineTo(radius, height);
        cr.arc(radius, height - radius, radius, Math.PI / 2, Math.PI);
        cr.lineTo(0, 0);
        cr.closePath();
        cr.setSourceRGBA(0, 0, 0, 1);
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
        if (!this._root || !Main.layoutManager.primaryMonitor)
            return;

        const monitor = Main.layoutManager.primaryMonitor;
        const width = this._root.width || this._root.get_preferred_width(-1)[1];
        const x = Math.round(monitor.x + (monitor.width - width) / 2);
        if (this._root.x !== x || this._root.y !== monitor.y)
            this._root.set_position(x, monitor.y);
    }

    _collapsedWidth() {
        return this._focusSource || this._isPlaying() ? PLAYING_WIDTH : COLLAPSED_WIDTH;
    }

    _expandedWidth() {
        return CONTENT_WIDTH;
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

    _setExpanded(expanded) {
        if (!this._enabled || !this._root || !this._panel)
            return;
        if (this._expanded === expanded) {
            if (expanded && this._activePage === 'today')
                this._startTodayTicker();
            return;
        }

        this._expanded = expanded;
        this._closing = !expanded;
        if (expanded)
            this._resetRestingEyes();
        this._clearTimeout('_hoverOpenSource');
        this._clearTimeout('_hoverCloseSource');
        this._root.set_pivot_point(0.5, 0);
        this._panel.remove_all_transitions();
        this._header.remove_all_transitions();
        this._compactButton.remove_all_transitions();
        this._root.remove_all_transitions();

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
            this._root.set_size(this._collapsedWidth(), COLLAPSED_HEIGHT);
            this._layoutIsland();
            this._positionIsland();
            this._root.ease({
                width: this._expandedWidth(),
                height: this._expandedHeight(),
                duration: this._motionDuration(500),
                mode: this._reducedMotion ? Clutter.AnimationMode.LINEAR : Clutter.AnimationMode.EASE_OUT_CUBIC,
                onComplete: () => this._layoutIsland(),
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
            this._root.ease({
                width: this._collapsedWidth(),
                height: COLLAPSED_HEIGHT,
                duration: this._motionDuration(500),
                delay: 70,
                mode: this._reducedMotion ? Clutter.AnimationMode.LINEAR : Clutter.AnimationMode.EASE_IN_CUBIC,
                onComplete: () => {
                    if (this._expanded || !this._enabled || !this._root)
                        return;
                    this._header.hide();
                    this._header.opacity = 255;
                    this._panel.hide();
                    this._panel.opacity = 255;
                    this._compactButton.opacity = 255;
                    this._root.remove_style_class_name('perdana-island--expanded');
                    this._closing = false;
                    this._root.set_size(this._collapsedWidth(), COLLAPSED_HEIGHT);
                    this._layoutIsland();
                    this._positionIsland();
                    if (!this._isPlaying() && !this._focusSource)
                        this._scheduleBlink();
                },
            });
        }
        this._positionIsland();
    }

    _updateClockLabel() {
        this._updateHeaderClock();
    }

    _updateHeaderClock() {
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
        if (this._activePage === key)
            return;
        const previousIndex = PAGES.findIndex(page => page.key === this._activePage);
        const nextIndex = PAGES.findIndex(page => page.key === key);
        this._previousPageIndex = previousIndex;
        const forward = (nextIndex - previousIndex + PAGES.length) % PAGES.length;
        const backward = (previousIndex - nextIndex + PAGES.length) % PAGES.length;
        const direction = forward <= backward ? 1 : -1;
        this._activePage = key;
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
        return PAGE_HEIGHT;
    }

    _bodyHeight() {
        return this._pageHeight();
    }

    _stepPage(delta) {
        const index = PAGES.findIndex(page => page.key === this._activePage);
        const nextIndex = (index + delta + PAGES.length) % PAGES.length;
        this._selectPage(PAGES[nextIndex].key);
    }

    _isPlaying() {
        const player = this._getSelectedPlayer();
        return Boolean(player && this._getProperty(player.proxy, 'PlaybackStatus') === 'Playing');
    }

    _trackRestingEyes(event) {
        if (!this._idleEyes?.visible || this._isPlaying() || this._expanded || this._closing)
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
        if (!this._idleEyes)
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
        if (!this._enabled)
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
        if (!this._enabled || this._reducedMotion || this._expanded || this._root?.hover
            || this._isPlaying() || this._focusSource)
            return;
        const delay = 2500 + Math.floor(Math.random() * 3500);
        this._blinkSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._blinkSource = 0;
            if (!this._enabled || this._reducedMotion || this._expanded || this._root?.hover
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
            const contents = new St.BoxLayout({style_class: 'perdana-island__tab-content'});
            const icon = new St.Icon({
                icon_name: page.icon,
                style_class: 'perdana-island__tab-icon',
            });
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
            this._tabBar.add_child(button);
            this._pageButtons.set(page.key, {button, icon, label, selected: undefined});
        }
        this._layoutTabs(this._expandedWidth());
    }

    _layoutTabs(width) {
        if (!this._pageButtons)
            return;
        const inactiveWidth = 32;
        const buttonHeight = 30;
        const inset = 8;
        const gap = 4;
        const widths = PAGES.map(page => {
            const entry = this._pageButtons.get(page.key);
            if (page.key !== this._activePage || !entry)
                return inactiveWidth;
            const naturalWidth = entry.label.get_preferred_width(-1)[1];
            const labelWidth = Math.ceil(Math.max(naturalWidth, page.label.length * 7));
            return labelWidth + 18 + 6 + inset * 2;
        });
        const totalWidth = widths.reduce((total, item) => total + item, 0) + gap * (PAGES.length - 1);
        let x = Math.round((width - totalWidth) / 2);
        for (const [index, page] of PAGES.entries()) {
            const entry = this._pageButtons.get(page.key);
            if (!entry)
                continue;
            const active = page.key === this._activePage;
            const buttonWidth = widths[index];
            entry.button.set_position(x, Math.round((TABBAR_HEIGHT - buttonHeight) / 2));
            entry.button.set_size(buttonWidth, buttonHeight);
            entry.button.accessible_name = active ? `${page.label}, selected` : page.label;
            if (entry.selected !== active) {
                entry.selected = active;
                if (active)
                    entry.button.add_style_class_name('perdana-button--nav-active');
                else
                    entry.button.remove_style_class_name('perdana-button--nav-active');
                entry.label.visible = active;
            }
            entry.label.set_opacity(active ? 255 : 0);
            x += buttonWidth + gap;
        }
    }

    _renderPanel(animate = false, direction = 1) {
        if (!this._pageViewport)
            return;

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
        const previous = this._pageBody;
        const body = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            style_class: 'perdana-island__page',
        });
        body.set_position(0, 0);
        body.set_size(this._pageWidth(), this._bodyHeight());
        if (this._activePage === 'media')
            this._renderMediaPage(body);
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
            Boolean(this._expanded && this._activePage === 'media' && this._isPlaying())
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

        this._progressTrack = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            reactive: true,
            track_hover: true,
            style_class: 'perdana-island__progress-hitarea',
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
        const progressWidth = this._pageWidth() - 96;
        this._progressLine.set_size(progressWidth, 4);
        this._progressTrack.connect('notify::allocation', () => {
            this._progressLine.set_size(this._progressTrack.width, 4);
            this._updateMediaProgress();
        });
        this._progressTrack.connect('button-press-event', (_actor, event) => {
            const [pointerX] = event.get_coords();
            const [trackX] = this._progressTrack.get_transformed_position();
            const ratio = Math.max(0, Math.min(1, (pointerX - trackX) / Math.max(1, this._progressTrack.width)));
            const current = this._getSelectedPlayer();
            if (current) {
                const currentMetadata = this._getMetadata(current.proxy);
                if (currentMetadata.trackId && currentMetadata.length > 0) {
                    current.proxy.call(
                        'SetPosition',
                        new GLib.Variant('(ox)', [currentMetadata.trackId, Math.round(currentMetadata.length * ratio)]),
                        Gio.DBusCallFlags.NONE,
                        3000,
                        null,
                        (_proxy, result) => {
                            try {
                                current.proxy.call_finish(result);
                            } catch (_error) {
                                this._updateMediaProgress();
                            }
                        }
                    );
                }
            }
            return Clutter.EVENT_STOP;
        });
        place(body, this._progressTrack, 48, 91, progressWidth, 14);

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
        const dial = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            style_class: 'perdana-island__focus-dial',
        });
        this._focusRing = new St.DrawingArea({style_class: 'perdana-island__focus-ring'});
        this._focusRing.connect('repaint', area => this._paintFocusRing(area));
        this._focusRing.set_size(96, 96);
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
        place(body, dial, 0, 35, 96, 96);

        const modes = new St.BoxLayout({style_class: 'perdana-island__focus-segments'});
        const modeOptions = [
            {label: 'Focus', duration: DEFAULT_FOCUS_SECONDS, mode: 'focus'},
            {label: 'Short', duration: DEFAULT_BREAK_SECONDS, mode: 'short'},
            {label: 'Long', duration: 15 * 60, mode: 'long'},
            {label: 'Custom', duration: this._focusCustomDuration, mode: 'custom'},
        ];
        for (const option of modeOptions) {
            const active = this._focusMode === option.mode;
            modes.add_child(makeTextButton(
                option.label,
                option.label + ' timer',
                () => this._setFocusDuration(option.duration, option.mode),
                'perdana-button--segment' + (active ? ' perdana-button--segment-active' : '')
            ));
        }
        place(body, modes, 120, 28, 278, 30);

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
        place(body, this._focusCustomEntry, 120, 65, 68, 30);
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
        place(body, this._focusCustomUnitButton, 195, 65, 90, 30);
        place(body, makeTextButton(
            'Apply',
            'Apply custom focus duration',
            () => this._applyCustomFocusDuration(),
            'perdana-button--focus-apply'
        ), 292, 65, 58, 30);

        const controls = new St.BoxLayout({style_class: 'perdana-island__focus-controls'});
        this._focusToggleButton = makeActionButton(
            this._focusSource ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic',
            this._focusSource ? 'Pause' : this._focusWasStarted ? 'Resume' : 'Start',
            this._focusSource ? 'Pause focus session' : 'Start focus session',
            () => this._toggleFocus(),
            'perdana-action--primary'
        );
        controls.add_child(this._focusToggleButton);
        controls.add_child(makeActionButton(
            'view-refresh-symbolic',
            'Reset',
            'Reset timer',
            () => this._resetFocus(),
            'perdana-action--neutral'
        ));
        controls.add_child(makeActionButton(
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
        ));
        place(body, controls, 120, 103, 278, 34);
        this._focusSessionsLabel = makeLabel(
            this._focusSessionsToday + ' focus sessions today',
            'perdana-island__focus-stats-label'
        );
        place(body, this._focusSessionsLabel, 120, 144, 278, 20);
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
            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
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

        ordered.slice(0, 3).forEach((task, index) => {
            const y = 8 + index * 43;
            const row = new St.BoxLayout({style_class: task.done
                ? 'perdana-island__task-row perdana-island__task-row--done'
                : 'perdana-island__task-row'});
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
            label.clutter_text.max_width = rightWidth - 56;
            label.x_expand = true;
            row.add_child(label);
            if (this._taskEditing)
                row.add_child(makeIconButton('user-trash-symbolic', 'Delete ' + task.text, () => this._removeTask(task.id), 'perdana-button--task-delete'));
            place(body, row, rightX, y, rightWidth, 36);
        });
        if (!ordered.length)
            place(body, makeLabel('Your list is clear', 'perdana-island__muted'), rightX, 16, rightWidth, 20);
    }

    _renderInfoPage(body, key) {
        if (key === 'shelf')
            this._renderShelfPage(body);
        else if (key === 'clipboard')
            this._renderClipboardPage(body);
        else if (key === 'today')
            this._renderTodayPage(body);
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
        const drop = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            style_class: 'perdana-island__shelf-card',
        });
        const dropTitle = makeLabel(
            this._shelfItems.length ? this._shelfItems.length + ' files' : 'Shelf',
            'perdana-island__shelf-title'
        );
        place(drop, dropTitle, 12, 12, 230, 22);
        const addButton = makeTextButton('Add files', 'Add files to Shelf', () => this._chooseShelfFiles(), 'perdana-button--segment');
        place(drop, addButton, 286, 8, 102, 30);
        const folderButton = makeIconButton('folder-open-symbolic', 'Open Shelf folder', () => this._openShelfDirectory(), 'perdana-button--shelf-folder');
        place(drop, folderButton, 252, 8, 30, 30);
        const visibleFiles = this._shelfItems.slice(0, 3);
        visibleFiles.forEach((file, index) => {
            const chip = makeTextButton(
                file.name,
                'Open ' + file.name,
                () => this._openShelfFile(file),
                'perdana-button--file'
            );
            place(drop, chip, 10, 48 + index * 27, 384, 24);
        });
        if (!visibleFiles.length)
            place(drop, makeLabel('Open the Shelf folder, then drop files there', 'perdana-island__muted'), 12, 52, 370, 24);
        place(body, drop, 0, 14, this._pageWidth(), 134);
    }

    _renderClipboardPage(body) {
        place(body, makeLabel('Clipboard', 'perdana-island__todo-heading'), 0, 5, 240, 22);
        place(body, makeLabel('Recent copies', 'perdana-island__muted'), 290, 7, 114, 20);
        if (!this._clipboardItems.length) {
            place(body, makeLabel('Copy text while this page is open', 'perdana-island__empty-media'), 0, 66, this._pageWidth(), 24);
            return;
        }
        this._clipboardItems.slice(0, 3).forEach((item, index) => {
            const row = new St.BoxLayout({style_class: 'perdana-island__clip-row'});
            const contents = new St.BoxLayout({style_class: 'perdana-island__clip-contents'});
            contents.add_child(new St.Icon({icon_name: 'edit-copy-symbolic', style_class: 'perdana-island__icon'}));
            const label = makeLabel(item, 'perdana-island__clip-text');
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
                accessible_name: 'Copy text again',
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
            place(body, row, 0, 35 + index * 37, this._pageWidth(), 32);
        });
    }

    _renderTodayPage(body) {
        const now = new Date();
        const weekday = new Intl.DateTimeFormat('en-US', {weekday: 'long'}).format(now);
        const monthName = new Intl.DateTimeFormat('en-US', {month: 'short', year: 'numeric'}).format(now);
        place(body, makeLabel(weekday, 'perdana-island__today-weekday'), 0, 22, 116, 18);
        place(body, makeLabel(String(now.getDate()), 'perdana-island__today-day'), 0, 40, 116, 58);
        place(body, makeLabel(monthName, 'perdana-island__today-month'), 0, 100, 116, 20);

        const tileX = 126;
        const gap = 8;
        const tileWidth = (this._pageWidth() - tileX - gap) / 2;
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
            const y = 7 + row * (tileHeight + gap);
            const tile = new St.Widget({
                layout_manager: new Clutter.FixedLayout(),
                style_class: 'perdana-island__today-tile',
            });
            const ring = this._makeProgressRing(34, 0, metric.color);
            const value = makeLabel('—', 'perdana-island__today-value');
            const title = makeLabel(metric.title, 'perdana-island__today-title');
            const detail = makeLabel('', 'perdana-island__today-detail');
            place(tile, ring, 10, 17, 34, 34);
            place(tile, title, 52, 9, tileWidth - 58, 16);
            place(tile, value, 52, 25, tileWidth - 58, 22);
            place(tile, detail, 52, 48, tileWidth - 58, 16);
            this._todayTiles.push({key: metric.key, ring, value, detail});
            place(body, tile, x, y, tileWidth, tileHeight);
        });
        this._updateTodayMetrics();
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
        const color = this._focusMode === 'short' || this._focusMode === 'long'
            ? [0.188, 0.82, 0.345]
            : [1, 0.624, 0.039];
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
                    if (this._expanded && this._activePage === 'media')
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
                    this._updateCollapsedLabel();
                    if (this._expanded && this._activePage === 'media'
                        && (metadataChanged || playbackChanged))
                        this._renderPanel();
                    else if (this._expanded && this._activePage === 'media')
                        this._updateMediaProgress();
                });
                entry.seekedSignalId = proxy.connect('g-signal', (_proxy, _sender, signalName, parameters) => {
                    if (signalName !== 'Seeked')
                        return;
                    entry.positionBase = Number(parameters.deep_unpack()[0]) || 0;
                    entry.positionStamp = GLib.get_monotonic_time();
                    if (this._expanded && this._activePage === 'media')
                        this._updateMediaProgress();
                });
                this._players.set(name, entry);
            } catch (_error) {
                // A player can disappear between ListNames and proxy creation.
            }
        }

        this._updateMediaTicker();
        this._updateCollapsedLabel();
        if (this._expanded && this._activePage === 'media')
            this._renderPanel();
    }

    _updateMediaTicker() {
        const player = this._getSelectedPlayer();
        const playing = player
            && this._getProperty(player.proxy, 'PlaybackStatus') === 'Playing';
        if (playing && !this._mediaSource) {
            this._mediaSource = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
                if (!this._enabled)
                    return GLib.SOURCE_REMOVE;
                this._updateMediaProgress();
                this._updateCollapsedLabel();
                return GLib.SOURCE_CONTINUE;
            });
        } else if (!playing) {
            this._clearTimeout('_mediaSource');
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
        const artist = Array.isArray(rawArtist) ? rawArtist.join(', ') : rawArtist;
        return {
            title: typeof title === 'string' ? title : '',
            artist: typeof artist === 'string' ? artist : '',
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

    _positionForPlayer(player) {
        const isPlaying = this._getProperty(player.proxy, 'PlaybackStatus') === 'Playing';
        const current = player.positionBase + (isPlaying
            ? Math.max(0, GLib.get_monotonic_time() - player.positionStamp)
            : 0);
        return Math.max(0, current / MICROSECONDS_PER_SECOND);
    }

    _updateMediaProgress() {
        if (!this._expanded || this._activePage !== 'media'
            || !this._mediaPositionLabel || !this._mediaDurationLabel || !this._progressFill
            || !this._progressLine || !this._progressTrack)
            return;
        const player = this._getSelectedPlayer();
        if (!player)
            return;
        const metadata = this._getMetadata(player.proxy);
        const duration = metadata.length / MICROSECONDS_PER_SECOND;
        const position = Math.min(duration || Infinity, this._positionForPlayer(player));
        this._mediaPositionLabel.text = formatTime(position);
        this._mediaDurationLabel.text = formatTime(duration);
        const ratio = duration > 0 ? Math.min(1, position / duration) : 0;
        this._progressFill.width = Math.max(1, this._progressLine.width * ratio);
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

    _updateCollapsedLabel() {
        if (!this._compact || this._systemNoticeActive)
            return;
        const player = this._getSelectedPlayer();
        const playing = player && this._getProperty(player.proxy, 'PlaybackStatus') === 'Playing';
        const focusRunning = Boolean(this._focusSource);
        const showMedia = Boolean(playing && !focusRunning);
        const showClock = Boolean(!playing && !focusRunning && !this._expanded && !this._closing && this._root?.hover);
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
        const compactState = focusRunning ? 'focus' : showMedia ? 'playing' : showClock ? 'hover' : 'idle';
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
                    opacity: showClock ? 0 : 255,
                    scale_x: showClock ? 0.72 : 1,
                    scale_y: showClock ? 0.72 : 1,
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
            if (this._compactTrackTitle.text !== title)
                this._compactTrackTitle.text = title;
            this._compactArtworkIcon.gicon = this._localArtIcon(metadata.artUrl)
                || Gio.ThemedIcon.new('audio-x-generic-symbolic');
        } else {
            this._compactTrackTitle.text = '';
        }
        this._updateHeaderClock();
        if (!this._expanded && !this._closing) {
            const targetWidth = focusRunning || playing ? PLAYING_WIDTH : COLLAPSED_WIDTH;
            if (Math.round(this._root.width) !== targetWidth) {
                this._root.remove_all_transitions();
                this._root.ease({
                    width: targetWidth,
                    height: COLLAPSED_HEIGHT,
                    duration: this._motionDuration(500),
                    mode: this._reducedMotion ? Clutter.AnimationMode.LINEAR : Clutter.AnimationMode.EASE_OUT_CUBIC,
                    onComplete: () => {
                        this._layoutIsland();
                        if (showMedia && this._compactTrackTitle.visible) {
                            this._compactTrackTitle.ease({
                                opacity: 255,
                                duration: this._motionDuration(140),
                                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                            });
                        }
                    },
                });
            } else if (showMedia && this._compactTrackTitle.visible
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
        const legacyTasks = Gio.File.new_for_path(
            GLib.build_filenamev([legacyDirectory, 'tasks.json'])
        );
        const currentTasks = Gio.File.new_for_path(this._taskFile);

        try {
            if (legacyTasks.query_exists(null) && !currentTasks.query_exists(null)) {
                GLib.mkdir_with_parents(this._taskDirectory, 0o755);
                legacyTasks.copy(currentTasks, Gio.FileCopyFlags.NONE, null, null);
            }
        } catch (error) {
            logError(error, 'Perdana Island could not migrate its task list');
        }

        this._copyLegacyShelf(
            Gio.File.new_for_path(GLib.build_filenamev([legacyDirectory, 'shelf'])),
            Gio.File.new_for_path(this._shelfDirectory)
        );
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
            if (mimeTypes.some(type => /password|secret|sensitive/i.test(type)))
                return;
            this._clipboardInFlight = true;
            clipboard.get_text(St.ClipboardType.CLIPBOARD, (_clipboard, text) => {
                this._clipboardInFlight = false;
                if (!this._enabled || !this._expanded || this._activePage !== 'clipboard')
                    return;
                const value = String(text || '').trim().slice(0, 1200);
                if (this._clipboardSuppressedValue !== null) {
                    if (value === this._clipboardSuppressedValue)
                        return;
                    this._clipboardSuppressedValue = null;
                }
                if (!value || value === this._clipboardItems[0])
                    return;
                this._clipboardItems.unshift(value);
                this._clipboardItems = this._clipboardItems.slice(0, 4);
                this._renderPanel();
            });
        } catch (_error) {
            this._clipboardInFlight = false;
        }
    }

    _deleteClipboardItem(item) {
        this._clipboardItems = this._clipboardItems.filter(value => value !== item);
        this._clipboardSuppressedValue = item;
        this._renderPanel();
    }

    _loadShelfItems() {
        try {
            GLib.mkdir_with_parents(this._shelfDirectory, 0o755);
            const directory = Gio.File.new_for_path(this._shelfDirectory)
                .enumerate_children('standard::name,standard::type', Gio.FileQueryInfoFlags.NONE, null);
            const items = [];
            let entry;
            while ((entry = directory.next_file(null)) !== null) {
                if (entry.get_file_type() !== Gio.FileType.REGULAR)
                    continue;
                items.push({
                    name: entry.get_name(),
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
            monitor.connect('changed', () => {
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
                            for (const uri of uris)
                                this._copyShelfFile(Gio.File.new_for_uri(uri));
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
                } else if (['Mains', 'USB', 'USB_C'].includes(type)) {
                    chargerConnected ||= this._readText(`${base}/online`).trim() === '1';
                }
            }
            directory.close(null);
        } catch (_error) {
            // Power supply details are optional on desktops and unsupported devices.
        }
        if (battery?.status === 'Charging')
            chargerConnected = true;
        return battery ? {...battery, connected: chargerConnected} : null;
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
    }

    _showChargingNotice(percent) {
        this._showSystemNotice('charging', {percent});
    }

    _showChargerDisconnectedNotice(percent) {
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
        if (!this._enabled || !this._root || this._expanded)
            return;
        const sameNotice = this._systemNoticeActive && this._systemNoticeType === type;
        this._clearTimeout('_noticeDismissSource');
        this._systemNoticeActive = true;
        this._systemNoticeType = type;

        const duration = type === 'volume' ? 2 : type === 'focus' ? 4 : 3;
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
                });
                this._noticeBanner.set_position(0, 0);
                this._noticeBanner.set_size(394, 76);
                this._noticeBanner.opacity = 0;

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
                    this._noticeVolumeIcon = new St.Icon({style_class: 'perdana-island__notice-icon'});
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

                this._noticeRight = new St.BoxLayout({
                    vertical: true,
                    y_align: Clutter.ActorAlign.CENTER,
                    style_class: 'perdana-island__notice-right',
                });
                this._noticePercent = makeLabel('', 'perdana-island__notice-percent');
                this._noticePercent.set_size(type === 'volume' ? 84 : 72, 36);
                this._noticeRight.add_child(this._noticePercent);

                this._noticeVolumeTrack = null;
                this._noticeVolumeFill = null;
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
                height: COLLAPSED_HEIGHT,
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
            this._root.set_size(this._collapsedWidth(), COLLAPSED_HEIGHT);
            this._layoutIsland();
            this._updateCollapsedLabel();
        }
    }

    _updateTodayMetrics() {
        if (!this._todayTiles?.length)
            return;

        const cpuLine = this._readText('/proc/stat').split('\n').find(line => /^cpu\s/.test(line));
        if (cpuLine) {
            const ticks = cpuLine.trim().split(/\s+/).slice(1).map(Number);
            const total = ticks.reduce((sum, value) => sum + value, 0);
            const idle = (ticks[3] || 0) + (ticks[4] || 0);
            if (this._cpuTicks) {
                const totalDelta = total - this._cpuTicks.total;
                const idleDelta = idle - this._cpuTicks.idle;
                if (totalDelta > 0)
                    this._cpuPercent = Math.round(100 * (1 - idleDelta / totalDelta));
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

        let battery = null;
        try {
            const directory = Gio.File.new_for_path('/sys/class/power_supply')
                .enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
            let entry;
            while ((entry = directory.next_file(null)) !== null) {
                const name = entry.get_name();
                if (!/^BAT/i.test(name))
                    continue;
                const base = `/sys/class/power_supply/${name}`;
                const capacity = Number(this._readText(`${base}/capacity`).trim());
                if (!Number.isFinite(capacity))
                    continue;
                battery = {
                    percent: Math.max(0, Math.min(100, capacity)),
                    status: this._readText(`${base}/status`).trim(),
                };
                break;
            }
            directory.close(null);
        } catch (_error) {
            // Battery details are optional on desktops and unsupported devices.
        }

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
                ? {value: `${battery.percent}%`, detail: battery.status || 'Battery', progress: battery.percent / 100}
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
        try {
            const [success, contents] = GLib.file_get_contents(this._taskFile);
            if (!success)
                return [];
            const data = JSON.parse(new TextDecoder().decode(contents));
            if (!Array.isArray(data))
                return [];
            return data.filter(task => task
                && typeof task.id === 'string'
                && typeof task.text === 'string'
                && typeof task.done === 'boolean');
        } catch (_error) {
            return [];
        }
    }

    _saveTasks() {
        try {
            GLib.mkdir_with_parents(this._taskDirectory, 0o755);
            GLib.file_set_contents(this._taskFile, JSON.stringify(this._tasks));
        } catch (error) {
            logError(error, 'Perdana Island could not save its local task list');
        }
    }

    _clearTimeout(property) {
        if (this[property]) {
            GLib.source_remove(this[property]);
            this[property] = 0;
        }
    }
}
