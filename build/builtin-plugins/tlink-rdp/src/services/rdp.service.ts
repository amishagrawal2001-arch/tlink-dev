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
        try {
            // Try common paths
            const commonPaths = ['xfreerdp', '/usr/bin/xfreerdp', '/usr/local/bin/xfreerdp']
            
            // On macOS with Homebrew
            if (this.hostApp.platform === Platform.macOS) {
                commonPaths.push('/opt/homebrew/bin/xfreerdp', '/usr/local/bin/xfreerdp')
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
            try {
                const { stdout } = await this.exec('which xfreerdp')
                const foundPath = stdout?.toString().trim()
                if (foundPath) {
                    return foundPath
                }
            } catch {
                // which not available or xfreerdp not found
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
    private async execWithEnv (app: string, argv: string[], env: NodeJS.ProcessEnv): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const { spawn } = require('child_process')
            let errorOutput = ''
            let hasResolved = false
            let hasStarted = false
            
            const child = spawn(app, argv, {
                env,
                detached: true,
                stdio: ['ignore', 'pipe', 'pipe'] // Capture stderr to detect errors
            })
            
            // Capture stderr to detect connection errors
            child.stderr?.on('data', (data: Buffer) => {
                const output = data.toString()
                errorOutput += output
                if (output && !hasStarted) {
                    hasStarted = true
                }
                
                // Check for common connection errors
                if (output.includes('ERRCONNECT') || 
                    output.includes('Failed') ||
                    output.includes('ERROR') ||
                    output.includes('failed to open display')) {
                    if (!hasResolved) {
                        hasResolved = true
                        // Wait a bit to collect more error output
                        setTimeout(() => {
                            try { child.kill() } catch {}
                            reject(new Error(`xfreerdp connection failed:\n${errorOutput}`))
                        }, 500)
                    }
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
    async launchFreeRDP (profile: RDPProfile, parentWindow?: string|null): Promise<void> {
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
            throw new Error('FreeRDP (xfreerdp) is not installed or not found in PATH. Please install it: brew install freerdp (macOS) or apt-get install freerdp2-x11 (Linux)')
        }

        const args: string[] = []

        // Server address
        const host = profile.options.host
        const port = profile.options.port ?? 3389
        args.push(`/v:${host}:${port}`)

        // Credentials
        if (profile.options.user) {
            args.push(`/u:${profile.options.user}`)
        }
        if (profile.options.password) {
            args.push(`/p:${profile.options.password}`)
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

        // Security
        if (profile.options.enableNLA) {
            args.push('/sec:nla')
        } else if (profile.options.enableTLS) {
            args.push('/sec:tls')
        } else {
            args.push('/sec:rdp') // RDP security (SSL)
        }

        if (profile.options.ignoreCertificate) {
            args.push('/cert:ignore')
        }

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

        // Launch xfreerdp
        try {
            // On macOS, ensure DISPLAY environment variable is set for XQuartz
            if (this.hostApp.platform === Platform.macOS) {
                const display = await this.ensureXQuartzDisplay()
                const macEnv = display ? { ...env, DISPLAY: display } : env
                await this.execWithEnv(xfreerdpPath, args, macEnv)
            } else {
                // On other platforms, also use detached spawn for GUI applications
                await this.execWithEnv(xfreerdpPath, args, env)
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
