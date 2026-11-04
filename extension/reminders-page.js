import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {formatClockTime} from './island-domain.js';
import {waterTabLabel as formatWaterTabLabel} from './reminder-domain.js';
import {attachButtonMotion, makeLabel, makeTextButton, place} from './ui-controls.js';

export function renderRemindersPage(body, {
    pageWidth,
    tab,
    prayerEnabled = false,
    prayerNames = [],
    water,
    onSelectTab,
    onRefresh,
    onLogWater,
} = {}) {
    const activeTab = tab === 'water' ? 'water' : 'prayer';
    // Keep the two sections on one compact, stable panel like island-pages-v2.
    const tabBar = new St.BoxLayout({style_class: 'perdana-island__rem-tabs'});
    const tabStyle = key =>
        `perdana-island__rem-tab${activeTab === key ? ' perdana-island__rem-tab--on' : ''}`;
    const prayerTab = makeTextButton('Prayer', 'Prayer times', () => {
        onSelectTab?.('prayer');
    }, tabStyle('prayer'));
    const waterTabLabel = makeLabel(formatWaterTabLabel(water.value),
        'perdana-island__rem-tab-label');
    const waterTab = new St.Button({
        child: waterTabLabel,
        can_focus: true,
        reactive: true,
        track_hover: true,
        style_class: `perdana-button ${tabStyle('water')}`,
        accessible_name: 'Water reminder',
    });
    waterTab.connect('clicked', () => onSelectTab?.('water'));
    attachButtonMotion(waterTab);
    prayerTab.set_size(62, 22);
    waterTab.set_size(98, 22);
    tabBar.add_child(prayerTab);
    tabBar.add_child(waterTab);
    place(body, tabBar, 0, 6, 170, 28);

    const refreshButton = makeTextButton('Refresh', 'Fetch prayer times again', () => {
        onRefresh?.();
    }, 'perdana-island__reminder-action');
    refreshButton.visible = activeTab === 'prayer' && prayerEnabled;
    place(body, refreshButton, pageWidth - 78, 7, 78, 26);

    const refs = {
        rows: [],
        nextCaption: null,
        nextName: null,
        nextTime: null,
        nextIn: null,
        cityLabel: null,
        waterTabLabel,
        refreshButton,
        waterCaption: null,
        waterValue: null,
        waterDetail: null,
        waterFill: null,
        waterTrackWidth: 0,
    };

    if (activeTab === 'prayer') {
        const nextCard = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            style_class: 'perdana-island__reminder-next',
        });
        place(body, nextCard, 0, 40, pageWidth, 64);
        refs.nextCaption = makeLabel('', 'perdana-island__reminder-caption');
        refs.nextCaption.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        refs.nextName = makeLabel('—', 'perdana-island__reminder-next-name');
        refs.nextTime = makeLabel('—', 'perdana-island__reminder-next-time');
        refs.nextIn = makeLabel('', 'perdana-island__reminder-next-in');
        place(nextCard, refs.nextCaption, 14, 9, pageWidth - 176, 15);
        place(nextCard, refs.nextName, 14, 26, pageWidth - 176, 22);
        place(nextCard, refs.nextTime, pageWidth - 156, 9, 142, 22);
        place(nextCard, refs.nextIn, pageWidth - 156, 32, 142, 16);

        const stripTop = 112;
        const stripInset = 0;
        const gap = 4;
        const stripWidth = Math.max(1, pageWidth - stripInset * 2);
        const cellWidth = (stripWidth - gap * (prayerNames.length - 1)) / prayerNames.length;
        prayerNames.forEach((name, index) => {
            const cell = new St.Widget({
                layout_manager: new Clutter.FixedLayout(),
                style_class: 'perdana-island__prayer-cell',
            });
            const nameLabel = makeLabel(name, 'perdana-island__prayer-name');
            const timeLabel = makeLabel('—', 'perdana-island__prayer-time');
            nameLabel.clutter_text.x_align = Clutter.ActorAlign.CENTER;
            timeLabel.clutter_text.x_align = Clutter.ActorAlign.CENTER;
            place(cell, nameLabel, 2, 7, cellWidth - 4, 13);
            place(cell, timeLabel, 2, 23, cellWidth - 4, 15);
            place(body, cell, stripInset + index * (cellWidth + gap), stripTop, cellWidth, 46);
            refs.rows.push({name, cell, nameLabel, timeLabel});
        });
    } else {
        const card = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            style_class: 'perdana-island__reminder-card',
        });
        place(body, card, 0, 40, pageWidth, 122);
        refs.waterCaption = place(card, makeLabel(water.caption,
            'perdana-island__reminder-caption'), 14, 9, pageWidth - 28, 15);
        refs.waterValue = place(card, makeLabel(water.value,
            'perdana-island__water-value'), 14, 26, pageWidth - 28, 34);
        refs.waterTrackWidth = Math.max(1, pageWidth - 28);
        const track = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            clip_to_allocation: true,
            style_class: 'perdana-island__water-track',
        });
        place(card, track, 14, 62, refs.waterTrackWidth, 4);
        refs.waterFill = new St.Widget({style_class: 'perdana-island__water-fill'});
        place(track, refs.waterFill, 0, 0,
            Math.round(refs.waterTrackWidth * water.progress), 4);
        refs.waterDetail = place(card, makeLabel(water.detail,
            'perdana-island__reminder-subtitle'), 120, 72, pageWidth - 134, 14);
        place(card, makeTextButton('Log glass', 'Log a glass of water', () => {
            onLogWater?.();
        }, 'perdana-island__water-log'), 14, 72, 96, 30);
        place(card, makeLabel('Every hour · 08:00–21:00',
            'perdana-island__reminder-caption perdana-island__water-window'),
            120, 88, pageWidth - 134, 14);
    }

    return refs;
}

export function updateRemindersView(refs, {
    now = new Date(),
    times,
    upcoming,
    city,
    methodLabel = 'Kemenag',
    subtitle = '',
    water,
} = {}) {
    if (!refs)
        return;
    const minutes = now.getHours() * 60 + now.getMinutes();
    const upcomingPrayer = upcoming ?? {name: null, minutesUntil: 0, tomorrow: false};
    const nextToday = times && !upcomingPrayer.tomorrow ? upcomingPrayer.name : null;
    const next = upcomingPrayer.name;
    const minutesUntilNext = upcomingPrayer.minutesUntil;
    const nextIsTomorrow = upcomingPrayer.tomorrow;

    if (refs.nextCaption) {
        refs.nextCaption.text = times
            ? `Next prayer · ${city || 'No city'} · ${methodLabel}`
            : subtitle;
    }
    if (refs.cityLabel)
        refs.cityLabel.text = times ? `${city || 'No city'} · ${methodLabel}` : '';
    if (refs.nextName)
        refs.nextName.text = next || '—';
    if (refs.nextTime)
        refs.nextTime.text = times && next ? formatClockTime(times[next]) : '—';
    if (refs.nextIn) {
        const remaining = Number(minutesUntilNext);
        refs.nextIn.text = !times || !next ? ''
            : nextIsTomorrow ? 'tomorrow'
                : remaining >= 60 ? `in ${Math.floor(remaining / 60)} h ${remaining % 60} min`
                    : `in ${remaining} min`;
    }
    for (const row of refs.rows || []) {
        const state = !times ? null
            : nextToday === row.name ? 'next'
                : times[row.name] <= minutes ? 'passed' : null;
        for (const suffix of ['next', 'passed']) {
            const className = `perdana-island__prayer-cell--${suffix}`;
            if (state === suffix)
                row.cell.add_style_class_name(className);
            else
                row.cell.remove_style_class_name(className);
        }
        stylePrayerLabel(row.nameLabel, 'perdana-island__prayer-name', state);
        stylePrayerLabel(row.timeLabel, 'perdana-island__prayer-time', state);
        row.timeLabel.text = times ? formatClockTime(times[row.name]) : '—';
    }
    if (refs.waterTabLabel)
        refs.waterTabLabel.text = formatWaterTabLabel(water.value);
    if (refs.waterCaption)
        refs.waterCaption.text = water.caption;
    if (refs.waterValue)
        refs.waterValue.text = water.value;
    if (refs.waterDetail)
        refs.waterDetail.text = water.detail;
    if (refs.waterFill) {
        refs.waterFill.set_size(
            Math.max(0, Math.round(refs.waterTrackWidth * water.progress)),
            4
        );
    }
}

function stylePrayerLabel(label, base, state) {
    for (const suffix of ['next', 'passed']) {
        const name = `${base}--${suffix}`;
        if (state === suffix)
            label.add_style_class_name(name);
        else
            label.remove_style_class_name(name);
    }
}
