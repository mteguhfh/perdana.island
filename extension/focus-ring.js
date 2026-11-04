import St from 'gi://St';

import {hexColorToRgb} from './island-domain.js';

export function createFocusRing({getRemaining, getDuration, getAccentColor} = {}) {
    const ring = new St.DrawingArea({style_class: 'perdana-island__focus-ring'});
    ring.connect('repaint', area => {
        const [width, height] = area.get_surface_size();
        const cr = area.get_context();
        const radius = Math.min(width, height) / 2 - 5;
        const cx = width / 2;
        const cy = height / 2;
        const remaining = getRemaining ? getRemaining() : 0;
        const duration = Math.max(1, getDuration ? getDuration() : 1);
        const progress = Math.max(0, Math.min(1, 1 - remaining / duration));
        const color = hexColorToRgb(getAccentColor ? getAccentColor() : undefined);
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
    });
    ring.set_size(124, 124);
    return ring;
}
