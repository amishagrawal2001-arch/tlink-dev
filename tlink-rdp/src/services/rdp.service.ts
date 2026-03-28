import { Injectable } from '@angular/core'
import { exec as execCallback } from 'child_process'
import { promisify } from 'util'
import * as path from 'path'
import * as fs from 'fs'
import { HostAppService, Platform } from 'tlink-core'
import { RDPProfile } from '../api'

@Injectable({ providedIn: 'root' })
export class RDPService {
    private exec = promisify(execCallback)

    constructor (
        private hostApp: HostAppService,
    ) { }

    /**
     * Best-effort check/start XQuartz and return a DISPLAY value (macOS only)
     */
    private async ensureXQuartzDisplay (): Promise<string|undefined> {
        // If DISPLAY is already set, use it
        if (process.env.DISPLAY) {
            return process.env.DISPLAY
        }

        // Try common XQuartz app path
        const xquartzApp = '/Applications/Utilities/XQuartz.app'
        const x11Socket = '/tmp/.X11-unix/X0'

        const exists = (p: string) => {
            try { return fs.existsSync(p) } catch { return false }
        }

        if (!exists(xquartzApp)) {
            const err = new Error('MISSING_XQUARTZ') as any
            err.code = 'MISSING_XQUARTZ'
            throw err
        }

        // Try to start XQuartz if not already running
        try {
            await this.exec('open -a XQuartz')
            await new Promise(resolve => setTimeout(resolve, 2500))
        } catch {
            // ignore
        }

        // Try to find the actual DISPLAY value from launchd
        // Electron apps launched from Dock don't inherit shell DISPLAY
        try {
            const { stdout } = await this.exec('launchctl getenv DISPLAY', { timeout: 3000 })
            const display = stdout?.toString().trim()
            if (display) {
                return display
            }
        } catch {
            // ignore
        }

        // Try to get it from running XQuartz process
        try {
            const { stdout } = await this.exec("lsof -c Xquartz 2>/dev/null | grep '/tmp/.*org.xquartz' | head -1 | awk '{print $NF}'", { timeout: 3000 })
            const socketPath = stdout?.toString().trim()
            if (socketPath) {
                return socketPath
            }
        } catch {
            // ignore
        }

        // Fall back to common socket paths
        if (exists(x11Socket)) {
            return ':0'
        }

        throw new Error(
            'XQuartz was detected but DISPLAY is unavailable.\n\n' +
            'Please log out and back in (or reboot) to let XQuartz start, then retry.'
        )
    }

    /**
     * Get the path to bundled xfreerdp executable
     * Returns null if not found
     */
    private getBundledXFreeRDPPath (): string | null {
        try {
            const resourcesPath = (process as any).resourcesPath
            if (!resourcesPath) {
                return null
            }

            // Check for bundled FreeRDP in extras/freerdp/ or extras/xfreerdp/
            const searchDirs = [
                path.join(resourcesPath, 'extras', 'freerdp'),
                path.join(resourcesPath, 'extras', 'xfreerdp'),
            ]

            for (const baseDir of searchDirs) {
                if (!fs.existsSync(baseDir)) {
                    continue
                }

                // Platform-specific binary paths
                // On macOS, prefer sdl-freerdp (native rendering, no XQuartz)
                let candidates: string[]
                if (this.hostApp.platform === Platform.macOS) {
                    candidates = [
                        path.join(baseDir, 'mac', 'sdl-freerdp'),
                        path.join(baseDir, 'mac', 'xfreerdp'),
                    ]
                } else if (this.hostApp.platform === Platform.Windows) {
                    candidates = [path.join(baseDir, 'windows', 'xfreerdp.exe')]
                } else {
                    candidates = [path.join(baseDir, 'linux', 'xfreerdp')]
                }

                for (const binaryPath of candidates) {
                    if (fs.existsSync(binaryPath)) {
                        if (this.hostApp.platform !== Platform.Windows) {
                            try { fs.chmodSync(binaryPath, 0o755) } catch {}
                        }
                        return binaryPath
                    }
                }
            }

            return null
        } catch {
            return null
        }
    }

    /**
     * Get the path to xfreerdp executable
     * Checks bundled version first, then system-installed
     * Returns null if not found
     */
    async getFreeRDPPath (): Promise<string | null> {
        // First, check for bundled xfreerdp
        const bundledPath = this.getBundledXFreeRDPPath()
        if (bundledPath) {
            return bundledPath
        }

        // Fall back to system-installed FreeRDP
        // On macOS, prefer sdl-freerdp (native rendering, no XQuartz needed)
        // FreeRDP v3 uses 'xfreerdp3'/'sdl-freerdp' as binary names; v2 uses 'xfreerdp'
        try {
            const commonPaths = this.hostApp.platform === Platform.macOS
                ? [
                    'sdl-freerdp', 'sdl-freerdp3',
                    '/opt/homebrew/bin/sdl-freerdp', '/opt/homebrew/bin/sdl-freerdp3',
                    '/usr/local/bin/sdl-freerdp', '/usr/local/bin/sdl-freerdp3',
                    'xfreerdp3', 'xfreerdp',
                    '/opt/homebrew/bin/xfreerdp3', '/opt/homebrew/bin/xfreerdp',
                    '/usr/local/bin/xfreerdp3', '/usr/local/bin/xfreerdp',
                ]
                : [
                    'xfreerdp3', 'xfreerdp',
                    '/usr/bin/xfreerdp3', '/usr/bin/xfreerdp',
                    '/usr/local/bin/xfreerdp3', '/usr/local/bin/xfreerdp',
                ]

            // On macOS with Homebrew
            if (this.hostApp.platform === Platform.macOS) {
                commonPaths.push(
                    '/opt/homebrew/bin/xfreerdp3', '/opt/homebrew/bin/xfreerdp',
                    '/usr/local/bin/xfreerdp3', '/usr/local/bin/xfreerdp',
                )
            }

            for (const path of commonPaths) {
                try {
                    // Try to execute with --version to check if it exists
                    await this.exec(`"${path}" --version`, { timeout: 5000 })
                    return path
                } catch {
                    // Try next path
                    continue
                }
            }

            // Try using 'which' command (if available via exec)
            for (const bin of ['xfreerdp3', 'xfreerdp']) {
                try {
                    const { stdout } = await this.exec(`which ${bin}`)
                    const foundPath = stdout?.toString().trim()
                    if (foundPath) {
                        return foundPath
                    }
                } catch {
                    // not found, try next
                }
            }

            return null
        } catch {
            return null
        }
    }

    /**
     * Execute a command with custom environment variables (fallback if platform doesn't support it)
     * For GUI applications like xfreerdp, we use spawn with detached:true so it runs independently
     */
    /**
     * Test TCP connectivity to an RDP host.
     */
    async testConnection (host: string, port: number, timeoutMs = 5000): Promise<{ success: boolean, error?: string, latencyMs?: number }> {
        const net = require('net')
        const start = Date.now()
        return new Promise(resolve => {
            const socket = new net.Socket()
            const timer = setTimeout(() => {
                socket.destroy()
                resolve({ success: false, error: `Connection timed out after ${timeoutMs}ms` })
            }, timeoutMs)

            socket.connect(port, host, () => {
                clearTimeout(timer)
                const latencyMs = Date.now() - start
                socket.destroy()
                resolve({ success: true, latencyMs })
            })

            socket.on('error', (err: Error) => {
                clearTimeout(timer)
                socket.destroy()
                resolve({ success: false, error: err.message })
            })
        })
    }

    private async execWithEnv (app: string, argv: string[], env: NodeJS.ProcessEnv, stdinData?: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const { spawn } = require('child_process')
            let errorOutput = ''
            let hasResolved = false
            let hasStarted = false

            const child = spawn(app, argv, {
                env,
                detached: true,
                stdio: [stdinData ? 'pipe' : 'ignore', 'pipe', 'pipe'],
            })

            // Write stdin data (password for /from-stdin)
            if (stdinData && child.stdin) {
                child.stdin.write(stdinData + '\n')
                child.stdin.end()
            }
            
            // Capture stderr to detect connection errors
            const startTime = Date.now()
            child.stderr?.on('data', (data: Buffer) => {
                const output = data.toString()
                errorOutput += output
                if (output && !hasStarted) {
                    hasStarted = true
                }

                // Only check for fatal errors during the initial connection phase (first 5 seconds).
                // After that, ERRCONNECT_CONNECT_CANCELLED is normal (user closed window).
                const isEarlyPhase = (Date.now() - startTime) < 5000
                if (!isEarlyPhase) return

                // Check for fatal connection errors only.
                // ERRCONNECT_CONNECT_CANCELLED after session start is normal (window close).
                const isFatal = (
                    output.includes('LOGON_FAILURE') ||
                    output.includes('CONNECT_FAILED') ||
                    output.includes('DNS_NAME_NOT_RESOLVED') ||
                    output.includes('DNS_ERROR') ||
                    output.includes('CONNECT_TRANSPORT_FAILED') ||
                    output.includes('SECURITY_NEGO_CONNECT_FAILED') ||
                    output.includes('TLS_CONNECT_FAILED') ||
                    output.includes('AUTHENTICATION_FAILED') ||
                    output.includes('failed to open display') ||
                    output.includes('X server not available')
                )
                if (isFatal && !hasResolved) {
                    hasResolved = true
                    setTimeout(() => {
                        try { child.kill() } catch {}
                        reject(new Error(`xfreerdp connection failed:\n${errorOutput}`))
                    }, 500)
                }
            })
            
            // Check for immediate process exit (connection failure)
            child.on('exit', (code: number, signal: string) => {
                if (hasResolved) return
                hasResolved = true

                if (code !== 0 && code !== null) {
                    reject(new Error(`xfreerdp exited with code ${code}${errorOutput ? `:\n${errorOutput}` : ''}`))
                } else if (signal) {
                    reject(new Error(`xfreerdp was terminated: ${signal}`))
                } else {
                    resolve()
                }
            })
            
            // Handle immediate errors (process couldn't start)
            child.on('error', (err: Error) => {
                if (!hasResolved) {
                    hasResolved = true
                    reject(err)
                }
            })
            
            // Unref the child process so it can run independently, but wait a bit first
            // to catch early exit errors. Require that we saw any output (hasStarted) before
            // treating it as launched.
            setTimeout(() => {
                if (!hasResolved) {
                    if (!hasStarted) {
                        hasResolved = true
                        try { child.kill() } catch {}
                        reject(new Error(errorOutput || 'xfreerdp did not start (no output captured)'))
                        return
                    }
                    hasResolved = true
                    try { child.unref() } catch {}
                    resolve()
                }
            }, 2000) // Wait 2 seconds to catch connection errors
        })
    }

    /**
     * Build the xfreerdp argument list for a given profile.
     * If securityOverride is provided, it replaces the profile's security settings.
     */
    private buildFreeRDPArgs (profile: RDPProfile, parentWindow?: string|null, securityOverride?: string): { args: string[], macPluginPath?: string, audioDisabled: boolean } {
        const args: string[] = []

        // Server address
        const host = profile.options.host
        const port = profile.options.port ?? 3389
        args.push(`/v:${host}:${port}`)

        // Credentials — pass password via stdin to avoid exposure in process list
        if (profile.options.user) {
            args.push(`/u:${profile.options.user}`)
        }
        if (profile.options.domain) {
            args.push(`/d:${profile.options.domain}`)
        }

        // Display settings
        if (profile.options.width && profile.options.height) {
            args.push(`/size:${profile.options.width}x${profile.options.height}`)
            args.push('/dynamic-resolution')
        }
        if (profile.options.colorDepth) {
            args.push(`/bpp:${profile.options.colorDepth}`)
        }

        // Features
        const audioRequested = !!profile.options.enableAudio
        let audioAvailable = audioRequested
        let audioDisabled = !audioRequested
        let macPluginPath: string | undefined

        if (audioRequested && this.hostApp.platform === Platform.macOS) {
            const brewPrefix = process.env.HOMEBREW_PREFIX || '/opt/homebrew'
            const prefixes = [brewPrefix, '/usr/local']

            const cellarCandidates: string[] = []
            for (const prefix of prefixes) {
                const cellarRoot = path.join(prefix, 'Cellar', 'freerdp')
                try {
                    if (fs.existsSync(cellarRoot)) {
                        const versions = fs.readdirSync(cellarRoot).filter(v => fs.existsSync(path.join(cellarRoot, v, 'lib', 'freerdp3')))
                        versions.sort().reverse()
                        if (versions.length) {
                            cellarCandidates.push(path.join(cellarRoot, versions[0], 'lib', 'freerdp3'))
                        }
                    }
                } catch {
                    // ignore
                }
            }

            const pluginCandidates = [
                ...prefixes.map(p => path.join(p, 'opt', 'freerdp', 'lib', 'freerdp3')),
                ...prefixes.map(p => path.join(p, 'lib', 'freerdp3')),
                ...cellarCandidates,
            ]

            macPluginPath = pluginCandidates.find(p => fs.existsSync(p))
            if (!macPluginPath) {
                audioAvailable = false
                audioDisabled = true
            }
        }

        if (audioRequested && audioAvailable) {
            if (this.hostApp.platform === Platform.macOS) {
                // Disable audio on macOS — coreaudio plugin causes SIGABRT crashes
                // in FreeRDP 3.x Homebrew builds
                audioDisabled = true
            } else if (this.hostApp.platform === Platform.Linux) {
                args.push('/sound:sys:alsa,format:1,quality:high')
            } else {
                args.push('/sound:sys:pulse')
            }
        } else {
            audioDisabled = true
            if (this.hostApp.platform !== Platform.macOS) {
                args.push('/sound:sys:none', '/audio-mode:0')
            } else {
                args.push('/audio-mode:0')
            }
        }
        if (profile.options.enableClipboard) {
            args.push('+clipboard')
        }
        if (profile.options.enablePrinting) {
            args.push('+printer')
        }
        if (profile.options.enableDrives) {
            args.push('+drives')
        }
        if (profile.options.enableWallpaper) {
            args.push('+wallpaper')
        }
        if (profile.options.enableThemes) {
            args.push('+themes')
        }
        if (profile.options.enableFontSmoothing) {
            args.push('+fonts')
        }

        // Security
        if (securityOverride) {
            args.push(`/sec:${securityOverride}`)
        } else if (profile.options.enableNLA === true) {
            args.push('/sec:nla')
        } else if (profile.options.enableTLS === true) {
            args.push('/sec:tls')
        }

        // Certificate handling
        if (profile.options.ignoreCertificate !== false) {
            args.push('/cert:ignore')
        } else {
            args.push('/cert:tofu')  // Trust-on-first-use — prompt once, remember
        }

        // Lower TLS security level for compatibility with older Windows servers
        args.push('/tls:seclevel:0')

        // Desktop composition
        if (profile.options.enableDesktopComposition) {
            args.push('+aero')
        }

        // Performance — match Windows RDP speed
        args.push('/gfx:RFX')          // RemoteFX graphics pipeline
        args.push('/gdi:hw')            // Hardware-accelerated GDI
        args.push('/network:auto')      // Auto-detect network type
        args.push('+multitransport')    // UDP transport for lower latency
        if (profile.options.compression) {
            args.push('+compression')
        }
        // Note: bitmap caching is enabled by default in FreeRDP 3.x (no flag needed)

        // Custom parameters
        if (profile.options.customParams) {
            const customArgs = profile.options.customParams.trim().split(/\s+/)
            args.push(...customArgs)
        }

        // Embed in parent window on platforms that support it (Windows/Linux)
        if (parentWindow && this.hostApp.platform !== Platform.macOS) {
            args.push(`/parent-window:${parentWindow}`)
        }

        return { args, macPluginPath, audioDisabled }
    }

    /**
     * Build environment variables for xfreerdp launch
     */
    private buildFreeRDPEnv (macPluginPath?: string, audioDisabled = false): NodeJS.ProcessEnv {
        if (this.hostApp.platform === Platform.macOS) {
            const brewPrefix = process.env.HOMEBREW_PREFIX || '/opt/homebrew'
            const prefixes = [brewPrefix, '/usr/local']

            const cellarLibs: string[] = []
            for (const prefix of prefixes) {
                const cellarRoot = path.join(prefix, 'Cellar', 'freerdp')
                try {
                    if (fs.existsSync(cellarRoot)) {
                        const versions = fs.readdirSync(cellarRoot).filter(v => fs.existsSync(path.join(cellarRoot, v, 'lib')))
                        versions.sort().reverse()
                        if (versions.length) {
                            cellarLibs.push(path.join(cellarRoot, versions[0], 'lib'))
                        }
                    }
                } catch {
                    // ignore
                }
            }

            const dyldPaths = [
                macPluginPath ? path.dirname(macPluginPath) : null,
                ...prefixes.map(p => path.join(p, 'opt', 'freerdp', 'lib')),
                ...prefixes.map(p => path.join(p, 'lib')),
                ...cellarLibs,
                process.env.DYLD_LIBRARY_PATH,
            ].filter(Boolean)

            return {
                ...process.env,
                ...(macPluginPath ? { FREERDP_PLUGIN_PATH: macPluginPath } : {}),
                ...(audioDisabled ? { FREERDP_AUDIO_DISABLE: '1' } : {}),
                DYLD_LIBRARY_PATH: Array.from(new Set(dyldPaths)).join(':'),
            }
        }

        if (audioDisabled) {
            return { ...process.env, FREERDP_AUDIO_DISABLE: '1' }
        }

        return process.env
    }

    /**
     * Generate a .rdp file and open it with the system's default RDP handler.
     * On macOS this uses Microsoft Remote Desktop or any other registered handler.
     * Falls back to this method when FreeRDP is unavailable or fails.
     */
    /**
     * Check if a system RDP handler is available (e.g. Microsoft Remote Desktop on macOS)
     */
    async hasSystemRDPHandler (): Promise<boolean> {
        if (this.hostApp.platform === Platform.macOS) {
            return fs.existsSync('/Applications/Microsoft Remote Desktop.app') ||
                   fs.existsSync('/Applications/Windows App.app')
        }
        if (this.hostApp.platform === Platform.Windows) {
            return true // mstsc.exe is always available on Windows
        }
        // Linux: check for remmina, xfreerdp, or rdesktop
        for (const bin of ['remmina', 'xfreerdp', 'xfreerdp3', 'rdesktop', 'xdg-open']) {
            try {
                await this.exec(`which ${bin}`, { timeout: 2000 })
                return true
            } catch {
                continue
            }
        }
        return false
    }

    async launchRDPFile (profile: RDPProfile, password?: string): Promise<void> {
        const os = require('os')
        const host = profile.options.host
        const port = profile.options.port ?? 3389

        // Check for RDP handler
        const hasHandler = await this.hasSystemRDPHandler()
        if (!hasHandler) {
            const err = new Error('MISSING_RDP_CLIENT') as any
            err.code = 'MISSING_RDP_CLIENT'
            err.platform = this.hostApp.platform
            throw err
        }

        // Build .rdp file content
        const lines: string[] = [
            `full address:s:${host}:${port}`,
            'prompt for credentials:i:0',
            `username:s:${profile.options.user || ''}`,
        ]

        if (profile.options.domain) {
            lines.push(`domain:s:${profile.options.domain}`)
        }

        // Display
        const width = profile.options.width ?? 1920
        const height = profile.options.height ?? 1080
        lines.push(`desktopwidth:i:${width}`)
        lines.push(`desktopheight:i:${height}`)

        if (profile.options.colorDepth) {
            lines.push(`session bpp:i:${profile.options.colorDepth}`)
        }

        // Features
        if (profile.options.enableClipboard) {
            lines.push('redirectclipboard:i:1')
        }
        if (profile.options.enableDrives) {
            lines.push('drivestoredirect:s:*')
        }
        if (profile.options.enablePrinting) {
            lines.push('redirectprinters:i:1')
        }
        if (profile.options.enableAudio) {
            lines.push('audiomode:i:0')
        } else {
            lines.push('audiomode:i:2')
        }

        // Security
        lines.push('authentication level:i:0') // No server authentication
        lines.push('negotiate security layer:i:1')

        // Performance
        if (profile.options.enableWallpaper) {
            lines.push('disable wallpaper:i:0')
        }
        if (profile.options.enableThemes) {
            lines.push('disable themes:i:0')
        }
        if (profile.options.enableFontSmoothing) {
            lines.push('allow font smoothing:i:1')
        }

        // Write to temp file
        const tmpDir = os.tmpdir()
        const rdpFileName = `tlink-rdp-${host.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}.rdp`
        const rdpFilePath = path.join(tmpDir, rdpFileName)

        fs.writeFileSync(rdpFilePath, lines.join('\r\n') + '\r\n', 'utf8')

        // If password is available, store it via cmdkey on Windows
        // On macOS, the .rdp handler will prompt for password
        // Launch with system handler
        try {
            const { spawn } = require('child_process')

            if (this.hostApp.platform === Platform.macOS) {
                // Use 'open' command which delegates to Microsoft Remote Desktop or other handler
                const child = spawn('open', [rdpFilePath], { detached: true, stdio: 'ignore' })
                child.unref()
            } else if (this.hostApp.platform === Platform.Windows) {
                // Use mstsc.exe on Windows
                const child = spawn('mstsc.exe', [rdpFilePath], { detached: true, stdio: 'ignore' })
                child.unref()
            } else {
                // Linux: try xdg-open or xfreerdp
                const child = spawn('xdg-open', [rdpFilePath], { detached: true, stdio: 'ignore' })
                child.unref()
            }

            // Clean up temp file after a delay
            setTimeout(() => {
                try { fs.unlinkSync(rdpFilePath) } catch { /* ignore */ }
            }, 10000)
        } catch (error: any) {
            // Clean up on error
            try { fs.unlinkSync(rdpFilePath) } catch { /* ignore */ }
            throw new Error(
                'Failed to open .rdp file.\n\n' +
                'Please install Microsoft Remote Desktop from the App Store,\n' +
                'or another RDP client that handles .rdp files.'
            )
        }
    }

    /**
     * Launch FreeRDP (xfreerdp) as external executable.
     * If auto-negotiation fails with CONNECT_CANCELLED or AUTHENTICATION_FAILED,
     * retries with /sec:tls then /sec:rdp before giving up.
     */
    async launchFreeRDP (profile: RDPProfile, parentWindow?: string|null, password?: string): Promise<void> {
        const xfreerdpPath = await this.getFreeRDPPath()
        if (!xfreerdpPath) {
            if (this.hostApp.platform === Platform.macOS) {
                throw new Error(
                    'FreeRDP (xfreerdp) is required.\n\n' +
                    'Install via Homebrew:\n' +
                    '  brew install freerdp\n\n' +
                    'Then restart the app and try again.'
                )
            }
            if (this.hostApp.platform === Platform.Windows) {
                throw new Error(
                    'FreeRDP (xfreerdp) is required.\n\n' +
                    'Install on Windows using MSYS2:\n' +
                    '1) Install MSYS2\n' +
                    '2) Open the MSYS2 UCRT64 shell and run: pacman -Syu\n' +
                    '3) Then run: pacman -S mingw-w64-ucrt-x86_64-freerdp\n' +
                    '4) Add C:\\msys64\\ucrt64\\bin to PATH\n' +
                    '5) Verify in PowerShell: where xfreerdp\n\n' +
                    'Then restart the app and try again.'
                )
            }
            throw new Error('FreeRDP (xfreerdp) is not installed or not found in PATH. Please install it: apt-get install freerdp2-x11 (Linux)')
        }

        const effectivePassword = password ?? profile.options.password
        const host = profile.options.host
        const port = profile.options.port ?? 3389

        // Remove stale FreeRDP known host keys
        try {
            const homeDir = process.env.HOME || process.env.USERPROFILE || ''
            const knownHostFile = path.join(homeDir, '.config', 'freerdp', 'server', `${host}_${port}.pem`)
            if (fs.existsSync(knownHostFile)) {
                fs.unlinkSync(knownHostFile)
            }
        } catch {
            // ignore — best effort cleanup
        }

        // Determine security modes to try.
        // If user explicitly set a security mode, only try that.
        // Otherwise try NLA first (most Windows servers require it), then auto, tls, rdp.
        const hasExplicitSecurity = profile.options.enableNLA === true || profile.options.enableTLS === true
        const securityModes: Array<string | undefined> = hasExplicitSecurity
            ? [undefined]  // single attempt with profile settings
            : ['nla', undefined, 'tls', 'rdp']

        let lastError: Error | null = null

        for (const secMode of securityModes) {
            const { args, macPluginPath, audioDisabled } = this.buildFreeRDPArgs(profile, parentWindow, secMode)

            // Use /p: for password instead of /from-stdin.
            // FreeRDP 3.x NLA prompts for Domain + Password interactively on stdin,
            // which breaks piped stdin in spawned/detached processes.
            if (effectivePassword) {
                args.push(`/p:${effectivePassword}`)
            }

            const env = this.buildFreeRDPEnv(macPluginPath, audioDisabled)

            try {
                const isSDL = xfreerdpPath.includes('sdl-freerdp')
                if (this.hostApp.platform === Platform.macOS && !isSDL) {
                    // X11-based xfreerdp needs XQuartz + DISPLAY
                    const display = await this.ensureXQuartzDisplay()
                    const macEnv = display ? { ...env, DISPLAY: display } : env
                    await this.execWithEnv(xfreerdpPath, args, macEnv)
                } else {
                    // sdl-freerdp renders natively on macOS (no XQuartz needed)
                    await this.execWithEnv(xfreerdpPath, args, env)
                }
                // Success
                return
            } catch (error: any) {
                const errorMessage = error?.message ?? error?.toString() ?? 'Unknown error'
                const errorOutput = error?.stderr ?? error?.stdout ?? ''

                // Check for X11/DISPLAY errors on macOS — no point retrying with different sec mode
                if (this.hostApp.platform === Platform.macOS &&
                    (errorOutput.includes('failed to open display') ||
                     errorOutput.includes('DISPLAY') ||
                     errorMessage.includes('failed to open display') ||
                     errorMessage.includes('DISPLAY'))) {
                    throw new Error(
                        'FreeRDP needs XQuartz (X11) on macOS. X server not available.\n\n' +
                        'Steps:\n' +
                        '1) Install XQuartz: brew install --cask xquartz (then log out/in once if just installed)\n' +
                        '2) Start XQuartz: open -a XQuartz\n' +
                        '3) Allow local clients: XQuartz → Preferences → Security → check “Allow connections from network clients”\n' +
                        '4) In a terminal before launching Tlink: export DISPLAY=:0 && xhost +localhost\n' +
                        'Then retry the RDP connection.'
                    )
                }

                lastError = error

                // Only retry with fallback sec mode if it was a negotiation failure
                const isNegotiationFailure =
                    errorMessage.includes('CONNECT_CANCELLED') ||
                    errorMessage.includes('SECURITY_NEGO_CONNECT_FAILED') ||
                    errorMessage.includes('TLS_CONNECT_FAILED') ||
                    errorMessage.includes('CONNECT_TRANSPORT_FAILED') ||
                    errorMessage.includes('HYBRID_REQUIRED_BY_SERVER')

                if (!isNegotiationFailure) {
                    // Not a security negotiation issue — don't retry
                    throw error
                }

                // Will try next security mode
            }
        }

        // All attempts exhausted
        throw lastError!
    }
}
