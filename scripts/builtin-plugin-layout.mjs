export const passthroughBuiltinPlugins = [
    'builtin-plugins/tlink-agent-mcp',
    'tlink-intellij-editor',
]

/**
 * Optional marker files to verify passthrough plugin contents are present.
 * Keys are staged folder names under build/builtin-plugins.
 */
export const passthroughPluginValidation = {
    'tlink-agent-mcp': 'package.json',
    'tlink-intellij-editor': 'tabby-agent/node/index.js',
}
