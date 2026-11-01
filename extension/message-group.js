// Expandable conversation row used by the Messages page.
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

function ellipsized(text, styleClass) {
    const label = new St.Label({
        text: String(text ?? ''),
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
        'expanded-changed': {param_types: [GObject.TYPE_BOOLEAN]},
    },
}, class PerdanaIslandMessageGroup extends St.BoxLayout {
    /**
     * @param {object} params
     * @param {string} params.appName notification source label
     * @param {Gio.Icon|null} [params.gicon] application icon
     * @param {string} params.sender sender display name
     * @param {string} params.time age of the latest message
     * @param {{text: string, time: string, unread: boolean}[]} params.messages oldest first
     * @param {boolean} [params.expanded]
     */
    _init({appName, gicon = null, sender, time, messages, expanded = false}) {
        const unread = messages.filter(message => message.unread).length;
        const latest = messages[messages.length - 1];

        super._init({
            style_class: `msg-group${unread ? ' msg-group--unread' : ''}`,
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            y_expand: false,
            y_align: Clutter.ActorAlign.START,
        });

        this._messageList = null;
        this._expanded = false;
        this._unread = unread > 0;

        this._header = new St.Button({
            style_class: 'msg-header',
            x_expand: true,
            y_expand: false,
            can_focus: true,
            reactive: true,
            track_hover: true,
            accessible_name: `${sender} on ${appName}, ${messages.length} messages`,
        });
        const headerRow = new St.BoxLayout({
            style_class: 'msg-header-row',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._header.set_child(headerRow);

        const appIcon = new St.Icon({
            style_class: 'msg-icon',
            icon_size: 30,
            x_expand: false,
            y_expand: false,
            y_align: Clutter.ActorAlign.CENTER,
        });
        appIcon.gicon = gicon || null;
        if (!gicon)
            appIcon.icon_name = 'avatar-default-symbolic';
        headerRow.add_child(appIcon);

        const copy = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'msg-copy',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const senderLabel = ellipsized(sender, 'msg-sender');
        senderLabel.x_expand = true;
        copy.add_child(senderLabel);
        this._preview = ellipsized(latest?.text ?? '', 'msg-preview');
        copy.add_child(this._preview);
        headerRow.add_child(copy);

        const meta = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'msg-meta',
            x_expand: false,
            y_align: Clutter.ActorAlign.START,
        });
        const metaLabel = ellipsized(time, 'msg-sub');
        metaLabel.y_align = Clutter.ActorAlign.START;
        metaLabel.clutter_text.x_align = Clutter.ActorAlign.END;
        meta.add_child(metaLabel);
        headerRow.add_child(meta);

        this._chevron = new St.Icon({
            icon_name: 'pan-end-symbolic',
            style_class: 'msg-chevron',
            icon_size: 14,
            x_expand: false,
            y_expand: false,
            y_align: Clutter.ActorAlign.CENTER,
        });
        headerRow.add_child(this._chevron);
        this._header.connect('clicked', () => this.setExpanded(!this._expanded));
        this.add_child(this._header);

        this._body = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'msg-body',
            x_expand: true,
            y_expand: false,
            y_align: Clutter.ActorAlign.START,
        });
        messages.forEach((message, index) => {
            const row = new St.BoxLayout({
                style_class: `msg-line${index === messages.length - 1 ? ' msg-line-last' : ''}`,
                x_expand: true,
                y_expand: false,
                y_align: Clutter.ActorAlign.CENTER,
            });
            row.add_child(new St.Widget({
                style_class: message.unread ? 'msg-dot msg-dot--unread' : 'msg-dot msg-dot-read',
                x_expand: false,
                y_expand: false,
                y_align: Clutter.ActorAlign.CENTER,
            }));
            const text = ellipsized(message.text, 'msg-text');
            text.x_expand = true;
            text.x_align = Clutter.ActorAlign.START;
            row.add_child(text);
            const rowTime = ellipsized(message.time, 'msg-time');
            rowTime.x_expand = false;
            row.add_child(rowTime);
            this._body.add_child(row);
        });

        const footer = new St.BoxLayout({
            style_class: 'msg-footer',
            x_expand: true,
            y_expand: false,
        });
        footer.add_child(new St.Widget({x_expand: true}));
        footer.add_child(actionButton('Mark read', 'msg-action',
            `Mark ${sender} as read`, () => this.emit('mark-read')));
        footer.add_child(actionButton('Open', 'msg-action msg-action-primary',
            `Open ${sender} in ${appName}`, () => this.emit('open')));
        this._body.add_child(footer);
        this.add_child(this._body);

        this._applyExpanded(expanded);
    }

    setMessageList(list) {
        this._messageList = list;
    }

    _applyExpanded(expanded) {
        this._expanded = expanded;
        this._body.visible = expanded;
        this._preview.visible = !expanded;
        this._chevron.icon_name = expanded ? 'pan-down-symbolic' : 'pan-end-symbolic';
        if (expanded) {
            this.add_style_class_name('msg-group--open');
            if (this._unread)
                this.add_style_class_name('msg-group--unread-open');
        } else {
            this.remove_style_class_name('msg-group--open');
            this.remove_style_class_name('msg-group--unread-open');
        }
    }

    setExpanded(expanded) {
        if (this._expanded === expanded)
            return;
        this._applyExpanded(expanded);
        this._header.queue_relayout();
        this._body.queue_relayout();
        this.queue_relayout();
        this._messageList?.queueRelayout();
        this.emit('expanded-changed', expanded);
        if (expanded)
            this._messageList?.scrollActorIntoView(this);
    }
});
