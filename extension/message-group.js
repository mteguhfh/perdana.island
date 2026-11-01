// Conversation card for the Messages page: app -> conversation -> messages.
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

function ellipsized(text, styleClass) {
    const label = new St.Label({
        text,
        style_class: styleClass,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    label.clutter_text.single_line_mode = true;
    return label;
}

function actionButton(label, styleClass, accessibleName, onClick) {
    const button = new St.Button({
        label,
        style_class: styleClass,
        can_focus: true,
        reactive: true,
        track_hover: true,
        accessible_name: accessibleName,
        y_align: Clutter.ActorAlign.CENTER,
    });
    button.connect('clicked', onClick);
    return button;
}

export const MessageGroup = GObject.registerClass({
    GTypeName: 'PerdanaIslandMessageGroup',
    Signals: {
        'open': {},
        'mark-read': {},
        'reply': {},
        'expanded-changed': {param_types: [GObject.TYPE_BOOLEAN]},
    },
}, class PerdanaIslandMessageGroup extends St.BoxLayout {
    /**
     * @param {object} params
     * @param {string} params.appName conversation source, for example WhatsApp
     * @param {Gio.Icon|null} [params.gicon] app icon or avatar
     * @param {string} params.sender sender display name
     * @param {string} params.time age of the latest message
     * @param {{text: string, time: string, unread: boolean}[]} params.messages oldest first
     * @param {boolean} [params.expanded]
     * @param {boolean} [params.canReply] the source exposes a reply action
     */
    _init({appName, gicon = null, sender, time, messages, expanded = false, canReply = false}) {
        super._init({
            style_class: 'msg-group',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
        });

        this._expanded = false;
        const unread = messages.filter(message => message.unread).length;
        const last = messages[messages.length - 1];

        this._header = new St.Button({
            style_class: 'msg-header',
            x_expand: true,
            can_focus: true,
            reactive: true,
            track_hover: true,
            accessible_name: `${sender}, ${appName}`,
        });
        const headerRow = new St.BoxLayout({x_expand: true});
        this._header.set_child(headerRow);

        const avatar = new St.Icon({
            style_class: 'msg-avatar',
            icon_size: 32,
            y_align: Clutter.ActorAlign.START,
        });
        if (gicon)
            avatar.gicon = gicon;
        else
            avatar.icon_name = 'avatar-default-symbolic';
        headerRow.add_child(avatar);

        const textColumn = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'msg-text-col',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            clip_to_allocation: true,
        });
        textColumn.add_child(ellipsized(sender, 'msg-sender'));
        textColumn.add_child(ellipsized(`${appName} · ${time}`, 'msg-meta'));
        this._preview = ellipsized(last?.text ?? '', 'msg-preview');
        textColumn.add_child(this._preview);
        headerRow.add_child(textColumn);

        if (unread > 0) {
            headerRow.add_child(new St.Label({
                text: String(unread),
                style_class: 'msg-badge',
                y_align: Clutter.ActorAlign.START,
            }));
        }

        this._chevron = new St.Icon({
            icon_name: 'pan-end-symbolic',
            style_class: 'msg-chevron',
            icon_size: 14,
            y_align: Clutter.ActorAlign.START,
        });
        headerRow.add_child(this._chevron);

        this._header.connect('clicked', () => this.setExpanded(!this._expanded));
        this.add_child(this._header);

        this._body = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'msg-body',
            x_expand: true,
        });

        messages.forEach((message, index) => {
            const row = new St.BoxLayout({
                style_class: `msg-row${index === messages.length - 1 ? ' msg-row-last' : ''}`,
                x_expand: true,
            });
            row.add_child(new St.Widget({
                style_class: message.unread ? 'msg-dot' : 'msg-dot msg-dot-read',
                y_align: Clutter.ActorAlign.CENTER,
            }));
            // The text column takes all space the dot and time leave behind.
            // Without an explicit expand it can collapse to zero width.
            const text = ellipsized(message.text, 'msg-body-text');
            text.x_expand = true;
            text.x_align = Clutter.ActorAlign.START;
            text.clutter_text.line_wrap = false;
            row.add_child(text);
            const time = new St.Label({
                text: message.time,
                style_class: 'msg-row-time',
                y_align: Clutter.ActorAlign.CENTER,
            });
            time.x_align = Clutter.ActorAlign.END;
            row.add_child(time);
            this._body.add_child(row);
        });

        const footer = new St.BoxLayout({style_class: 'msg-footer', x_expand: true});
        footer.add_child(new St.Widget({x_expand: true}));
        if (canReply) {
            footer.add_child(actionButton('Balas', 'msg-btn',
                `Balas ${sender}`, () => this.emit('reply')));
        }
        footer.add_child(actionButton('Tandai dibaca', 'msg-btn',
            `Tandai pesan ${sender} sudah dibaca`, () => this.emit('mark-read')));
        footer.add_child(actionButton('Buka', 'msg-btn msg-btn-primary',
            `Buka percakapan dengan ${sender}`, () => this.emit('open')));
        this._body.add_child(footer);
        this.add_child(this._body);

        this._applyExpanded(expanded);
    }

    _applyExpanded(expanded) {
        this._expanded = expanded;
        this._body.visible = expanded;
        this._preview.visible = !expanded;
        this._chevron.icon_name = expanded ? 'pan-down-symbolic' : 'pan-end-symbolic';
        if (expanded)
            this.add_style_pseudo_class('expanded');
        else
            this.remove_style_pseudo_class('expanded');
    }

    setExpanded(expanded) {
        if (this._expanded === expanded)
            return;
        this._applyExpanded(expanded);
        this.emit('expanded-changed', expanded);
    }
});
