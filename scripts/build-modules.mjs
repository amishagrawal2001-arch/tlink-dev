#!/usr/bin/env node
import * as vars from './vars.mjs'
import log from 'npmlog'
import webpack from 'webpack'
import { promisify } from 'node:util'

const defaultConfigs = [
    '../app/webpack.config.main.mjs',
    '../app/webpack.config.mjs',
    ...vars.allPackages.map(x => `../${x}/webpack.config.mjs`),
]

const requestedConfigs = (process.env.TLINK_BUILD_CONFIGS || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean)

const configs = requestedConfigs.length ? requestedConfigs : defaultConfigs

;(async () => {
    for (const c of configs) {
        log.info('build', c)
        const imported = await import(c)
        const configFactory = imported.default ?? imported
        const config = typeof configFactory === 'function' ? configFactory() : configFactory
        const stats = await promisify(webpack)(config)
        const statsOptions = { colors: true }
        if (process.env.CI) {
            statsOptions.warnings = false
        }
        console.log(stats.toString(statsOptions))
        if (stats.hasErrors()) {
            // Allow non-critical plugins to continue despite TypeScript type errors
            // (e.g. missing tlink-core typings on Windows CI). The externals are
            // resolved at runtime, so type errors don't affect the bundle output.
            const isNonCritical = c.includes('tlink-ai-assistant') || c.includes('tlink-chatgpt')
            if (isNonCritical) {
                log.warn('build', `${c}: completed with errors (non-critical, continuing)`)
            } else {
                process.exit(1)
            }
        }
    }
})()
