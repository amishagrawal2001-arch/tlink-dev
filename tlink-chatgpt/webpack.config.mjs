import * as path from 'path'
import * as url from 'url'
const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

import config from '../webpack.plugin.config.mjs'

export default () => {
    const cfg = config({
        name: 'chatgpt',
        dirname: __dirname,
    })
    // Force the ESM build of marked. Alias alone isn't enough: the shared
    // plugin webpack config's `mainFields: ['esm2015', 'browser', 'module',
    // 'main']` reaches `browser` first, which points at the UMD build, and
    // webpack's harmony-import interop over that CJS wrapper hands us an
    // object with no `.setOptions`/`.parse` methods (the exact
    // `markedFn.setOptions is not a function` runtime error). Drop `browser`
    // from mainFields specifically for this plugin so `module:
    // ./lib/marked.esm.js` wins instead.
    cfg.resolve.mainFields = cfg.resolve.mainFields.filter(f => f !== 'browser')
    return cfg
}
