# ADR 0002 · Pure domain package: no IO, injected clock and ids

- Status: accepted · 2026-11-06
- Related: [implementation-plan.md](../implementation-plan.md) §1.3, §2.5, §3.1; [ADR 0001](0001-pnpm-monorepo-lint-enforced-boundaries.md)

## Context

The rules that matter most (quest state machine, verifier selection, breakers, mana state, tick planning) must be testable without a CLI, a disk or a browser, and must be deterministic. `apps/world` and `apps/lite` import types and the WebSocket protocol from the same package inside the browser.

## Decision

- `@elvaria/domain` depends only on zod. Banned: `node:*`, `fs`, `path`, `child_process`, `process.env`, `Date.now`, `Math.random`, `setTimeout`. (P0-01 widened it: every Node built-in, `process`, `Buffer`, `fetch`, `crypto`, `performance`, every timer and `new Date()` without arguments, in shipped code; specs, `__fixtures__` and config files are exempt.)
- Time, randomness and ids are injected (`Clock`, `RandomSource`, `IdSource`); functions take `now: Instant` explicitly.
- Errors are values: `Result<T, E>`. Domain never throws; IO packages throw `ElvariaError(code)` with codes from `ERROR_CODES`. (Amended 2026-11-07, P0-11: there is no shared `ElvariaError` or `ERROR_CODES`. Each package has its own coded values, which callers translate by `code`: `StoreIssue`, `RegistryIssue`, `ArgsError` as values, `EventLogError` thrown; an IO failure nobody can act on is thrown as is.)
- Decisions are pure functions over snapshots (`planTick`, `transition`, `selectVerifier`, `validateVerdict`, `evaluateBreakers`, `decideManaState`, `statusToneOf`); IO packages only execute the returned plan.
- Derived values are functions, never stored: `gearTierOf`, `reputationOf`, `familyOf`, `poolOf`, campaign morale. (Today `reputationOf`, `affinityOf`, `titleOf`; the others come with their tasks.)
- Lint enforces the bans (`no-restricted-imports`, `no-restricted-globals`, `no-restricted-syntax`); coverage gate is 100 % on domain.

## Consequences

- Sandbox days are generated with the same `transition` and `planTick` as real runs, so a fake day is always valid against the state machine.
- Property tests over the transition table and verifier selection are cheap.
- Every IO package passes a clock and an id source; there is no `new Date()` shortcut in the core.
