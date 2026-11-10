# ADR 0001 · pnpm monorepo with package-level architecture boundaries enforced by lint

- Status: accepted · 2026-11-06
- Related: [implementation-plan.md](../implementation-plan.md) §1.1–§1.4

## Context

Elvaria has three layers (work engine, event bus, world renderer; principle 1 of [the product plan](../ke-hoach-dung-elvaria-0.8.md)). The renderer must never call back into the work engine. A folder convention does not survive many agent sessions: an import that crosses a layer looks harmless in a diff. The first territory, dc1-se-team, already uses pnpm 10, Node 24 and ESLint 9, so the user and the agents know this tooling.

## Decision

- pnpm workspaces, ESM only, Node ≥ 24; `tsx` in dev and tests, `tsc -b` only to package the CLI. (Amended 2026-11-07, P0-11, after P0-08 and P1-08: no `tsx` and no project references. Node 24 runs `.ts` directly by type stripping and `exports` point at `src/index.ts`; only what must ship as JS builds with `tsc -p`: `apps/cli/dist/`, and `packages/eventlog` + `packages/hooks` for the hook's 100 ms budget. Implementation-plan §7.)
- Each package is a real boundary with its own `package.json`: 17 packages (`config, domain, eventlog, store, registry-default, runner-core, runner-claude, runner-antigravity, runner-gemini, hooks, steward, chancellor, herald, sandbox, i18n, ui-kit, ui`) and 3 apps (`cli, world, lite`). `runner-antigravity` (← `runner-core`) comes from the runner design (§3.7) and is added to the repo map here.
- One source: `packages/config/boundaries.mjs` exports `{ package: allowedDeps[] }`, exactly the DAG in §1.3.
- Three layers read that table: ESLint `no-restricted-imports` per package (instant feedback in the editor); dependency-cruiser in `pnpm boundaries` (no cycles, `dependencies` match real imports, no deep imports past `exports`; CI and pre-push); tsconfig project references. (Amended 2026-11-07, P0-11: no workspace has project references; the third layer is pnpm linking only declared workspaces, so TypeScript cannot resolve most undeclared ones. The root's own devDependencies are visible from every workspace, so dependency-cruiser stays the gate. `commitlint` also reads the table: a commit scope is a workspace key.)
- `apps/cli` is the only composition root; it injects the concrete runners into the Steward.
- `packages/config/boundaries.spec.ts` asserts the table is a DAG, `domain` and `i18n` have no deps, and `herald` reaches neither `steward` nor any `runner-*`. (P0-01 added: `ui-kit` has no deps, the browser side reaches only `domain`, `i18n`, `ui-kit`, `ui`, only `cli` imports a concrete runner, and each workspace's `package.json` follows the table.)

## Alternatives

- One package with path-based lint: cheaper at first, but `package.json` leaks deps and TypeScript resolves everything.
- Nx or Turborepo: a task graph we do not need yet, and one more tool for agents to learn.

## Consequences

- A third runner is a new package plus one registration line in `apps/cli`; the core does not change.
- Deleting `apps/world` breaks nothing outside it.
- Every new edge is a change to `boundaries.mjs`, reviewed like code.
