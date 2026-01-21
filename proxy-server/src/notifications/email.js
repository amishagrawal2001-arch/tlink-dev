/**
 * Minimal email sender placeholder. If SMTP env vars are not provided,
 * we just log the verification link to stdout so ops can copy/send it.
 *
 * Configure:
 *  - SMTP_HOST
 *  - SMTP_PORT
 *  - SMTP_USER
 *  - SMTP_PASS
 *  - SMTP_SECURE (true/false)
 *  - SMTP_FROM (e.g., "Tlink Agentic <no-reply@yourdomain>")
 */

export async function sendVerificationEmail({ to, link }) {
    if (!to || !link) return { sent: false, reason: 'missing_params' };

    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
    const from = process.env.SMTP_FROM || 'no-reply@localhost';

    if (!host || !port || !user || !pass) {
        console.log(`[email] Verification link for ${to}: ${link}`);
        return { sent: false, reason: 'smtp_not_configured', link };
    }

    let nodemailer;
    try {
        nodemailer = await import('nodemailer');
    } catch (err) {
        console.warn('nodemailer not installed; logging verification link instead');
        console.log(`[email] Verification link for ${to}: ${link}`);
        return { sent: false, reason: 'nodemailer_missing', link };
    }

    const transporter = nodemailer.createTransport({
        host,
        port: Number(port),
        secure,
        auth: { user, pass }
    });

    const info = await transporter.sendMail({
        from,
        to,
        subject: 'Verify your email for Tlink Agentic',
        text: `Click to verify: ${link}`,
        html: `<p>Click to verify your email:</p><p><a href="${link}">${link}</a></p>`
    });

    return { sent: true, messageId: info.messageId, link };
}
