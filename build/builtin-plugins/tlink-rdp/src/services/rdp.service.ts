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
            // Not installed
            throw new Error(
                'XQuartz (X11) is required for FreeRDP on macOS.\n\n' +
                'Please install it and restart:\n' +
                '  brew install --cask xquartz\n\n' +
                'After installation, log out/in (or reboot), then try again.'
            )
        }

        // Try to start XQuartz if not already running
        try {
            await this.exec('open -a XQuartz')
            // Give it a moment to create the socket
            await new Promise(resolve => setTimeout(resolve, 2500))
        } catch {
            // ignore
        }

        if (exists(x11Socket)) {
            return ':0'
        }

        // Still no socket; tell user to relog/reboot
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
                // Not packaged or resourcesPath not available
                return null
            }

            // Packaged: resources/extras/xfreerdp
            const baseDir = path.join(resourcesPath, 'extras', 'xfreerdp')
            if (!fs.existsSync(baseDir)) {
                return null
            }

            // Determine platform-specific binary path
            let binaryPath: string
            if (this.hostApp.platform === Platform.macOS) {
                binaryPath = path.join(baseDir, 'mac', 'xfreerdp')
            } else if (this.hostApp.platform === Platform.Windows) {
                binaryPath = path.join(baseDir, 'windows', 'xfreerdp.exe')
            } else {
                binaryPath = path.join(baseDir, 'linux', 'xfreerdp')
            }

            if (fs.existsSync(binaryPath)) {
                // Make executable on non-Windows
                if (this.hostApp.platform !== Platform.Windows) {
                    try {
                        fs.chmodSync(binaryPath, 0o755)
                    } catch {
                        // Ignore chmod errors
                    }
                }
                return binaryPath
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

        // Fall back to system-installed xfreerdp
        // FreeRDP v3 uses 'xfreerdp3' as binary name; v2 uses 'xfreerdp'
        try {
            const commonPaths = [
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
            child.stderr?.on('data', (data: Buffer) => {
                const output = data.toString()
                errorOutput += output
                if (output && !hasStarted) {
                    hasStarted = true
                }
                
                // Check for fatal connection errors only.
                // FreeRDP v3 logs [ERROR] and [WARN] tags to stderr during
                // normal startup, so only match actual failure indicators.
                const isFatal = output.includes('ERRCONNECT') ||
                    output.includes('LOGON_FAILURE') ||
                    output.includes('failed to open display') ||
                    output.includes('X server not available')
                if (isFatal && !hasResolved) {
                    hasResolved = true
                    // Wait a bit to collect more error output
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
                    // Process exited with error - likely connection failed
                    reject(new Error(`xfreerdp exited with code ${code}${errorOutput ? `:\n${errorOutput}` : ''}`))
                } else if (signal) {
                    reject(new Error(`xfreerdp was terminated: ${signal}`))
                } else {
                    // Process exited normally (0 or null) - might have connected successfully
                    // For GUI apps, normal exit could mean window closed, which is OK
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
                        // No indication of start; give a more helpful message
                        hasResolved = true
                        try { child.kill() } catch {}
                        reject(new Error(errorOutput || 'xfreerdp did not start (no output captured)'))
                        return
                    }
                    // Process is still running after a moment - assume it started successfully
                    // (xfreerdp window should be open)
                    hasResolved = true
                    try { child.unref() } catch {}
                    resolve()
                }
            }, 2000) // Wait 2 seconds to catch connection errors
        })
    }

    /**
     * Launch FreeRDP (xfreerdp) as external executable
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

        const args: string[] = []

        // Server address
        const host = profile.options.host
        const port = profile.options.port ?? 3389
        args.push(`/v:${host}:${port}`)

        // Credentials — pass password via stdin to avoid exposure in process list
        const effectivePassword = password ?? profile.options.password
        if (profile.options.user) {
            args.push(`/u:${profile.options.user}`)
        }
        if (effectivePassword) {
            args.push('/from-stdin')
        }
        if (profile.options.domain) {
            args.push(`/d:${profile.options.domain}`)
        }

        // Display settings
        if (profile.options.width && profile.options.height) {
            args.push(`/size:${profile.options.width}x${profile.options.height}`)
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
            // Prefer Homebrew paths; fall back to Cellar versions if needed
            const brewPrefix = process.env.HOMEBREW_PREFIX || '/opt/homebrew'
            const prefixes = [
                brewPrefix,
                // Intel/Homebrew-on-Intel fallback
                '/usr/local',
            ]

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
                // If we cannot locate the plugin path, disable audio to avoid crashes
                audioAvailable = false
                audioDisabled = true
            }
        }

        if (audioRequested && audioAvailable) {
            // Platform-specific audio backend
            if (this.hostApp.platform === Platform.macOS) {
                args.push('/sound:sys:coreaudio')
            } else if (this.hostApp.platform === Platform.Linux) {
                args.push('/sound:sys:alsa,format:1,quality:high')
            } else {
                // Windows
                args.push('/sound:sys:pulse')
            }
        } else {
            // Explicitly disable sound to avoid FreeRDP probing missing plugins
            audioDisabled = true
            if (this.hostApp.platform !== Platform.macOS) {
                // `none` backend is available on Linux/Windows, but not on macOS bottles
                args.push('/sound:sys:none', '/audio-mode:0')
            } else {
                // On macOS, the Homebrew bottle often lacks the `none` backend. Rely on env to disable.
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
        // Desktop composition is enabled by default in xfreerdp, no flag needed
        // if (profile.options.enableDesktopComposition) {
        //     args.push('+aero')  // Not a valid xfreerdp flag
        // }

        // Security — let FreeRDP auto-negotiate by default.
        // Only force a specific mode if explicitly configured.
        if (profile.options.enableNLA === true) {
            args.push('/sec:nla')
        } else if (profile.options.enableTLS === true) {
            args.push('/sec:tls')
        }
        // Otherwise: omit /sec flag entirely — FreeRDP will try NLA > TLS > RDP automatically

        // Always ignore certificate in non-interactive mode — FreeRDP v3
        // prompts on stdin for cert acceptance which hangs in a spawned process.
        args.push('/cert:ignore')

        // Performance
        if (profile.options.compression) {
            args.push('+compression')
        }
        // Bitmap caching is enabled by default in xfreerdp, no flag needed
        // if (profile.options.bitmapCaching) {
        //     args.push('+bitmap-cache')  // This flag doesn't exist in xfreerdp
        // }

        // Custom parameters
        if (profile.options.customParams) {
            const customArgs = profile.options.customParams.trim().split(/\s+/)
            args.push(...customArgs)
        }

        // Embed in parent window on platforms that support it (Windows/Linux)
        if (parentWindow && this.hostApp.platform !== Platform.macOS) {
            args.push(`/parent-window:${parentWindow}`)
        }

        // Build env (set plugin path on macOS/Homebrew to avoid missing coreaudio/rdpsnd plugins)
        let env = process.env
        if (this.hostApp.platform === Platform.macOS) {
            const brewPrefix = process.env.HOMEBREW_PREFIX || '/opt/homebrew'
            const prefixes = [
                brewPrefix,
                '/usr/local',
            ]

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

            env = {
                ...process.env,
                ...(macPluginPath ? { FREERDP_PLUGIN_PATH: macPluginPath } : {}),
                ...(audioDisabled ? { FREERDP_AUDIO_DISABLE: '1' } : {}),
                DYLD_LIBRARY_PATH: Array.from(new Set(dyldPaths)).join(':'), // dedupe
            }
        } else if (audioDisabled) {
            // On non-mac platforms we can still signal audio disable for consistency
            env = {
                ...process.env,
                FREERDP_AUDIO_DISABLE: '1',
            }
        }

        // Remove stale FreeRDP known host keys that can cause cert verification
        // to fail even with /cert:ignore on FreeRDP v3
        try {
            const homeDir = process.env.HOME || process.env.USERPROFILE || ''
            const knownHostFile = path.join(homeDir, '.config', 'freerdp', 'server', `${host}_${port}.pem`)
            if (fs.existsSync(knownHostFile)) {
                fs.unlinkSync(knownHostFile)
            }
        } catch {
            // ignore — best effort cleanup
        }

        // Launch xfreerdp
        try {
            // On macOS, ensure DISPLAY environment variable is set for XQuartz
            if (this.hostApp.platform === Platform.macOS) {
                const display = await this.ensureXQuartzDisplay()
                const macEnv = display ? { ...env, DISPLAY: display } : env
                await this.execWithEnv(xfreerdpPath, args, macEnv, effectivePassword || undefined)
            } else {
                await this.execWithEnv(xfreerdpPath, args, env, effectivePassword || undefined)
            }
        } catch (error: any) {
            const errorMessage = error?.message ?? error?.toString() ?? 'Unknown error'
            const errorOutput = error?.stderr ?? error?.stdout ?? ''
            
            // Check for X11/DISPLAY errors on macOS
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
            
            // Re-throw the original error
            throw error
        }
    }
}
