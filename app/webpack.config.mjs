import * as fs from 'fs'
import * as path from 'path'
import wp from 'webpack'
import * as url from 'url'
import { createRequire } from 'module'
const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const require = createRequire(import.meta.url)

import { AngularWebpackPlugin } from '@ngtools/webpack'
import { createEs2015LinkerPlugin } from '@angular/compiler-cli/linker/babel'
const linkerPlugin = createEs2015LinkerPlugin({
    linkerJitMode: true,
    fileSystem: {
        resolve: path.resolve,
        exists: fs.existsSync,
        dirname: path.dirname,
        relative: path.relative,
        readFile: fs.readFileSync,
    },
})

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

export default () => ({
    name: 'tlink',
    target: 'node',
    entry: {
        'index.ignore': 'file-loader?name=index.html!pug-html-loader!' + path.resolve(__dirname, './index.pug'),
        sentry: path.resolve(__dirname, 'lib/sentry.ts'),
        preload: path.resolve(__dirname, 'src/entry.preload.ts'),
        bundle: path.resolve(__dirname, 'src/entry.ts'),
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
        modules: ['src/', 'node_modules', '../node_modules', 'assets/'].map(x => path.join(__dirname, x)),
        extensions: ['.ts', '.js'],
    },
    module: {
        rules: [
            {
                test: /\.(m?)js$/,
                loader: 'babel-loader',
                options: {
                    plugins: [linkerPlugin],
                    compact: false,
                    cacheDirectory: true,
                },
                resolve: {
                    fullySpecified: false,
                },
            },
            {
                test: /\.ts$/,
                use: {
                    loader: '@ngtools/webpack',
                },
            },
            {
                test: /monaco-editor[\\/].*\\.ttf$/,
                type: 'asset/resource',
            },
            { test: /\.scss$/, use: ['style-loader', 'css-loader', 'sass-loader'] },
            { test: /\.css$/, use: ['style-loader', 'css-loader', 'sass-loader'] },
            {
                test: /\.(png|svg|ttf|eot|otf|woff|woff2)(\?v=[0-9]\.[0-9]\.[0-9])?$/,
                type: 'asset',
            },
        ],
    },
    externals: {
        '@electron/remote': 'commonjs @electron/remote',
        'v8-compile-cache': 'commonjs v8-compile-cache',
        child_process: 'commonjs child_process',
        electron: 'commonjs electron',
        fs: 'commonjs fs',
        module: 'commonjs module',
        mz: 'commonjs mz',
        path: 'commonjs path',
    },
    plugins: [
        new wp.optimize.ModuleConcatenationPlugin(),
        new wp.DefinePlugin({
            'process.type': '"renderer"',
        }),
        new AngularWebpackPlugin({
            tsconfig: path.resolve(__dirname, 'tsconfig.json'),
            directTemplateLoading: false,
            jitMode: true,
        })
    ],
})
