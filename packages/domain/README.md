# @elvaria/domain

## Does

- Holds the zod schemas that are the source of the data contracts (ADR 0003): `kingdom`, `territory` and the
  registry files (`kinds`, `classes`, `rituals`, `scripts`, `tags`), with their TypeScript types.
- Checks a registry across its five files (`parseRegistry`, `checkRegistry`): unknown ritual, class, kind or
  step, duplicate ids, a verifier allowed to take work, a class and a kind that disagree.
- Gives the core types every package builds on: `Result`, branded ids (`QuestId`, `TribeId`, ...), `Clock` and
  `Instant`, `zonedTime` (local day and ISO offset in `kingdom.tz`), `IdSource` (ULIDs and dated ids).
- Names every number it decides with in `src/constants.ts`.

## Does not

- Do IO of any kind: no Node built-ins, no `process`, no `Date.now`, `Math.random` or timers (ADR 0002). Time
  and randomness come in through `Clock` and `RandomSource`. Lint, TypeScript (`types: []`) and
  dependency-cruiser each enforce this.
- Throw: failures are `Result` values.
- Know the CLIs or the renderer.

## Depends on

- `zod` only. No other workspace.

## How to test

```bash
pnpm --filter @elvaria/domain test   # vitest with a 100 % coverage gate
```

The schema specs parse the `examples` of the v1 contracts in `docs/schemas/`, so a zod change that drifts
from the reviewed contract fails here first. Specs cannot read files: the domain's program has no Node types.
