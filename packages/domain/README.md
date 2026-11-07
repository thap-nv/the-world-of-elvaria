# @elvaria/domain

## Does

- Holds the zod schemas that are the source of the 17 data contracts (ADR 0003, `CONTRACTS` in
  `src/schema/contracts.ts`): kingdom, territory, quest, character, campaign, verdict, lesson, event,
  inbox-command, the five registry files, skill, quest-draft and world-map, with their TypeScript types.
  `pnpm schemas` writes `docs/schemas/` from them; each contract's `examples` live in `examples/`.
- Checks a registry across its five files (`parseRegistry`, `checkRegistry`): unknown ritual, class, kind or
  step, duplicate ids, a verifier allowed to take work, a class and a kind that disagree.
- Runs the quest state machine (`src/quest/`): the table of moves is data (`QUEST_TRANSITIONS`), and
  `transition(quest, event, actor)` is the only way a quest changes status. It keeps `attempts`, the attempt log
  and who holds the quest, refuses what the table does not allow, and validates the result against the schema.
  `partyIssues` checks the invariants of a party across its quests; `renderQuestTransitionTable` renders the
  table of implementation-plan §2.5.
- Runs the character state machine (`src/character/`, `transitionCharacter`) and derives what is never stored:
  `reputationOf`, `affinityOf`, `titleOf`. Decides levels: `canTake` (which ranks the Steward may give a level),
  `aboveCeiling` (a stretch that makes the quest wait for the royal seal) and `levelChange` (counting only the
  verdicts since the last change, `level_since`).
- Plans the Steward's tick (`src/dispatch/`): `planTick(snapshot, now)` returns what the Steward and the sandbox
  carry out in one tick: characters on a fail streak sent to the Temple (`failStreakReached`), claimed quests
  that start, a judge (or the machine) for each submitted quest, returned quests sent back, claims (class, level
  by `canTake`, limits of tribe and territory, round-robin, affinity), the open quests nobody can take, and the
  done quests still to deliver (`deliveries`, P1-14).
  From P1-05 a character's pool must be open (`poolOpenOf`), and paused quests whose pool woke go on before
  any new work (`wakes`, `wakesOf`). `resumedSession` decides whether a revived assignee continues its CLI
  session (an answer within `resume_after_answer_minutes`, mana with `resume_after_mana`, an adapter that can
  resume); `answeredAlready` knows a question the owner answered.
- Decides the breakers (`src/breaker/`, §3.4, P1-06): `evaluateBreakers(attempt, limits, now, usage)` → `ok` or
  the first trip of `time` (on the minute `budget.max_minutes` is spent), `tokens` or `turns` (once past
  `budget.max_tokens`, `breakers.max_turns`); `breakersOf` applies it to the sessions the Steward holds
  (`KingdomSnapshot.sessions`), each timed from its own attempt_log entry, and `planTick` returns them first as
  `breakers`. The trips `commit` and `secrets` happen where no session runs: `secrets` takes a claimed,
  returned, paused or unjudged quest to the infirmary (§2.5).
- Keeps the separation of duties (`src/verify/`, ADR 0008, 0020): `selectVerifier` (never a worker of the quest
  or of its party, never the assignee's model, another model family first by `familyOf`, then another tribe;
  `dispatch.verifier_same_family` for the rest), `underPassRule` (a failing check fails the quest under
  `all_checks_and_agent`), `machineVerdictOf` (the machine's verdict from the checks), `validateVerdict` (no
  worker, only the session the Steward spawned, no pass over a failing check) and the verdict ids of a run
  (`<quest>-<n>`, `-p<k>` for a partial, `-user` for the owner's). `withVerdict` (`src/character/`) puts a
  verdict into the reputation and tag windows and the fail streak.
- Reads the script tier (`src/script/`, §3.12, ADR 0017): `scriptParamsIssues` (a quest's `script.params` against
  the catalog's `params_schema`, read by zod's `fromJSONSchema`; `questFromCommand` refuses
  `invalid_script_params`), `scriptOutcomeOf` (exit 0 with one JSON line in the shape `produces` declares, 2 for a
  quest the script cannot use, anything else a broken script, or the timeout) and `scriptVerdictOf` (the machine's
  verdict: one check named after the script, `link-check` → `link_check`; a batch passes when every unit is done).
  `followUpOf` builds the `create_quest` of the session quest a failed run hands its work to, of the kind and
  class the catalog's `follow_up` names (`parseRegistry` checks them). `planTick` names open script-tier quests
  (`scripts`) and runs a Steward stopped in the middle of (`script_verdicts`); `working.release.script` opens
  such a quest again, its run `cancelled`.
- Decides mana per pool (`src/mana/`, ADR 0009): `poolOf(tribe, model)` (a one-pool account is the tribe; named
  pools by model prefix, `POOL_MODEL_PREFIXES`), `ManaReading` and `readingOf` (an account's window as a
  reading), `decideManaState(readings, pool, cfg, now, model?)` → `ok | warning | closed | asleep` against
  `min(cap_pct, 100 − king_reserve_pct)`; a cap of one model binds only the characters on it; `nextProbeOf`, when
  a sleeping pool is probed next (just after a known reset, soon again when the account is late).
- Maps the domain onto the design system (implementation-plan §2.7): `statusToneOf`, `characterToneOf`, and
  `bannerOf` (`src/world/`), the one band the HUD shows.
- Builds the world state (`src/world/`) from the files (`worldStateOf`) or the log (`reduce`): every event that
  changes what the world shows carries the view after it (`questViewOf`, ...; `questLogTypeOf` names quest
  lines). `snapshotOf` / `readSnapshot` version the snapshot; `src/protocol/` is the herald's WebSocket protocol.
- Gives the core types every package builds on: `Result`, branded ids (`QuestId`, `TribeId`, ...), `Clock` and
  `Instant`, `zonedTime` (local day and ISO offset in `kingdom.tz`), `IdSource` (ULIDs and dated ids).
- Names every number it decides with in `src/constants.ts` and the `constants.ts` of each folder.

## Does not

- Do IO of any kind: no Node built-ins, no `process`, no `Date.now`, `Math.random` or timers (ADR 0002). Time
  and randomness come in through `Clock` and `RandomSource`; events carry their own time. Lint, TypeScript
  (`types: []`) and dependency-cruiser each enforce this.
- Throw: failures are `Result` values.
- Know the CLIs or the renderer.
- Check what needs other files in a single quest's transition: dependencies being done, the registry, a party.
  The Steward checks those before it applies an event (`partyIssues` for parties).

## Depends on

- `zod` only. No other workspace.

## How to test

```bash
pnpm --filter @elvaria/domain test   # vitest with a 100 % coverage gate
```

The schema specs parse every contract's `examples/<name>.json`, the one source of the contract's `examples`,
so a zod change that refuses a reviewed example fails here first. The state-machine specs explore every quest the machine reaches
from a draft in ten events and take long seeded random walks (`src/quest/__fixtures__/quests.ts`): no move
outside the table, every row reachable, guards never overlap.

`src/world/replay.spec.ts` replays a fake day of a scripted Steward (`src/world/__fixtures__/`): after every
line, the state reduced from the log equals `worldStateOf` of the files at that moment.

Specs cannot read files: the domain's program has no Node types. The one file a spec needs, the design
system's `elvaria.css` (whose `data-status` values must be the tones of `statusToneOf`), is read by
`vitest.config.mjs` and handed to the spec through vitest's `provide` / `inject`.
