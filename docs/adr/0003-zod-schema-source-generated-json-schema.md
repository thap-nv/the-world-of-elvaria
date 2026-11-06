# ADR 0003 · zod is the schema source; JSON Schema in docs/ is generated and drift-checked

- Status: accepted · 2026-11-06
- Related: [implementation-plan.md](../implementation-plan.md) §2.1, §2.3; [quest.schema.json](../schemas/quest.schema.json)

## Context

Kingdom files, events and inbox commands are read by several packages, by the hooks of two CLIs, and by the user editing JSON by hand. Types and runtime validation must come from one place, and people and agents need a readable contract outside TypeScript.

## Decision

- zod v4 schemas in `packages/domain/src/schema/*.ts` are the source: TS types via `z.infer`, validation at every IO boundary. (One folder per larger contract, `src/schema/**`; `CONTRACTS` names the 17.)
- `pnpm schemas` writes `docs/schemas/<name>.schema.json` with `z.toJSONSchema()` (JSON Schema 2020-12, `$id` `https://elvaria.dev/schemas/<name>/v1`). CI runs `git diff --exit-code docs/schemas`, like the OpenAPI drift check in dc1. (`pnpm schemas --check`, part of `pnpm check`, compares without writing; CI runs it before `git diff`, which misses a new file.)
- The v1 files in `docs/schemas/` were hand-written on 2026-11-06 for review. Task P0-03 turns them into generated output; any difference is explained in that commit. (Done in P0-03, a88bfbf. A contract's `examples` come from `packages/domain/examples/<name>.json`, which the specs parse.)
- Every JSON file has a top-level integer `version`; every event line has `v`. An incompatible change bumps it.
- Migrations live in `packages/store/src/migrations/<entity>/v<n>-to-v<n+1>.ts` as pure `(old: unknown) => unknown`, each with a fixture. Read → migrate → validate → use; the file is rewritten on the next write; `elvaria migrate` rewrites everything once, with a backup in `.backup/<ts>/`.
- The event log is never rewritten: readers upgrade each line by `v`, and every old `v` keeps its migration forever. A snapshot with a stale `version` is dropped and rebuilt from the log.
- Unknown event types are kept by readers and ignored by renderers (forward compatible).

## Consequences

- After P0-03, editing a `.schema.json` by hand is forbidden; change the zod source and run `pnpm schemas`.
- A test reads every old fixture with the current store.
