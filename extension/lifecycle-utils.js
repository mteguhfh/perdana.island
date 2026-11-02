// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';

/**
 * Remove source ids created by the extension.
 *
 * The property list is intentionally explicit. It is part of the lifecycle
 * inventory and makes a new source visible during review.
 */
export function removeExtensionSources(owner, properties) {
    for (const property of properties) {
        const sourceId = owner[property];
        if (typeof sourceId !== 'number' || sourceId <= 0)
            continue;
        GLib.source_remove(sourceId);
        owner[property] = 0;
    }
}
