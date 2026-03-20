import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { chatCompletions } from './routes/chat.js';
import { healthCheck } from './routes/health.js';
import { metrics } from './routes/metrics.js';
import { verifyEmail } from './routes/verify.js';
import { authenticateUser } from './users/auth.js';
import { issueToken } from './routes/token.js';
import { listModels } from './routes/models.js';
import adminRouter from './routes/admin.js';
import adminTestRouter from './routes/admin-test.js';
import selfServiceRouter from './routes/self-service.js';
import { requireAdmin } from './users/admin-auth.js';
import fs from 'fs';

// Load environment variables
dotenv.config();

const app = express();
// Default proxy port; can still be overridden via PORT env var.
const PORT = process.env.PORT || 3052;
// Security default: do not place admin token in URL unless explicitly enabled.
const INCLUDE_ADMIN_TOKEN_IN_URL = process.env.ADMIN_URL_INCLUDE_TOKEN === 'true';

// Security middleware
app.use(helmet());

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];
app.use(cors({
    origin: (origin, callback) => {
        if (allowedOrigins.includes('*') || !origin) {
            callback(null, true);
        } else {
            const isAllowed = allowedOrigins.some(allowed => {
                if (allowed.includes('*')) {
                    const pattern = allowed.replace('*', '.*');
                    return new RegExp(pattern).test(origin);
                }
                return allowed === origin;
            });
            callback(isAllowed ? null : new Error('Not allowed by CORS'), isAllowed);
        }
    },
    credentials: true
}));

// Body parsing
app.use(express.json());

// Auth (no-op if USERS are not configured)
app.use(authenticateUser);

// Rate limiting per IP
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // 100 requests per window
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        // Prefer per-user token when available; fallback to IP
        if (req.user?.id) return `user:${req.user.id}`;
        if (req.user?.token) return `token:${req.user.token}`;
        return req.ip;
    }
});

app.use('/v1/', limiter);

function buildAdminUrl (req) {
    const params = new URLSearchParams();
    const query = req.query || {};
    for (const [key, value] of Object.entries(query)) {
        if (Array.isArray(value)) {
            if (value.length > 0 && value[0] != null) params.set(key, String(value[0]));
        } else if (value != null) {
            params.set(key, String(value));
        }
    }

    const adminToken = (process.env.ADMIN_TOKEN || '').trim();
    if (INCLUDE_ADMIN_TOKEN_IN_URL && adminToken && !params.has('adminToken')) {
        params.set('adminToken', adminToken);
    }

    const q = params.toString();
    return q ? `/admin/?${q}` : '/admin/';
}

// Routes
app.get('/', (req, res) => {
    const enableAdminUI = process.env.ENABLE_ADMIN_UI !== 'false';
    if (enableAdminUI) {
        return res.redirect(buildAdminUrl(req));
    }
    return res.json({
        status: 'ok',
        service: 'tlink-ai-proxy',
        message: 'Admin UI disabled (ENABLE_ADMIN_UI=false)'
    });
});
app.get('/health', healthCheck);
app.get('/metrics', metrics);
app.get('/API-ADMIN.md', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'API-ADMIN.md'));
});
app.get('/API-ADMIN.html', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'API-ADMIN.html'));
});
app.get('/v1/verify-email', verifyEmail);
// Admin static UI and API (requires ADMIN_TOKEN)
const enableAdminUI = process.env.ENABLE_ADMIN_UI !== 'false';
if (enableAdminUI) {
    const adminUiPath = path.join(process.cwd(), 'src', 'admin');
    // Redirect only the exact /admin path; keep /admin/ for static index.html.
    app.get(/^\/admin$/, (req, res) => {
        return res.redirect(buildAdminUrl(req));
    });
    app.use('/admin', express.static(adminUiPath));
    app.use('/admin/api', requireAdmin, adminRouter);
    app.use('/admin/api', requireAdmin, adminTestRouter);
}

// Self-service static page
const selfServicePath = path.join(process.cwd(), 'src', 'self-service');
if (fs.existsSync(selfServicePath)) {
    app.use('/self-service', express.static(selfServicePath));
}

app.get('/v1/models', listModels);
app.post('/v1/tokens', requireAdmin, issueToken);
app.post('/v1/chat/completions', chatCompletions);
app.use('/v1', selfServiceRouter);

// Error handling
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        error: {
            message: err.message || 'Internal server error',
            type: 'proxy_error'
        }
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: {
            message: 'Endpoint not found',
            type: 'not_found'
        }
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Tlink AI Proxy Server running on port ${PORT}`);
    console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔒 Rate limit: ${process.env.RATE_LIMIT_MAX_REQUESTS || 100} requests per ${(parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000) / 1000}s`);
});
