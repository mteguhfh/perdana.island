// Battery and charger state from sysfs. No UI and no extension state here.

import Gio from 'gi://Gio';

import {readTextFile} from './state-store.js';

export function readBatteryState() {
    let battery = null;
    let chargerConnected = false;
    let chargerStateKnown = false;
    try {
        const directory = Gio.File.new_for_path('/sys/class/power_supply')
            .enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        let entry;
        while ((entry = directory.next_file(null)) !== null) {
            const name = entry.get_name();
            const base = `/sys/class/power_supply/${name}`;
            const type = readTextFile(`${base}/type`).trim();
            if (/^BAT/i.test(name)) {
                const percent = Number(readTextFile(`${base}/capacity`).trim());
                if (Number.isFinite(percent)) {
                    battery = {
                        percent: Math.max(0, Math.min(100, percent)),
                        status: readTextFile(`${base}/status`).trim(),
                    };
                }
            } else if (/^(Mains|USB|USB_C|USB_PD|Wireless)$/i.test(type)) {
                const online = readTextFile(`${base}/online`).trim();
                if (online !== '') {
                    chargerStateKnown = true;
                    chargerConnected ||= online === '1';
                }
            }
        }
        directory.close(null);
    } catch (_error) {
        // Power supply details are optional on desktops and unsupported devices.
    }
    if (!chargerStateKnown && battery?.status === 'Charging')
        chargerConnected = true;
    if (!battery)
        return null;
    let status = battery.status;
    if (chargerStateKnown) {
        if (chargerConnected && ['Discharging', 'Unknown', ''].includes(status))
            status = 'Charging';
        else if (!chargerConnected && status === 'Charging')
            status = 'Discharging';
    }
    return {...battery, status, connected: chargerConnected};
}
