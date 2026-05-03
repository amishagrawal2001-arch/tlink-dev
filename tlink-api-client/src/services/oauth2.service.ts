import { Injectable } from '@angular/core'
import { OAuth2Config } from '../api/interfaces'

/**
 * OAuth2 token acquisition.
 *
 * Supports three grant types:
 *   - authorization_code (with optional PKCE)
 *   - client_credentials
 *   - password (resource-owner)
 *
 * The auth-code flow needs a browser redirect, which we handle in the
 * Electron main process via a transient BrowserWindow that we listen
 * to for `?code=...`. To keep this layer renderer-pure, we go through
 * the `electron` module via a dynamic require so this file still
 * compiles in environments without it.
 *
 * Tokens (and their refresh cousins, when present) are cached on the
 * OAuth2Config in-memory; the caller persists them as part of the
 * profile/saved-request to survive a relaunch.
 */
@Injectable({ providedIn: 'root' })
export class OAuth2Service {
    /**
     * Returns a usable access token. If we already have a fresh one
     * cached on the config, we return that directly; otherwise we run
     * the configured grant. On expiry + a refresh token, we refresh
     * silently. On failure to refresh, we re-run the grant.
     */
    async acquireToken (cfg: OAuth2Config): Promise<string> {
        if (cfg.accessToken && cfg.expiresAt && cfg.expiresAt > Date.now() + 30_000) {
            return cfg.accessToken
        }
        if (cfg.refreshToken) {
            try {
                await this.refresh(cfg)
                if (cfg.accessToken) {
                    return cfg.accessToken
                }
            } catch {
                // Fall through to a fresh grant below.
            }
        }
        switch (cfg.grantType) {
            case 'authorization_code':
                await this.runAuthCodeFlow(cfg)
                break
            case 'client_credentials':
                await this.runClientCredentials(cfg)
                break
            case 'password':
                await this.runPasswordGrant(cfg)
                break
            default:
                throw new Error(`Unsupported grant: ${cfg.grantType}`)
        }
        if (!cfg.accessToken) {
            throw new Error('OAuth2 succeeded but returned no access_token')
        }
        return cfg.accessToken
    }

    /**
     * Manually clear the cached token — useful for the UI's "sign out"
     * button. Doesn't touch the rest of the config.
     */
    clear (cfg: OAuth2Config): void {
        cfg.accessToken = undefined
        cfg.refreshToken = undefined
        cfg.expiresAt = undefined
    }

    private async runAuthCodeFlow (cfg: OAuth2Config): Promise<void> {
        if (!cfg.authUrl || !cfg.tokenUrl || !cfg.clientId || !cfg.redirectUri) {
            throw new Error('authorization_code grant requires authUrl, tokenUrl, clientId, redirectUri')
        }
        // PKCE — generate verifier + challenge if requested. Most modern
        // public clients require this; servers ignore it gracefully.
        let codeVerifier = ''
        let codeChallenge = ''
        if (cfg.usePkce !== false) {
            codeVerifier = this.randomStr(64)
            codeChallenge = await this.sha256Base64Url(codeVerifier)
        }

        const state = this.randomStr(24)
        const authParams = new URLSearchParams({
            response_type: 'code',
            client_id: cfg.clientId,
            redirect_uri: cfg.redirectUri,
            state,
            ...(cfg.scope ? { scope: cfg.scope } : {}),
            ...(codeChallenge ? { code_challenge: codeChallenge, code_challenge_method: 'S256' } : {}),
        })
        const authUrl = `${cfg.authUrl}${cfg.authUrl.includes('?') ? '&' : '?'}${authParams.toString()}`

        const code = await this.openBrowserAndCaptureCode(authUrl, cfg.redirectUri, state)
        if (!code) {
            throw new Error('Authorization cancelled')
        }

        const tokenBody = new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: cfg.redirectUri,
            client_id: cfg.clientId,
            ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
        })
        await this.postTokenEndpoint(cfg, tokenBody)
    }

    private async runClientCredentials (cfg: OAuth2Config): Promise<void> {
        if (!cfg.tokenUrl || !cfg.clientId) {
            throw new Error('client_credentials grant requires tokenUrl, clientId')
        }
        const body = new URLSearchParams({
            grant_type: 'client_credentials',
            ...(cfg.scope ? { scope: cfg.scope } : {}),
        })
        await this.postTokenEndpoint(cfg, body)
    }

    private async runPasswordGrant (cfg: OAuth2Config): Promise<void> {
        if (!cfg.tokenUrl || !cfg.username || !cfg.password) {
            throw new Error('password grant requires tokenUrl, username, password')
        }
        const body = new URLSearchParams({
            grant_type: 'password',
            username: cfg.username,
            password: cfg.password,
            ...(cfg.scope ? { scope: cfg.scope } : {}),
            ...(cfg.clientId ? { client_id: cfg.clientId } : {}),
        })
        await this.postTokenEndpoint(cfg, body)
    }

    private async refresh (cfg: OAuth2Config): Promise<void> {
        if (!cfg.refreshToken || !cfg.tokenUrl) {
            throw new Error('No refresh_token / tokenUrl available')
        }
        const body = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: cfg.refreshToken,
            ...(cfg.clientId ? { client_id: cfg.clientId } : {}),
        })
        await this.postTokenEndpoint(cfg, body)
    }

    private async postTokenEndpoint (cfg: OAuth2Config, body: URLSearchParams): Promise<void> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
        }
        // Send credentials as Basic auth header when requested, else
        // tack them onto the body. Many providers (Google, Microsoft)
        // accept either; some (Okta, Auth0) require body for public
        // clients and header for confidential ones.
        if (cfg.clientAuth === 'header' && cfg.clientId) {
            headers['Authorization'] = 'Basic ' + btoa(`${cfg.clientId}:${cfg.clientSecret ?? ''}`)
        } else {
            if (cfg.clientId && !body.has('client_id')) {body.set('client_id', cfg.clientId)}
            if (cfg.clientSecret) {body.set('client_secret', cfg.clientSecret)}
        }
        const resp = await fetch(cfg.tokenUrl, {
            method: 'POST',
            headers,
            body: body.toString(),
        })
        if (!resp.ok) {
            const text = await resp.text().catch(() => '')
            throw new Error(`Token endpoint ${resp.status}: ${text.length ? text : resp.statusText}`)
        }
        const json = await resp.json()
        if (!json.access_token) {
            throw new Error('Token response missing access_token')
        }
        cfg.accessToken = json.access_token
        cfg.tokenType = json.token_type ?? 'Bearer'
        if (json.refresh_token) {
            cfg.refreshToken = json.refresh_token
        }
        if (typeof json.expires_in === 'number') {
            cfg.expiresAt = Date.now() + json.expires_in * 1000
        } else {
            cfg.expiresAt = undefined
        }
    }

    /**
     * Open the auth URL in a transient Electron BrowserWindow and
     * resolve when the redirect URI is hit, returning the `code`. The
     * window auto-closes on success/cancel.
     */
    private openBrowserAndCaptureCode (authUrl: string, redirectUri: string, state: string): Promise<string | null> {
        return new Promise<string | null>((resolve, reject) => {
            let electronRemote: any = null
            let mainProcessElectron: any = null
            try {
                // Renderer-side: @electron/remote gives us BrowserWindow.
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                electronRemote = require('@electron/remote')
            } catch {
                /* no-op */
            }
            try {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                mainProcessElectron = require('electron')
            } catch {
                /* no-op */
            }
            const BrowserWindow = electronRemote?.BrowserWindow ?? mainProcessElectron?.BrowserWindow
            if (!BrowserWindow) {
                reject(new Error('OAuth2 auth-code flow requires Electron BrowserWindow — not available in this context'))
                return
            }
            const win = new BrowserWindow({
                width: 520,
                height: 720,
                title: 'Sign in',
                webPreferences: { nodeIntegration: false, contextIsolation: true },
                autoHideMenuBar: true,
            })
            let resolved = false
            const finish = (code: string | null, err?: string) => {
                if (resolved) {return}
                resolved = true
                try { win.close() } catch { /* already closed */ }
                if (err) {reject(new Error(err))} else {resolve(code)}
            }
            const inspect = (urlString: string) => {
                if (!urlString.startsWith(redirectUri.split('?')[0])) {
                    return
                }
                try {
                    const u = new URL(urlString)
                    const code = u.searchParams.get('code')
                    const errParam = u.searchParams.get('error')
                    const stateBack = u.searchParams.get('state')
                    if (errParam) {
                        finish(null, `${errParam}: ${u.searchParams.get('error_description') ?? ''}`)
                        return
                    }
                    if (stateBack && stateBack !== state) {
                        finish(null, 'OAuth2 state mismatch — possible CSRF; aborting')
                        return
                    }
                    if (code) {finish(code)}
                } catch { /* not a URL we care about */ }
            }
            win.webContents.on('will-redirect', (_e: any, urlString: string) => inspect(urlString))
            win.webContents.on('will-navigate', (_e: any, urlString: string) => inspect(urlString))
            win.on('closed', () => finish(null))
            win.loadURL(authUrl).catch((e: any) => finish(null, e?.message ?? 'Failed to open authorization URL'))
        })
    }

    private randomStr (length: number): string {
        const bytes = new Uint8Array(length)
        crypto.getRandomValues(bytes)
        // Base64-URL without padding — keeps the verifier RFC-7636-clean.
        return btoa(String.fromCharCode(...bytes))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
            .slice(0, length)
    }

    private async sha256Base64Url (input: string): Promise<string> {
        const data = new TextEncoder().encode(input)
        const digest = await crypto.subtle.digest('SHA-256', data)
        const b = new Uint8Array(digest)
        return btoa(String.fromCharCode(...b))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    }
}
