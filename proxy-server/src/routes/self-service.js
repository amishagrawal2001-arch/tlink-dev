import express from 'express';
import {
  createSelfServiceRequest,
  claimSelfServiceToken
} from '../users/user-store.js';
import { sendVerificationEmail } from '../notifications/email.js';

function html(body) {
  return `<!doctype html><html><body>${body}</body></html>`;
}

function buildLink(req, token) {
  const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  return `${base}/v1/self-service/claim?token=${encodeURIComponent(token)}`;
}

const router = express.Router();

// Request a short-lived token via email link ("forgot token" flow)
router.post('/self-service/request-token', async (req, res) => {
  const email = (req.body?.email || '').trim();
  if (!email) {
    return res.status(400).json({ error: { message: 'Email is required', type: 'bad_request' } });
  }

  try {
    const { token } = createSelfServiceRequest(email);
    const link = buildLink(req, token);
    let emailResult = null;
    try {
      emailResult = await sendVerificationEmail({ to: email, link });
    } catch (err) {
      console.error('Failed to send self-service email', err);
      emailResult = { sent: false, reason: 'send_failed' };
    }

    const resp = {
      message: emailResult?.sent ? 'Verification link sent. Check your email.' : 'Email send failed; use the link below.',
      emailResult,
      verificationUrl: link
    };
    // Always include the link so admins can share it manually if email is down.
    return res.json(resp);
  } catch (err) {
    console.error('Self-service request failed', err);
    return res.status(500).json({ error: { message: 'Failed to issue verification link', type: 'internal_error' } });
  }
});

// Claim a short-lived token
router.get('/self-service/claim', (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).send(html('Missing token.'));

  const result = claimSelfServiceToken(token);
  if (!result) return res.status(404).send(html('Token not found.'));
  if (result.error === 'expired') return res.status(400).send(html('Token expired. Request a new link.'));

  const payload = {
    token: result.token,
    expiresAt: result.expiresAt,
    userId: result.user?.id
  };

  if (req.accepts('json') && req.query.format === 'json') {
    return res.json(payload);
  }

  return res.status(200).send(html(`Your short-lived token:<br><code>${payload.token}</code><br>Expires: ${payload.expiresAt || 'n/a'}`));
});

export default router;
