import St from 'gi://St';

import {hexColorToRgb} from './island-domain.js';

// Custom vector icon for Summary rows and the lyrics shortcut. The accent
// color is read at repaint time so a preference change repaints correctly.
export function createSummaryIcon(kind, {accentColor} = {}) {
    const styleClass = kind === 'lyrics'
        ? 'perdana-island__summary-lyrics-icon'
        : 'perdana-island__summary-row-icon';
    const icon = new St.DrawingArea({style_class: styleClass});
    icon.connect('repaint', area => {
        const [width, height] = area.get_surface_size();
        if (width <= 0 || height <= 0)
            return;
        const color = hexColorToRgb(accentColor ? accentColor() : undefined);
        const cr = area.get_context();
        cr.scale(width / 24, height / 24);
        cr.setLineWidth(1.7);
        cr.setLineCap(1);
        cr.setLineJoin(1);
        cr.setSourceRGBA(color[0], color[1], color[2], 1);

        if (kind === 'focus') {
            cr.arc(12, 13, 7.5, 0, Math.PI * 2);
            cr.moveTo(12, 9);
            cr.lineTo(12, 13);
            cr.lineTo(15, 14.8);
            cr.moveTo(9.5, 2.7);
            cr.lineTo(14.5, 2.7);
        } else if (kind === 'tasks') {
            cr.arc(12, 12, 8.5, 0, Math.PI * 2);
            cr.moveTo(8.2, 12.1);
            cr.lineTo(10.7, 14.6);
            cr.lineTo(15.9, 9.4);
        } else if (kind === 'lyrics') {
            cr.moveTo(6, 6.5);
            cr.lineTo(18, 6.5);
            cr.moveTo(6, 10.5);
            cr.lineTo(18, 10.5);
            cr.moveTo(6, 14.5);
            cr.lineTo(16, 14.5);
            cr.moveTo(6, 18.5);
            cr.lineTo(13, 18.5);
        } else {
            cr.moveTo(5, 5.5);
            cr.lineTo(19, 5.5);
            cr.curveTo(20.4, 5.5, 21, 6.1, 21, 7.5);
            cr.lineTo(21, 14.8);
            cr.curveTo(21, 16.2, 20.3, 17, 18.8, 17);
            cr.lineTo(12, 17);
            cr.lineTo(7.5, 20.2);
            cr.lineTo(7.5, 17);
            cr.lineTo(5, 17);
            cr.curveTo(3.6, 17, 3, 16.3, 3, 14.8);
            cr.lineTo(3, 7.8);
            cr.curveTo(3, 6.2, 3.8, 5.5, 5, 5.5);
            cr.closePath();
        }
        cr.stroke();
        cr.$dispose();
    });
    icon.set_size(18, 18);
    return icon;
}
