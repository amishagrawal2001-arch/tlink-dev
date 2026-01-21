import fs from 'fs';
import path from 'path';

const SETTINGS_FILE = process.env.ROUTING_SETTINGS_FILE || path.join(process.cwd(), 'routing-settings.json');
const DEFAULT_MODE = (process.env.ROUTING_MODE || 'auto').toLowerCase();

function ensureDir() {
    const dir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

export function getRoutingSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
            const json = JSON.parse(raw);
            return {
                mode: (json.mode || DEFAULT_MODE || 'auto').toLowerCase(),
                rules: Array.isArray(json.rules) ? json.rules : []
            };
        }
    } catch (err) {
        console.error('Failed to load routing settings', err);
    }
    return { mode: DEFAULT_MODE, rules: [] };
}

export function saveRoutingSettings({ mode, rules }) {
    const current = getRoutingSettings();
    const next = {
        mode: (mode || current.mode || DEFAULT_MODE || 'auto').toLowerCase(),
        rules: Array.isArray(rules) ? rules : current.rules
    };
    try {
        ensureDir();
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2), 'utf8');
    } catch (err) {
        console.error('Failed to save routing settings', err);
    }
    return next;
}
