import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

let cachedUsers = null;
let usersSource = { type: 'file', path: null }; // {type: 'file'|'inline'|'none', path?: string}
const DEFAULT_TOKEN_TTL_DAYS = parseInt(process.env.TOKEN_TTL_DAYS || '90', 10);
const DEFAULT_VERIFICATION_TTL_HOURS = parseInt(process.env.VERIFY_TTL_HOURS || '48', 10);
const SELF_SERVICE_TOKEN_TTL_DAYS = parseInt(process.env.SELF_SERVICE_TOKEN_TTL_DAYS || '7', 10);

function computeExpiresAt(days) {
    if (!Number.isFinite(days) || days <= 0) return null;
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString();
}

function computeVerifyExpiresAt(hours) {
    if (!Number.isFinite(hours) || hours <= 0) return null;
    const d = new Date();
    d.setHours(d.getHours() + hours);
    return d.toISOString();
}

function buildToken({ tokenValue, expiresInDays }) {
    return {
        token: tokenValue || crypto.randomBytes(24).toString('base64url'),
        createdAt: new Date().toISOString(),
        expiresAt: computeExpiresAt(expiresInDays ?? DEFAULT_TOKEN_TTL_DAYS),
        lastUsedAt: null
    };
}

function isExpired(expiresAt) {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
}

function normalizeUser(user) {
    if (!user) return user;
    // Promote legacy single token to tokens array
    if (!Array.isArray(user.tokens)) {
        const legacyToken = user.token;
        user.tokens = legacyToken ? [{ token: legacyToken, createdAt: user.createdAt || new Date().toISOString(), expiresAt: null, lastUsedAt: null }] : [];
    }
    if (Array.isArray(user.tokens)) {
        user.tokens = user.tokens.map(t => ({
            token: t.token,
            createdAt: t.createdAt || user.createdAt || new Date().toISOString(),
            expiresAt: t.expiresAt || null,
            lastUsedAt: t.lastUsedAt || null
        }));
    }
    // Ensure required fields
    user.createdAt = user.createdAt || new Date().toISOString();
    user.active = user.active !== false; // default true
    user.verified = user.verified || false;
    user.allowedProviders = user.allowedProviders || [];
    user.allowedModels = user.allowedModels || [];
    user.deniedModels = user.deniedModels || [];
    user.allowedModelsByProvider = user.allowedModelsByProvider || {};
    user.deniedModelsByProvider = user.deniedModelsByProvider || {};
    user.billing = user.billing || {};
    user.billing.limits = user.billing.limits || {};
    // Normalize webhook fields
    if (user.billing.webhookThresholdRequests && !user.billing.lastNotifiedRequests) {
        user.billing.lastNotifiedRequests = 0;
    }
    user.rateLimit = user.rateLimit || null; // {max:number, windowMs:number} optionally per-user
    user.rateLimitByProvider = user.rateLimitByProvider || {}; // { [provider]: {max, windowMs} }
    user.lockedProvider = user.lockedProvider || null; // if set, force a single provider, no failover
    user.modelRouting = user.modelRouting || {};
    user.lastUsedAt = user.lastUsedAt || null;
    user.lastProvider = user.lastProvider || null;
    user.lastModel = user.lastModel || null;
    if (user.verification) {
        user.verification = {
            token: user.verification.token || null,
            createdAt: user.verification.createdAt || null,
            expiresAt: user.verification.expiresAt || null,
            verifiedAt: user.verification.verifiedAt || null,
            type: user.verification.type || 'email'
        };
    }
    return user;
}

function loadUsers() {
    if (cachedUsers) return cachedUsers;

    const inline = process.env.USERS_JSON;
    const filePath = process.env.USERS_FILE || path.join(process.cwd(), 'users.json');

    try {
        if (inline) {
            cachedUsers = JSON.parse(inline).map(normalizeUser);
            usersSource = { type: 'inline' };
            return cachedUsers;
        }

        if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, 'utf8');
            cachedUsers = JSON.parse(raw).map(normalizeUser);
            usersSource = { type: 'file', path: filePath };
            return cachedUsers;
        }
    } catch (error) {
        console.error('Failed to load users config', error);
    }

    cachedUsers = [];
    usersSource = { type: 'file', path: filePath };
    return cachedUsers;
}

function saveUsers(users) {
    cachedUsers = users;
    if (usersSource.type === 'inline') {
        console.warn('USERS_JSON provided inline; cannot persist new users back to env. Switch to USERS_FILE for persistence.');
        return;
    }
    const targetPath = usersSource.path || process.env.USERS_FILE || path.join(process.cwd(), 'users.json');
    try {
        fs.writeFileSync(targetPath, JSON.stringify(users, null, 2), 'utf8');
        usersSource = { type: 'file', path: targetPath };
    } catch (error) {
        console.error('Failed to save users file', error);
    }
}

export function hasUsersConfigured() {
    return loadUsers().length > 0;
}

export function getUserByToken(token) {
    return getUserByTokenWithMeta(token)?.user || null;
}

export function getUserByTokenWithMeta(token) {
    if (!token) return null;
    const users = loadUsers();
    for (const user of users) {
        if (user.token === token) {
            return { user, tokenMeta: { token, createdAt: user.createdAt || null, expiresAt: null } };
        }
        if (Array.isArray(user.tokens)) {
            const match = user.tokens.find(t => t.token === token && !isExpired(t.expiresAt));
            if (match) {
                return { user, tokenMeta: match };
            }
        }
    }
    return null;
}

export function getUsers() {
    return loadUsers();
}

export function addUser({ id, name, email, allowedProviders = [], allowedModels = [], allowedModelsByProvider = {}, deniedModels = [], deniedModelsByProvider = {}, rateLimit = null, rateLimitByProvider = {}, lockedProvider = null, preferredProvider = null, modelRouting = {}, token, verified = false, active = true, tokenExpiresInDays, billing }) {
    const users = loadUsers();
    const targetId = id || name || email || `user-${Date.now()}`;
    const dup = users.find(u => u.id === targetId || (email && u.email === email));
    if (dup) {
        const err = new Error('User already exists');
        err.code = 'USER_EXISTS';
        throw err;
    }
    const newToken = buildToken({ tokenValue: token, expiresInDays: tokenExpiresInDays });
    const newUser = {
        id: targetId,
        name: name || id || email || 'User',
        email: email || null,
        token: undefined, // use tokens array going forward
        tokens: [newToken],
        allowedProviders,
        allowedModels,
        allowedModelsByProvider,
        deniedModels,
        deniedModelsByProvider,
        rateLimit,
        rateLimitByProvider,
        lockedProvider,
        preferredProvider,
        modelRouting,
        billing: billing || {},
        verified,
        // If an email is provided and not verified, keep inactive until verification completes.
        active: email && !verified ? false : active,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        lastProvider: null,
        lastModel: null,
        verification: null
    };
    normalizeUser(newUser);
    users.push(newUser);
    saveUsers(users);
    return newUser;
}

export function updateUser(userId, patch) {
    const users = loadUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return null;
    users[idx] = normalizeUser({ ...users[idx], ...patch });
    saveUsers(users);
    return users[idx];
}

export function getUserByEmail(email) {
    if (!email) return null;
    const users = loadUsers();
    return users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase()) || null;
}

export function addTokenToUser(userId, tokenValue, { expiresInDays } = {}) {
    const users = loadUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return null;
    const token = buildToken({ tokenValue, expiresInDays });
    const user = normalizeUser(users[idx]);
    user.tokens = user.tokens || [];
    user.tokens.push(token);
    saveUsers(users);
    return { user, token };
}

export function removeTokenFromUser(userId, tokenValue) {
    const users = loadUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return false;
    const user = normalizeUser(users[idx]);
    const before = user.tokens?.length || 0;
    user.tokens = (user.tokens || []).filter(t => t.token !== tokenValue);
    // legacy field
    if (user.token === tokenValue) user.token = undefined;
    const changed = user.tokens.length !== before;
    users[idx] = user;
    saveUsers(users);
    return changed;
}

export function recordUserUsage(userId, tokenValue, { provider, model } = {}) {
    const users = loadUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return;
    const now = new Date().toISOString();
    users[idx].lastUsedAt = now;
    if (provider) users[idx].lastProvider = provider;
    if (model) users[idx].lastModel = model;
    if (tokenValue) {
        const t = users[idx].tokens?.find(tok => tok.token === tokenValue);
        if (t) t.lastUsedAt = now;
    }
    saveUsers(users);
}

export function createVerificationToken(userId) {
    return createVerificationTokenWithType(userId, 'email');
}

export function createVerificationTokenWithType(userId, type = 'email') {
    const users = loadUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return null;
    const token = crypto.randomBytes(24).toString('base64url');
    users[idx].verification = {
        token,
        createdAt: new Date().toISOString(),
        expiresAt: computeVerifyExpiresAt(DEFAULT_VERIFICATION_TTL_HOURS),
        type
    };
    users[idx].verified = false;
    saveUsers(users);
    return { user: users[idx], token };
}

export function verifyEmailToken(token) {
    if (!token) return null;
    const users = loadUsers();
    const idx = users.findIndex(u => u.verification?.token === token);
    if (idx === -1) return null;
    const verification = users[idx].verification;
    if (isExpired(verification?.expiresAt)) {
        return { error: 'expired' };
    }
    users[idx].verified = true;
    users[idx].verification = { ...verification, verifiedAt: new Date().toISOString(), token: null };
    // Reactivate user if they were paused pending verification
    if (users[idx].active === false) {
        users[idx].active = true;
    }
    saveUsers(users);
    return { user: users[idx], type: verification?.type || 'email' };
}

export function createSelfServiceRequest(email) {
    if (!email) {
        const err = new Error('Email required');
        err.code = 'EMAIL_REQUIRED';
        throw err;
    }
    const users = loadUsers();
    let user = getUserByEmail(email);
    if (!user) {
        // Create a minimal inactive user; they become active after claim/verification
        user = addUser({
            id: email,
            email,
            name: email.split('@')[0],
            allowedProviders: [],
            allowedModels: [],
            verified: false,
            active: false
        });
    }
    const verification = createVerificationTokenWithType(user.id, 'self_token');
    return { user: verification.user, token: verification.token };
}

export function claimSelfServiceToken(token, { expiresInDays } = {}) {
    if (!token) return null;
    const users = loadUsers();
    const idx = users.findIndex(u => u.verification?.token === token && (u.verification?.type === 'self_token' || u.verification?.type === 'email_self_token'));
    if (idx === -1) return null;
    const verification = users[idx].verification;
    if (isExpired(verification?.expiresAt)) {
        return { error: 'expired' };
    }
    const result = addTokenToUser(users[idx].id, null, { expiresInDays: expiresInDays ?? SELF_SERVICE_TOKEN_TTL_DAYS });
    if (!result) return null;
    // Reload to ensure we update the saved copy that includes the new token.
    const latest = loadUsers();
    const j = latest.findIndex(u => u.id === users[idx].id);
    if (j === -1) return null;
    latest[j].verified = true;
    latest[j].active = true;
    latest[j].verification = { ...verification, verifiedAt: new Date().toISOString(), token: null };
    saveUsers(latest);
    return { user: latest[j], token: result.token?.token, expiresAt: result.token?.expiresAt };
}
