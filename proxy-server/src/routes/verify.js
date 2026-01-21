import { verifyEmailToken } from '../users/user-store.js';

function html(body) {
    return `<!doctype html><html><body>${body}</body></html>`;
}

export function verifyEmail(req, res) {
    const token = req.query.token;
    if (!token) {
        return res.status(400).send(html('Missing verification token.'));
    }
    const result = verifyEmailToken(token);
    if (!result) {
        return res.status(404).send(html('Verification token not found.'));
    }
    if (result.error === 'expired') {
        return res.status(400).send(html('Verification token expired. Please request a new link.'));
    }
    return res.status(200).send(html('Email verified successfully. You can close this tab.'));
}
