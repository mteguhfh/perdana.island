import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

import {attachButtonMotion, makeLabel, place} from './ui-controls.js';

export function createShelfFileButton(item, {view, width, height, onOpen} = {}) {
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
        label.x_expand = true;
        row.add_child(label);
        button.set_child(row);
    }
    button.connect('clicked', () => onOpen?.(item));
    attachButtonMotion(button, {hoverScale: 1.02, pressScale: 0.97});
    return button;
}

export function createShelfList(items, {view, cardWidth, onOpen} = {}) {
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
    const innerWidth = Math.max(1, cardWidth - 34);
    if (view === 'grid') {
        const columns = 3;
        const columnGap = 8;
        const cellWidth = Math.floor((innerWidth - columnGap * (columns - 1)) / columns);
        for (let start = 0; start < items.length; start += columns) {
            const row = new St.BoxLayout({
                style_class: 'perdana-island__shelf-grid-row',
            });
            row.set_size(innerWidth, itemHeight);
            items.slice(start, start + columns).forEach(file => {
                row.add_child(createShelfFileButton(file, {
                    view, width: cellWidth, height: itemHeight, onOpen,
                }));
            });
            content.add_child(row);
        }
        const rowCount = Math.ceil(items.length / columns);
        content.set_size(innerWidth,
            rowCount * itemHeight + (rowCount - 1) * columnGap);
    } else {
        items.forEach(file => {
            content.add_child(createShelfFileButton(file, {
                view, width: innerWidth, height: itemHeight, onOpen,
            }));
        });
        content.set_size(innerWidth, items.length * itemHeight + (items.length - 1) * 4);
    }
    scroll.add_child(content);
    return scroll;
}
