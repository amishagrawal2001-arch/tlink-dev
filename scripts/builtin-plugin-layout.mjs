export const passthroughBuiltinPlugins = [
    'tlink-intellij-editor',
]

/**
 * Optional marker files to verify passthrough plugin contents are present.
 * Keys are staged folder names under build/builtin-plugins.
 */
export const passthroughPluginValidation = {
    'tlink-intellij-editor': 'tabby-agent/node/index.js',
}
