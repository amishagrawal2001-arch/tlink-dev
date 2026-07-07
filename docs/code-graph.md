# Code graph

Static dependency graph of the tlink-* workspaces, powered by
[dependency-cruiser](https://github.com/sverweij/dependency-cruiser).

## Commands

| Script | What it does |
| --- | --- |
| `npm run graph` | Whole-monorepo import graph → `docs/code-graph.mmd` (Mermaid) |
| `npm run graph:license` | Focused graph for `tlink-license-client` → `docs/code-graph-license.mmd` |
| `npm run graph:svg` | SVG render (requires `brew install graphviz`) |
| `npm run graph:validate` | Run rules only. Non-zero exit on `error` severity |

## Viewing the graph

**GitHub / VS Code** — `.mmd` files render inline in Mermaid-aware previews. Or
paste the contents into <https://mermaid.live>.

**SVG** — `brew install graphviz` then `npm run graph:svg`. Output is
`docs/code-graph.svg`, open in any browser.

## Rules

Configured in [`.dependency-cruiser.cjs`](../.dependency-cruiser.cjs):

- **no-cross-plugin-src-imports** — `warn`. A plugin importing from another
  plugin's `src/` bypasses the public entry surface; refactor through the
  `tlink-*` alias instead.
- **no-circular** — `warn`. Any circular chain. The current codebase has
  ~290 of these (mostly the `tlink-core/src/api/index.ts` barrel re-exporting
  what it imports); prune deliberately, don't try to fix all at once.
- **no-orphans** — `info`. Files nothing else imports. Excludes barrel
  indexes, tsconfigs, `.d.ts`, and `package.json`.

## When to use it

Best cases in this repo:

1. **State-machine tracing** — e.g. what writes `licenseStatus` in
   `tlink-license-client`. Open `code-graph-license.mmd` and follow arrows
   into `tlink-license.service.ts`.
2. **Blast-radius before a rename** — before renaming a symbol on a
   `tlink-core` service, regenerate the whole-monorepo graph and see which
   plugins import that module.
3. **Dead code hunting** — the `no-orphans` info-level output lists files
   nothing imports. Some are false positives (barrel-exported); the rest are
   candidates for deletion.

## Not a call graph

dependency-cruiser tracks *module imports*, not *function call sites*. For
call-graph precision (e.g. "every place that assigns `this.endDate`") the
current best tool is still `git grep` — the license service bug we shipped
in v1.1.1 was found that way. If we ever need programmatic call-graph
analysis, `ts-morph` is the escape hatch.
