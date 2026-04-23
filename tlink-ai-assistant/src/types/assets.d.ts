// Ambient declarations so TypeScript accepts raw-string imports produced by
// webpack's `asset/source` rules. Both `.md` and `.html` rules are configured
// in `webpack.config.mjs`; the `.html` case is already in use by Angular
// components (templateUrl), this adds explicit coverage for `.md` docs we
// want to render in-app (e.g. README-vllm.md in the vLLM provider setup).
declare module '*.md' {
    const content: string
    export default content
}
