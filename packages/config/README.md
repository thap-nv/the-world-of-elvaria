# @elvaria/config

## Does

- Holds `boundaries.mjs`, the one table of which workspace may import which (implementation-plan §1.3, ADR 0001).
- Turns that table into ESLint rules (`eslint-boundaries.mjs`) and dependency-cruiser rules (`depcruise.mjs`),
  including the extra limits on `domain` (no IO, ADR 0002) and `hooks` (fast start). The root
  `commitlint.config.mjs` reads it too: a commit scope is a workspace key.
- Exports the shared presets: `eslint.mjs` (`elvaria({ root })`, which also applies `eslint-i18n.mjs`:
  `i18next/no-literal-string` on the output of `apps/cli`, ADR 0014), `prettier.json`, `tsconfig/base.json`
  (no ambient types, for the domain and the browser side) and `tsconfig/node.json`.
- Keeps the patterns behind flaky tests out of every `*.spec.ts` (fix/test-guards, (196)): `eslint-test-time.mjs`
  holds a local plugin whose rules `elvaria/no-real-wait` and `elvaria/no-real-clock` flag real timers, polling
  loops and clock reads (not under `vi.useFakeTimers()`), and `eslint-test-timeout.mjs` holds
  `elvaria/timeout-reason`, a test timeout with no comment saying why. The violations older than the rules sit in
  the repo's `eslint-suppressions.json` (ESLint's bulk suppressions); `suppressions.mjs` tells when that list grew
  or holds an entry it may not (another rule, a spec that is gone).
- Caps a function's `complexity` at 15 in every linted file (AH-02, K9 of docs/plans/architecture-health.md). The
  23 older functions above it sit in the same `eslint-suppressions.json`; `SUPPRESSIBLE_RULES` in
  `suppressions.mjs` lets that rule hold any source file, and a rule the list held nowhere on `main` enters with
  its old violations instead of counting as growth.

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

`depcruise.spec.ts` runs the rules on `__fixtures__/repo`, a fake repo with a planted violation for every graph and
runtime rule and for two of the per-workspace boundary rules;
`eslint-boundaries.spec.ts`, `eslint-i18n.spec.ts` and `eslint-test-time.spec.ts` run the ESLint rules on sample code;
`suppressions.spec.ts` checks the repo's `eslint-suppressions.json` against the one where the branch left `main`
(skipped when git has no `main`, as in a shallow CI checkout, or when the file is newer than that point).
Adding a workspace: add it to `WORKSPACES` (every planned one is listed already), then create `packages/<key>`
or `apps/<key>` named `@elvaria/<key>`; "Adding a package" in docs/guides/repo-handbook.md has the files it needs.
