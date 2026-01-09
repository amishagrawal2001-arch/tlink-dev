import * as path from 'path'
import * as url from 'url'
import * as fs from 'fs'
import { createRequire } from 'module'
const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const require = createRequire(import.meta.url)

function copyMonacoAssets () {
    try {
        const monacoRoot = path.dirname(require.resolve('monaco-editor/package.json'))
        const src = path.join(monacoRoot, 'min')
        const dest = path.join(__dirname, 'dist/assets/monaco')
        fs.rmSync(dest, { recursive: true, force: true })
        fs.mkdirSync(dest, { recursive: true })
        fs.cpSync(src, dest, { recursive: true })
    } catch (err) {
        console.warn('Monaco assets not copied:', err?.message ?? err)
    }
}

copyMonacoAssets()


const externals = {}
for (const key of [
    'child_process',
    'crypto',
    'dns',
    'fs',
    'http',
    'https',
    'net',
    'path',
    'querystring',
    'tls',
    'tty',
    'zlib',
    '../build/Release/cpufeatures.node',
    './crypto/build/Release/sshcrypto.node',
]) {
    externals[key] = `commonjs ${key}`
}

const config = {
    name: 'tlink-web-entry',
    target: 'web',
    entry: {
        preload: path.resolve(__dirname, 'entry.preload.ts'),
        bundle: path.resolve(__dirname, 'entry.ts'),
    },
    mode: process.env.TLINK_DEV ? 'development' : 'production',
    optimization:{
        minimize: false,
    },
    context: __dirname,
    devtool: 'source-map',
    output: {
        path: path.join(__dirname, 'dist'),
        pathinfo: true,
        filename: '[name].js',
        publicPath: 'auto',
    },
    resolve: {
        modules: ['../app/node_modules', 'node_modules', '../node_modules', '../app/assets/'].map(x => path.join(__dirname, x)),
        extensions: ['.ts', '.js'],
        fallback: {
            stream: path.join(__dirname, 'node_modules/stream-browserify/index.js'),
            assert: path.join(__dirname, 'node_modules/assert/assert.js'),
            constants: path.join(__dirname, 'node_modules/constants-browserify/constants.json'),
            util: path.join(__dirname, 'node_modules/util/util.js'),
        },
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: {
                    loader: 'ts-loader',
                    options: {
                        configFile: path.resolve(__dirname, 'tsconfig.json'),
                    },
                },
            },
            { test: /\.scss$/, use: ['style-loader', 'css-loader', 'sass-loader'] },
            { test: /\.css$/, use: ['style-loader', 'css-loader', 'sass-loader'] },
            {
                test: /\.(png|svg|ttf|eot|otf|woff|woff2)(\?v=[0-9]\.[0-9]\.[0-9])?$/,
                type: 'asset',
            },
        ],
    },
    externals,
}

export default () => config
