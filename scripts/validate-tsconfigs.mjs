#!/usr/bin/env node
/**
 * Validates that all plugin tsconfig.json files have explicit paths
 * for cross-platform TypeScript module resolution (especially Windows).
 *
 * Run: node scripts/validate-tsconfigs.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import * as url from 'url'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

// Plugins that must have tlink-* paths (excludes standalone modules)
const SKIP_PLUGINS = new Set([
    'tlink-license-client',  // standalone, own tsconfig
    'tlink-ai-assistant',    // has custom paths
])

const errors = []

function parseJsoncFile (filePath) {
    const content = fs.readFileSync(filePath, 'utf-8')
    // Strip trailing commas (tsconfig allows JSONC)
    const cleaned = content.replace(/,(\s*[}\]])/g, '$1')
    return JSON.parse(cleaned)
}

// 1. Validate root tsconfig has baseUrl
const rootTsconfig = parseJsoncFile(path.join(repoRoot, 'tsconfig.json'))
if (!rootTsconfig.compilerOptions?.baseUrl) {
    errors.push('tsconfig.json: missing compilerOptions.baseUrl (required for Windows path resolution)')
}

// 2. Validate each plugin tsconfig has explicit paths
const pluginDirs = fs.readdirSync(repoRoot)
    .filter(d => d.startsWith('tlink-') && !SKIP_PLUGINS.has(d))
    .filter(d => fs.statSync(path.join(repoRoot, d)).isDirectory())
    .filter(d => fs.existsSync(path.join(repoRoot, d, 'tsconfig.json')))

for (const plugin of pluginDirs) {
    const tsconfigPath = path.join(repoRoot, plugin, 'tsconfig.json')
    let tsconfig
    try {
        tsconfig = parseJsoncFile(tsconfigPath)
    } catch (e) {
        errors.push(`${plugin}/tsconfig.json: invalid JSON — ${e.message}`)
        continue
    }

    const extendsParent = tsconfig.extends === '../tsconfig.json'
    if (!extendsParent) {
        continue // standalone tsconfig, skip
    }

    const paths = tsconfig.compilerOptions?.paths
    if (!paths) {
        errors.push(`${plugin}/tsconfig.json: missing compilerOptions.paths (required for Windows cross-platform module resolution)`)
        continue
    }

    const hasTlinkPath = Object.keys(paths).some(k => k.startsWith('tlink-'))
    if (!hasTlinkPath) {
        errors.push(`${plugin}/tsconfig.json: paths missing "tlink-*" mapping (required for Windows module resolution)`)
    }
}

// 3. Report results
if (errors.length > 0) {
    console.error('\n❌ tsconfig validation failed:\n')
    for (const err of errors) {
        console.error(`  • ${err}`)
    }
    console.error(`\n${errors.length} error(s) found. Fix them to ensure Windows CI builds pass.\n`)
    process.exit(1)
} else {
    console.log(`✅ All ${pluginDirs.length} plugin tsconfigs validated successfully.`)
}
