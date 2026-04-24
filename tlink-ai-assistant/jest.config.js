// Minimal jest config for the AI-assistant plugin's sanity tests.
//
// These tests cover the pure-function invariants we keep re-breaking —
// the risk-pattern catalog, the retry-status decision, the unified-diff
// line-ending round-trip, and the provider transformMessages shape. They
// do NOT exercise Angular DI or streaming Observables; those are covered
// end-to-end via manual testing through the sidebar.
//
// Run: (from the plugin root) `npx jest` or `yarn test`.
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['<rootDir>/tests/**/*.spec.ts'],
    moduleNameMapper: {
        // Angular imports pulled in transitively by some services — we
        // don't exercise DI in these tests, so stub the module out.
        '^@angular/core$': '<rootDir>/tests/stubs/angular-core.ts'
    },
    transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: { esModuleInterop: true, target: 'es2020', module: 'commonjs', strict: false } }]
    }
};
