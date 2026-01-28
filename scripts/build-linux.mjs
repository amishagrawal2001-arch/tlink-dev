#!/usr/bin/env node
/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
import { build as builder } from 'electron-builder'
import * as childProcess from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as url from 'url'
import * as vars from './vars.mjs'
import { getArtifactSuffix, getExtraResources, isOllamaBundleEnabled } from './bundle-ollama.mjs'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

const isTag = (process.env.GITHUB_REF || '').startsWith('refs/tags/')

process.env.ARCH = (process.env.ARCH || process.arch) === 'arm' ? 'armv7l' : process.env.ARCH || process.arch

const bundleOllama = isOllamaBundleEnabled()
const artifactSuffix = getArtifactSuffix(bundleOllama)
const extraResources = getExtraResources(bundleOllama)

try {
    const rpmbuildReal = childProcess.execSync('command -v rpmbuild', { encoding: 'utf-8' }).trim()
    if (rpmbuildReal) {
        const wrapperPath = path.resolve(__dirname, 'rpmbuild')
        try {
            fs.chmodSync(wrapperPath, 0o755)
        } catch {}
        process.env.RPMBUILD_REAL = rpmbuildReal
        process.env.PATH = `${__dirname}:${process.env.PATH || ''}`
    }
} catch {}

const requestedLinuxArtifacts = (process.env.TLINK_LINUX_ARTIFACTS || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean)

const linuxTargets = requestedLinuxArtifacts.length ? requestedLinuxArtifacts : ['deb', 'tar.gz', 'rpm', 'pacman', 'appimage']

builder({
    dir: true,
    linux: linuxTargets,
    armv7l: process.env.ARCH === 'armv7l',
    arm64: process.env.ARCH === 'arm64',
    config: {
        npmRebuild: false,
        extraMetadata: {
            version: vars.version,
        },
        ...(extraResources ? { extraResources } : {}),
        linux: {
            artifactName: `tlink-\${version}-linux-\${arch}${artifactSuffix}.\${ext}`,
        },
        publish: process.env.KEYGEN_TOKEN ? [
            vars.keygenConfig,
            {
                provider: 'github',
                channel: `latest-${process.env.ARCH}`,
            },
        ] : undefined,
    },
    publish: (process.env.KEYGEN_TOKEN && isTag) ? 'always' : 'never',
}).catch(e => {
    console.error(e)
    process.exit(1)
})
