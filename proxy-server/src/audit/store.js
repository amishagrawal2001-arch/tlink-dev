import fs from 'fs';
import path from 'path';

const AUDIT_FILE = process.env.AUDIT_FILE || path.join(process.cwd(), 'audit-log.json');
const MAX_ROWS = parseInt(process.env.AUDIT_MAX || '5000', 10);

let cache = null;

function load() {
    if (cache) return cache;
    try {
        if (fs.existsSync(AUDIT_FILE)) {
            const raw = fs.readFileSync(AUDIT_FILE, 'utf8');
            cache = JSON.parse(raw);
        } else {
            cache = [];
            // persist empty file so the admin UI sees a file present
            save(cache);
        }
    } catch (err) {
        console.error('Failed to load audit log', err);
        cache = [];
    }
    if (!Array.isArray(cache)) cache = [];
    return cache;
}

function ensureDir() {
    const dir = path.dirname(AUDIT_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function save(rows) {
    cache = rows;
    try {
        ensureDir();
        fs.writeFileSync(AUDIT_FILE, JSON.stringify(rows, null, 2), 'utf8');
    } catch (err) {
        console.error('Failed to save audit log', err);
    }
}

export function recordAudit(entry) {
    const rows = load();
    const attempts = (entry.attempts || []).map(a => ({
        provider: a.provider,
        model: a.model,
        status: a.status,
        latencyMs: a.latencyMs,
        error: a.error,
        reason: a.reason
    }));
    const row = {
        timestamp: new Date().toISOString(),
        success: !!entry.success,
        userId: entry.userId || 'anonymous',
        provider: entry.provider || 'unknown',
        model: entry.model || entry.requestedModel || 'unknown',
        requestedModel: entry.requestedModel || null,
        routingReason: entry.routingReason || null,
        routingMode: entry.routingMode || null,
        routedProvider: entry.routedProvider || null,
        routedModel: entry.routedModel || null,
        status: entry.status || null,
        latencyMs: entry.latencyMs || null,
        error: entry.error || null,
        reason: entry.reason || null,
        attemptCount: entry.attemptCount != null ? entry.attemptCount : (attempts.length ? attempts.length : null),
        attempts: attempts.length ? attempts : undefined
    };
    rows.push(row);
    if (rows.length > MAX_ROWS) {
        rows.splice(0, rows.length - MAX_ROWS);
    }
    save(rows);
}

export function exportAudits() {
    return load().slice();
}

export function listAudits({ search = '', page = 1, pageSize = 100, provider, status, success, reason } = {}) {
    const rows = load();
    const term = String(search || '').toLowerCase();
    const providerFilter = provider ? String(provider).toLowerCase() : null;
    const statusFilter = status ? String(status).toLowerCase() : null;
    const reasonFilter = reason ? String(reason).toLowerCase() : null;
    const successFilter = typeof success === 'string'
        ? (success === 'true' ? true : success === 'false' ? false : null)
        : (typeof success === 'boolean' ? success : null);

    const filtered = term
        ? rows.filter(r =>
            ((r.userId && r.userId.toLowerCase().includes(term)) ||
            (r.provider && r.provider.toLowerCase().includes(term)) ||
            (r.model && r.model.toLowerCase().includes(term)) ||
            (r.status && String(r.status).toLowerCase().includes(term)) ||
            (r.error && String(r.error).toLowerCase().includes(term))))
        : rows.slice();

    const filtered2 = filtered.filter(r => {
        if (providerFilter && (!r.provider || r.provider.toLowerCase() !== providerFilter)) return false;
        if (statusFilter && (!r.status || String(r.status).toLowerCase() !== statusFilter)) return false;
        if (reasonFilter && (!r.reason || String(r.reason).toLowerCase() !== reasonFilter)) return false;
        if (successFilter !== null && !!r.success !== successFilter) return false;
        return true;
    });

    const p = Math.max(1, parseInt(page, 10) || 1);
    const ps = Math.max(1, Math.min(500, parseInt(pageSize, 10) || 100));
    const start = (p - 1) * ps;
    const items = filtered2.slice().reverse().slice(start, start + ps); // newest first
    return { items, total: filtered2.length, page: p, pageSize: ps };
}
