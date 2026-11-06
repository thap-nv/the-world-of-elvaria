# @elvaria/config

## Does

- Holds `boundaries.mjs`, the one table of which workspace may import which (implementation-plan §1.3, ADR 0001).
- Turns that table into ESLint rules (`eslint-boundaries.mjs`) and dependency-cruiser rules (`depcruise.mjs`),
  including the extra limits on `domain` (no IO, ADR 0002) and `hooks` (fast start). The root
  `commitlint.config.mjs` reads it too: a commit scope is a workspace key.
- Exports the shared presets: `eslint.mjs` (`elvaria({ root })`, which also applies `eslint-i18n.mjs`:
  `i18next/no-literal-string` on the output of `apps/cli`, ADR 0014), `prettier.json`, `tsconfig/base.json`
  (no ambient types, for the domain and the browser side) and `tsconfig/node.json`.

## Does not

- Ship at runtime: every workspace may list it in `devDependencies` and use it from config files, never from
  shipped code (`DEV_ONLY`).
- Run the tools: the root `eslint.config.mjs`, `.dependency-cruiser.mjs`, `.prettierrc.json` and
  `tsconfig.json` load these presets.

## Depends on

- No other workspace. ESLint and its plugins, because `eslint.mjs` imports them.

## How to test

```bash
pnpm --filter @elvaria/config test   # boundaries.spec.ts: the table is a DAG and on-disk manifests follow it
pnpm boundaries                       # depcruise over the real repo
```

`depcruise.spec.ts` runs the rules on `__fixtures__/repo`, a fake repo with one planted violation per rule;
`eslint-boundaries.spec.ts` and `eslint-i18n.spec.ts` run the ESLint rules on sample code.
Adding a workspace: add it to `WORKSPACES` (every planned one is listed already), then create `packages/<key>`
or `apps/<key>` named `@elvaria/<key>`; CLAUDE.md "Adding a package" has the files it needs.
