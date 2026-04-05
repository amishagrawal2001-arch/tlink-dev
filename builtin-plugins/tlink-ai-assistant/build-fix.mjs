#!/usr/bin/env node
// Post-build fix script for template requires
// Ensures Angular receives strings from module.default
// Cross-platform replacement for BUILD_FIX_SCRIPT.sh

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const distPath = path.join(__dirname, 'dist', 'index.js')

if (!fs.existsSync(distPath)) {
    console.log('dist/index.js not found, skipping template fix')
    process.exit(0)
}

console.log('Applying template fix...')

let content = fs.readFileSync(distPath, 'utf-8')

const pattern = /template:\s*(__webpack_require__\([^)]+\))(?!\.default)/g
const matches = content.match(pattern)

if (matches && matches.length > 0) {
    content = content.replace(pattern, 'template: (($1).default || $1)')
    fs.writeFileSync(distPath, content, 'utf-8')
    console.log(`Fixed ${matches.length} template require() calls`)
} else {
    console.log('All templates already fixed')
}
