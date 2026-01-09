import { promisify } from 'util'


export class PluginManager {
    npm: any
    npmReady?: Promise<void>

    private configureNpm (npm: any): void {
        const registry = process.env.TLINK_NPM_REGISTRY ?? process.env.NPM_CONFIG_REGISTRY
        if (registry) {
            npm.config.set('registry', registry)
        }
        const cafile = process.env.TLINK_NPM_CAFILE ?? process.env.NODE_EXTRA_CA_CERTS
        if (cafile) {
            npm.config.set('cafile', cafile)
        }
        const strictSSL = process.env.TLINK_NPM_STRICT_SSL ?? process.env.NPM_CONFIG_STRICT_SSL
        if (strictSSL !== undefined) {
            const enabled = ['1', 'true', 'yes'].includes(String(strictSSL).toLowerCase())
            npm.config.set('strict-ssl', enabled)
        }
    }

    async ensureLoaded (): Promise<void> {
        if (!this.npmReady) {
            this.npmReady = new Promise(resolve => {
                const npm = require('npm')
                npm.load(err => {
                    if (err) {
                        console.error(err)
                        return
                    }
                    npm.config.set('global', false)
                    this.configureNpm(npm)
                    this.npm = npm
                    resolve()
                })
            })
        }
        return this.npmReady
    }

    async install (path: string, name: string, version: string): Promise<void> {
        await this.ensureLoaded()
        this.npm.prefix = path
        return promisify(this.npm.commands.install)([`${name}@${version}`])
    }

    async uninstall (path: string, name: string): Promise<void> {
        await this.ensureLoaded()
        this.npm.prefix = path
        return promisify(this.npm.commands.remove)([name])
    }
}


export const pluginManager = new PluginManager()
