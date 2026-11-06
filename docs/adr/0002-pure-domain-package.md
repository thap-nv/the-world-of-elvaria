# ADR 0002 · Pure domain package: no IO, injected clock and ids

- Status: accepted · 2026-11-06
- Related: [implementation-plan.md](../implementation-plan.md) §1.3, §2.5, §3.1; [ADR 0001](0001-pnpm-monorepo-lint-enforced-boundaries.md)

## Context

The rules that matter most (quest state machine, verifier selection, breakers, mana state, tick planning) must be testable without a CLI, a disk or a browser, and must be deterministic. `apps/world` and `apps/lite` import types and the WebSocket protocol from the same package inside the browser.

## Decision

- `@elvaria/domain` depends only on zod. Banned: `node:*`, `fs`, `path`, `child_process`, `process.env`, `Date.now`, `Math.random`, `setTimeout`.
- Time and ids are injected (`Clock`, `IdSource`); functions take `now: Instant` explicitly.
- Errors are values: `Result<T, E>`. Domain never throws; IO packages throw `ElvariaError(code)` with codes from `ERROR_CODES`.
- Decisions are pure functions over snapshots (`planTick`, `transition`, `selectVerifier`, `validateVerdict`, `evaluateBreakers`, `decideManaState`, `statusToneOf`); IO packages only execute the returned plan.
- Derived values are functions, never stored: `gearTierOf`, `reputationOf`, `familyOf`, `poolOf`, campaign morale.
- Lint enforces the bans (`no-restricted-imports`, `no-restricted-globals`, `no-restricted-syntax`); coverage gate is 100 % on domain.

## Consequences

- Sandbox days are generated with the same `transition` and `planTick` as real runs, so a fake day is always valid against the state machine.
- Property tests over the transition table and verifier selection are cheap.
- Every IO package passes a clock and an id source; there is no `new Date()` shortcut in the core.
