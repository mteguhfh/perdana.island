import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

export function createNoteEditor(note, {onTextChange, onActivate, onEscape} = {}) {
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
    entry.clutter_text.connect('text-changed', () => onTextChange?.(entry));
    entry.connect('key-focus-in', () =>
        scroll.add_style_class_name('perdana-island__notes-editor-scroll--focused'));
    entry.connect('key-focus-out', () =>
        scroll.remove_style_class_name('perdana-island__notes-editor-scroll--focused'));
    entry.clutter_text.connect('activate', () => onActivate?.(entry));
    entry.clutter_text.connect('key-press-event', (_actor, event) => {
        if (event.get_key_symbol() !== Clutter.KEY_Escape)
            return Clutter.EVENT_PROPAGATE;
        onEscape?.();
        return Clutter.EVENT_STOP;
    });
    editorBox.add_child(entry);
    scroll.add_child(editorBox);
    return {scroll, editorBox, entry};
}
