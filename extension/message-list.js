// Scrollable stack of conversation cards for the Messages page.
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

export const MessageList = GObject.registerClass({
    GTypeName: 'PerdanaIslandMessageList',
}, class PerdanaIslandMessageList extends St.ScrollView {
    /**
     * @param {object} [params]
     * @param {number} [params.maxHeight] upper bound of the list height in px
     */
    _init({maxHeight = 320} = {}) {
        super._init({
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            overlay_scrollbars: true,
            enable_mouse_scrolling: true,
            clip_to_allocation: true,
            x_expand: true,
            y_expand: true,
            style_class: 'msg-scroll',
            style: `max-height: ${maxHeight}px;`,
        });

        this._list = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'msg-list',
            x_expand: true,
            y_expand: false,
        });

        if (typeof this.set_child === 'function')
            this.set_child(this._list);
        else
            this.add_actor(this._list);

        this._scrollSource = 0;
    }

    addGroup(group) {
        group.setMessageList?.(this);
        this._list.add_child(group);
    }

    queueRelayout() {
        this._list.queue_relayout();
        this.queue_relayout();
    }

    scrollActorIntoView(actor) {
        if (this._scrollSource)
            GLib.source_remove(this._scrollSource);
        this._scrollSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
            this._scrollSource = 0;
            const adjustment = this.get_vadjustment?.();
            if (!this.get_stage() || !adjustment || adjustment.page_size <= 0
                || !actor.get_stage())
                return GLib.SOURCE_REMOVE;

            const [, viewportY] = this.get_transformed_position();
            const [, actorY] = actor.get_transformed_position();
            const currentTop = adjustment.value;
            const actorTop = actorY - viewportY + currentTop;
            const actorBottom = actorTop + actor.height;
            const currentBottom = currentTop + adjustment.page_size;
            const maxValue = Math.max(0, adjustment.upper - adjustment.page_size);

            if (actor.height > adjustment.page_size || actorTop < currentTop)
                adjustment.value = Math.min(maxValue, Math.max(0, actorTop));
            else if (actorBottom > currentBottom)
                adjustment.value = Math.min(maxValue, actorBottom - adjustment.page_size);

            return GLib.SOURCE_REMOVE;
        });
    }

    clear() {
        if (this._scrollSource) {
            GLib.source_remove(this._scrollSource);
            this._scrollSource = 0;
        }
        this._list.destroy_all_children();
    }

    scrollToTop() {
        const adjustment = this.get_vadjustment?.();
        if (adjustment)
            adjustment.value = 0;
    }
});
