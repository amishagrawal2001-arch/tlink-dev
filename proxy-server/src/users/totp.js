import crypto from 'crypto';

// Minimal RFC 6238 TOTP validator (HMAC-SHA1, 30s step, 6 digits).

function base32ToBuffer(base32) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    const cleaned = (base32 || '').replace(/=+$/, '').toUpperCase().replace(/[^A-Z2-7]/g, '');
    for (const char of cleaned) {
        const val = alphabet.indexOf(char);
        if (val === -1) continue;
        bits += val.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
        bytes.push(parseInt(bits.slice(i, i + 8), 2));
    }
    return Buffer.from(bytes);
}

function hotp(bufferSecret, counter, digits = 6) {
    const buf = Buffer.alloc(8);
    for (let i = 7; i >= 0; i--) {
        buf[i] = counter & 0xff;
        counter = counter >> 8;
    }
    const hmac = crypto.createHmac('sha1', bufferSecret).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const code = ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);
    const mod = 10 ** digits;
    return (code % mod).toString().padStart(digits, '0');
}

/**
 * Validate a TOTP code (6 digits) for the given base32 secret.
 * Accepts a small window of +/-1 step to tolerate clock skew.
 */
export function validateTotp({ secret, token, window = 1, step = 30, digits = 6 }) {
    if (!secret || !token) return false;
    const bufSecret = base32ToBuffer(secret);
    const timestep = Math.floor(Date.now() / 1000 / step);
    const cleanedToken = token.replace(/\s+/g, '');
    for (let w = -window; w <= window; w++) {
        const expect = hotp(bufSecret, timestep + w, digits);
        if (expect === cleanedToken) return true;
    }
    return false;
}
