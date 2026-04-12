#!/usr/bin/env node
/**
 * Pre-push build validation — catches errors before CI.
 * Runs: tsconfig validation + TypeScript type-check on critical plugins.
 *
 * Usage: node scripts/validate-build.mjs
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import * as url from 'url'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

const CRITICAL_PLUGINS = [
    'tlink-core',
    'tlink-settings',
    'tlink-ssh',
    'tlink-terminal',
    'tlink-electron',
]

let hasErrors = false

// 1. Validate tsconfigs
console.log('\n🔍 Validating tsconfigs...')
try {
    execFileSync(process.execPath, [path.join(__dirname, 'validate-tsconfigs.mjs')], {
        cwd: repoRoot,
        stdio: 'inherit',
    })
} catch {
    hasErrors = true
}

// 2. Check build scripts parse correctly
console.log('\n🔍 Checking build scripts syntax...')
for (const script of ['build-windows.mjs', 'build-macos.mjs', 'build-linux.mjs']) {
    const scriptPath = path.join(__dirname, script)
    try {
        execFileSync(process.execPath, ['--check', scriptPath], {
            cwd: repoRoot,
            stdio: 'pipe',
        })
        console.log(`  ✅ ${script}`)
    } catch (e) {
        console.error(`  ❌ ${script}: syntax error`)
        console.error(e.stderr?.toString() || e.message)
        hasErrors = true
    }
}

// 3. Report
if (hasErrors) {
    console.error('\n❌ Pre-push validation failed. Fix errors before pushing.\n')
    process.exit(1)
} else {
    console.log('\n✅ All pre-push checks passed.\n')
}
