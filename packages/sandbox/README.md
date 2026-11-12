# @elvaria/sandbox

## Does

- Generates fake days (implementation-plan §7): `simulateDay({ day, seed, date, kingdom, registry })` plays one
  day of the scenario `busy`, `quiet` or `mana-out` and returns its event lines, the empty morning it starts
  from and the files of its evening. Pure: the same day, seed, date and kingdom give the same lines.
- Keeps every day valid by construction: quests move only through the domain's `transition()`, characters
  through `transitionCharacter()`, claims come from the domain's `planTick`, and every line is written in the
  contract of P0-09 (`questLogTypeOf` names quest moves, `data` carries the views after them), checked by
  `EventSchema`. A refused move is a bug in the sandbox and throws, so the specs are an integration test of the
  domain too.
- Draws what characters do from pure scenario tables (`src/scenarios.ts`): when quests arrive, how sessions end
  (submitted, crashed, a question, the time breaker), what verdicts say, when the owner seals, answers or
  retries, and in `mana-out` when the Claude pool runs dry and wakes. Randomness is a seeded `Dice`
  (mulberry32), also behind the day's `IdSource`.
- Plays the Steward's tick as the domain plans it (`planTick`, P1-04): suspensions on a fail streak, the judge
  `selectVerifier` chose for each submitted quest (the machine's pass under `machine_only`), returned quests sent
  back, claims; then a fresh session for an answered quest, delivery of done quests, and after each verdict the
  domain's `withVerdict` (reputation, tag windows, fail streak) and `levelChange`. Verdict lines use the domain's
  verdict ids (`-p<k>` for a partial, `-user` for the owner's seal). A fake quest's ceilings are the Steward's:
  the domain's `questBudgetOf` for the Chancellor's estimate of its rank (P1-46).
- Writes and reads day files: `writeDay` replaces `events/sandbox/<date>.jsonl` in one atomic write (redacted,
  ADR 0013); `readDay` reads it with the event log's reader. `scenarioProblems` names what a kingdom lacks
  (a tribe of the cast, a class, kind, script or tag) before a day is played.
- Schedules a replay: `replaySchedule(events, speed)` (the wait before each line), `replaySpan`, and
  `replay(events, { speed, sleep, emit })`, so the terminal (P0-10) and the herald (stage 2) play the same
  schedule.

## Does not

- Spawn a runner or import `runner-core` (§1.3): outcomes come from the tables, not from `FakeRunner`.
- Touch the real kingdom: no quest, character, territory or inbox file, nothing in `events/` outside
  `events/sandbox/`.
- Print or translate anything: `apps/cli` turns lines into a timeline through `@elvaria/i18n`.
- Decide anything of its own: who works, who judges and who is suspended are `planTick`'s; mana runs out and
  comes back on the scenario's schedule (`Scenario.manaOut`): the day hands `planTick` the sleeping pools only,
  never gauge readings, so no pool closes at the cap. It runs no machine check: a fake day's
  verdicts come from the scenario's table.

## Depends on

- `@elvaria/domain` (schemas, state machines, `planTick`, views, ids and time), `@elvaria/eventlog` (serialize,
  read, redact, the sandbox folder), `@elvaria/store` (`writeFileAtomic`). No third-party package.

## How to test

```bash
pnpm --filter @elvaria/sandbox test
pnpm elvaria sandbox generate --day busy --seed 42 --kingdom <tmp>
pnpm elvaria sandbox replay <tmp>/events/sandbox/<date>.jsonl --speed 20
```

`src/simulate.spec.ts` plays every scenario with eight seeds: each line passes `EventSchema`, the lines reduced
from the empty morning give the evening's files (`reduce` = `worldStateOf`), claims respect class and level,
verifiers never judge their own work, and in `mana-out` no Claude character takes work while the pool sleeps.
The specs read the default registry's files from `packages/registry-default/` because the sandbox may not
depend on that package.
