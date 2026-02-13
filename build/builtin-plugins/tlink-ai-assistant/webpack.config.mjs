import * as path from 'path'
import * as url from 'url'
const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

import config from '../webpack.plugin.config.mjs'

export default () => {
    const cfg = config({
        name: 'tlink-ai-assistant',
        dirname: __dirname,
        externals: [
            // Add any plugin-specific externals here if needed
        ],
        rules: [
            // HTML templates - use raw-loader to return plain strings
            // This ensures Angular receives strings, not module objects
            {
                test: /\.html$/,
                type: 'asset/source',
            },
        ],
    })
    return cfg
}
