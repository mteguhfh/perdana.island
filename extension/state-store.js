// Local file and JSON state helpers. Extension state stays in extension.js.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export function readTextFile(path) {
    try {
        const [success, contents] = GLib.file_get_contents(path);
        return success ? new TextDecoder().decode(contents) : '';
    } catch (_error) {
        return '';
    }
}

export function readJsonFile(path, fallback = null) {
    const text = readTextFile(path);
    if (!text)
        return fallback;
    try {
        return JSON.parse(text);
    } catch (_error) {
        return fallback;
    }
}

/**
 * Write text to a path, creating its parent directory first.
 * Throws are left to the caller so each state file keeps its own log message.
 * Returns false when GLib declines the write.
 */
export function writeTextFile(path, text, {
    directoryMode = 0o755,
    fileMode = null,
    enforceDirectoryMode = false,
} = {}) {
    const directory = GLib.path_get_dirname(path);
    GLib.mkdir_with_parents(directory, directoryMode);
    const saved = GLib.file_set_contents(path, text);
    if (enforceDirectoryMode) {
        Gio.File.new_for_path(directory).set_attribute_uint32(
            'unix::mode', directoryMode, Gio.FileQueryInfoFlags.NONE, null
        );
    }
    if (fileMode !== null) {
        Gio.File.new_for_path(path).set_attribute_uint32(
            'unix::mode', fileMode, Gio.FileQueryInfoFlags.NONE, null
        );
    }
    return saved;
}

export function writeJsonFile(path, value, {space = 0, ...options} = {}) {
    return writeTextFile(path, JSON.stringify(value, null, space), options);
}
