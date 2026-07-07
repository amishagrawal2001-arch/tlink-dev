/**
 * dependency-cruiser config for tlink-dev.
 *
 * Two goals:
 *   1. Graphs — visualize how the ~24 tlink-* packages import each other,
 *      and drill into hotspots like the license state machine.
 *   2. Rules — enforce a few architectural invariants so cross-package
 *      spaghetti doesn't sneak back in.
 *
 * Usage:
 *   npm run graph            → whole-monorepo SVG
 *   npm run graph:license    → focused SVG for tlink-license-client
 *   npm run graph:validate   → run rules only, no image
 *
 * See https://github.com/sverweij/dependency-cruiser for options.
 */
module.exports = {
    forbidden: [
        // Every tlink-* package is meant to be independently installable;
        // cross-plugin src-to-src imports break that model. Cross-package
        // TYPE imports through the tlink-* alias are still fine — they go
        // through the workspace's public entry (see path aliases below).
        {
            name: 'no-cross-plugin-src-imports',
            comment: 'Plugins should import each other via the tlink-* alias (public entry), not by reaching into a sibling plugin\'s src/ tree. Reason: the built artifact tree does not preserve src/ paths.',
            severity: 'warn',
            from: { path: '^tlink-([^/]+)/src' },
            to: {
                path: '^tlink-(?!$1)([^/]+)/src',
                pathNot: '(^|/)node_modules/',
            },
        },
        // Circular imports inside a single package are always a red flag —
        // they usually mean a service has grown a bidirectional dependency
        // that should be inverted or hoisted.
        {
            name: 'no-circular',
            comment: 'Circular dependency detected. Break the cycle by extracting the shared type/util or inverting the direction.',
            severity: 'warn',
            from: {},
            to: { circular: true },
        },
        // Anything imported but never used is dead weight and confuses
        // the graph. Exclude test setups and barrel indexes which look
        // orphaned but exist for tsconfig include reasons.
        {
            name: 'no-orphans',
            severity: 'info',
            from: {
                orphan: true,
                pathNot: [
                    '\\.d\\.ts$',
                    'tsconfig.*\\.json$',
                    'package\\.json$',
                    '/index\\.ts$',
                ],
            },
            to: {},
        },
    ],

    options: {
        // TypeScript sources only — skip the compiled build/ mirror and
        // vendored artifacts.
        doNotFollow: {
            path: [
                'node_modules',
                'build',
                'app/lib',
                'app/src',
                'third_party',
            ],
        },
        exclude: {
            path: [
                'node_modules',
                'build',
                '\\.d\\.ts$',
                '\\.spec\\.ts$',
                '\\.test\\.ts$',
                'third_party',
            ],
        },
        tsConfig: { fileName: 'tsconfig.json' },
        // Use the TypeScript pre-compilation resolver so `import 'tlink-*'`
        // aliases from the root tsconfig actually resolve to the sibling
        // package's src/ tree.
        enhancedResolveOptions: {
            exportsFields: ['exports'],
            conditionNames: ['import', 'require', 'node', 'default', 'types'],
            mainFields: ['main', 'types', 'typings'],
        },
        // For the whole-monorepo graph, collapse detail below the first
        // src/ segment of each package so the picture stays legible.
        // Individual package graphs get finer detail.
        reporterOptions: {
            dot: {
                collapsePattern: '^tlink-[^/]+/src/[^/]+',
                theme: {
                    graph: { rankdir: 'LR', splines: 'true', bgcolor: 'transparent' },
                    node: { fontname: 'Helvetica', fontsize: 10, shape: 'box', style: 'rounded,filled', fillcolor: '#f6f8fa', color: '#d0d7de' },
                    edge: { color: '#8b949e', arrowsize: 0.7 },
                    modules: [
                        { criteria: { source: '^tlink-license-client' }, attributes: { fillcolor: '#dbeafe', color: '#2563eb' } },
                        { criteria: { source: '^tlink-core' }, attributes: { fillcolor: '#f0fdf4', color: '#16a34a' } },
                        { criteria: { source: '^tlink-electron' }, attributes: { fillcolor: '#fef3c7', color: '#d97706' } },
                        { criteria: { source: '^tlink-settings' }, attributes: { fillcolor: '#fce7f3', color: '#db2777' } },
                    ],
                },
            },
            // The focused license graph doesn't collapse — we want every
            // module visible so the state machine's writers/readers are
            // findable at a glance.
            archi: {
                collapsePattern: '^(tlink-[^/]+)',
            },
        },
    },
}
