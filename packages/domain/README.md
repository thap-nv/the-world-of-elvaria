# @elvaria/domain

## Does

- Holds the zod schemas that are the source of the 17 data contracts (ADR 0003, `CONTRACTS` in
  `src/schema/contracts.ts`): kingdom, territory, quest, character, campaign, verdict, lesson, event,
  inbox-command, the five registry files, skill, quest-draft and world-map, with their TypeScript types.
  `pnpm schemas` writes `docs/schemas/` from them; each contract's `examples` live in `examples/`.
- Checks a registry across its five files (`parseRegistry`, `checkRegistry`): unknown ritual, class, kind,
  step or tag (a kind's `ritual_overrides`, P1-20), duplicate ids, a verifier allowed to take work, a class and a
  kind that disagree, a follow-up (a script's `follow_up`, a ritual's `flaky_follow_up`) the kingdom cannot make.
- Chooses the ritual that judges a quest (`ritualOf`, ADR 0011, 0022; P1-20): the kind's, unless one of its
  `ritual_overrides` meets the quest's tags (tests as the product: `build`/`refactor` tagged `e2e` or
  `integration` → `mutation_check`); `judgedInScratch` says its judge works in a scratch plot (a ritual with
  `scratch_plot`, a git worktree). What the machine decides there is pure too (`src/verify/trial.ts`):
  `rerunDue` (up to `FLAKE_RUNS` runs while every run passes), `exclusiveWaitMinutes` (how long an exclusive check waits for a judge that holds the lock), `flakyChecksOf`, `coverageTotalsOf` (an istanbul
  json-summary) and `coverageDropsOf` (counts compared, no rounding); `flakyFollowUpOf` builds the quest that
  exorcises a flake, of the kind and class the ritual's `flaky_follow_up` names. `commandLinesOf` reads a
  territory command that may be a list (`checks[].run`, `commands.reset`, `commands.coverage`).
- Runs the quest state machine (`src/quest/`): the table of moves is data (`QUEST_TRANSITIONS`), and
  `transition(quest, event, actor)` is the only way a quest changes status. It keeps `attempts`, the attempt log
  and who holds the quest, refuses what the table does not allow, and validates the result against the schema.
  `partyIssues` checks the invariants of a party across its quests; `renderQuestTransitionTable` renders the
  table of implementation-plan §2.5.
- Shapes a party (`src/party/`, §3.13, ADR 0020, P1-18): `mergeQuestOf` (the merge quest the Steward adds when a
  contract is delivered: a knight's build waiting for every part, their tags and secrets, the highest rank, the
  royal seal), `PartyPlace` (a part's or the merge quest's place, given to `questFromCommand` through
  `NewQuestContext.party`, since the inbox names only a contract), `partyStatusOf` (`forming`, `parts`, `merging`,
  `done` or `stuck`, derived, never stored) and `plotBaseOf` (the branches a quest's plot builds on: a part on its
  contract's, a merge quest on the contract's with every part merged in, any quest on a dependency's not merged
  yet, P1-16 (f)). The territory's `checks[].defer_to_merge` (§3.15) leaves a heavy check to the merge quest.
  `machineMergeDue` (P1-18 (h)): a merge quest's first run is the machine's. `planTick` lists it in `merges`
  instead of giving it to a knight; `claim` takes it with no assignee, and the rows `working.submit.by_machine`,
  `working.release.by_machine` (the merge stopped), `review.verdict_fail.machine_retry` and
  `awaiting_seal.return.merged_by_machine` (both back to `open`, for a knight) carry it; the quest schema lets a
  merge quest be held with no assignee. (P1-21) The blind trial (§3.15, ADR 0022): `territory.blind_trial`
  (`{enabled: false, min_rank: 'B'}`), `blindTrialDue` (on, and the contract or a part of that rank or above) and
  `acceptanceQuestOf` (the party's `acceptance` part: a knight's build tagged `e2e` from the owner's description
  and the contract alone, waiting for the contract only; `plotBaseOf` starts it on the contract's branch, the
  merge quest merges it with the parts). `partyBarsOf` keeps a party's judges from its work and, in a blind trial,
  the acceptance writer apart from the parts' assignees (`selectAssignee` takes the party: barred characters are
  left out, the other model family goes first; `partyIssues` reports `blind_trial_crossed`). (P1-37) Every part
  waits for the acceptance part (`partWaitsFor`; `plotBaseOf` never starts a part on its branch), so the tests are
  written before any part's branch holds work; `blindTrialDue` reads ranks alone, so it is asked of the lead's
  drafts. The part's brief asks for test files named `*.acceptance.*` and quotes the owner's description up to a
  line `---` (`LEAD_MARK`, `workOf`). The merge quest goes to the tests' writer only when no other knight may take
  it (`PartyBars.avoided`), and `claimBlocker` reports `party_bars` when the party bars every character of the
  class. `questFinished`
  (done, or archived after its delivery) is what `planTick` counts a dependency as done by, so archiving a
  contract midway holds up nothing. The event `plot.merged` records a merge of a party's parts.
- Runs the character state machine (`src/character/`, `transitionCharacter`) and derives what is never stored:
  `reputationOf`, `affinityOf`, `titleOf`. Decides levels: `canTake` (which ranks the Steward may give a level),
  `aboveCeiling` (a stretch that makes the quest wait for the royal seal) and `levelChange` (counting only the
  verdicts since the last change, `level_since`); the owner's `set_level` through `setLevelLine` (the line, or
  `invalid_level`/`same_level`) and `withLevel` (P1-29); the owner's `set_model` through `setModelLine` (`invalid_model`,
  `same_model`, `model_not_of_tribe`: `modelOfTribe`, a model some named pool claims, else the family of the
  character's model) and `withModel`, told as `character.model_changed` (`src/character/model.ts`, P1-22).
- Plans the Steward's tick (`src/dispatch/`): `planTick(snapshot, now)` returns what the Steward and the sandbox
  carry out in one tick: characters on a fail streak sent to the Temple (`failStreakReached`), claimed quests
  that start, a judge (or the machine) for each submitted quest, the submitted quests no judge of the roster may
  ever take (`unjudgeable`, `waitsForNoJudge`, P1-15), returned quests sent back, claims (class, level
  by `canTake`, limits of tribe and territory, round-robin, affinity), the open quests nobody can take, and the
  done quests still to deliver (`deliveries`, P1-14).
  From P1-05 a character's mana must be open (`poolOpenOf`: its pool enabled, every gauge that binds it awake and
  below the cap), and paused quests whose gauges woke go on before any new work (`wakes`, `wakesOf`); then, with
  `mana.reassign_after_hours` set, a quest asleep that long goes to a free character of its class whose mana is
  open (`reassigns`, `reassignsOf`, `pausedSince`, P1-22). `resumedSession` decides whether a revived assignee continues its CLI
  session (an answer within `resume_after_answer_minutes`, mana with `resume_after_mana`, an adapter that can
  resume); `answeredAlready` knows a question the owner answered. `namedAssignee` checks the character the
  owner names for a quest (`reassign`, `create_quest.assignee`): known, of the class, not suspended, of an enabled
  tribe, the level aside; `questFromCommand` refuses an assignee it rejects before the quest exists (P1-29).
- Decides the breakers (`src/breaker/`, §3.4, P1-06): `evaluateBreakers(attempt, limits, now, usage)` → `ok` or
  the first trip of `time` (on the minute `budget.max_minutes` is spent), `tokens` or `turns` (once past
  `budget.max_tokens`, `breakers.max_turns`); `breakersOf` applies it to the sessions the Steward holds
  (`KingdomSnapshot.sessions`), each timed from its own attempt_log entry, and `planTick` returns them first as
  `breakers`. The trips `commit` and `secrets` happen where no session runs: `secrets` takes a claimed,
  returned, paused or unjudged quest to the infirmary (§2.5). (P1-18 (f)) A judge's session may spend
  `breakers.verifier_tokens_multiplier` (2) times the quest's tokens (`tokenCeilingOf`), since it reads the whole
  diff and runs the checks again. (P1-23) `countedTokens` is the unit of a session's
  tokens for every adapter: input, output and cache writes in full, cache reads at a tenth
  (`CACHE_READS_PER_TOKEN`); `reviewStalled` says a breaker has stopped `REVIEW_BREAKS_MAX` (2) verifiers of the
  current run, and the review goes to the infirmary instead of a fresh verifier. (P1-26) The owner's retry of
  such a quest goes back to review, same run, for a new judge (`infirmary.retry.stalled_review`); `reviewBreaksOf`
  counts only the cuts since that retry, derived from `attempt_log` (a stall closes each group of
  `REVIEW_BREAKS_MAX`). (P1-38) `cutVerifiersOf` names the judges a breaker stopped in the open group, whom
  `selectVerifier` passes over while another judge may take the review. A quest without an estimate gets
  `context_budget_tokens` × `CONTEXT_BUDGETS_BY_RANK` of its rank as the stand-in (`questFromCommand`: F–D 1, C 1.5,
  B 2, A 2.5, S 3), so its token ceiling grows with the rank.
- Keeps the separation of duties (`src/verify/`, ADR 0008, 0020): `selectVerifier` (never an assignee of the quest
  or of its party, never the assignee's model, another model family first by `familyOf`, then another tribe;
  `dispatch.verifier_same_family` for the rest; not a judge a breaker stopped in the run while another may judge), `underPassRule` (a failing check fails the quest under
  `all_checks_and_agent`, as `tests_fail`, or `incomplete` for the Steward's `subquests` check, P1-15, and its
  `party` check of a merge quest, P1-18, and `coverage_not_lower`, P1-20, or `flaky` for `flake_check`), `machineVerdictOf` (the machine's verdict from the checks), `validateVerdict` (no
  worker, only the session the Steward spawned, no pass over a failing check) and the verdict ids of a run
  (`<quest>-<n>`, `-p<k>` for a partial, `-user` for the owner's). `withVerdict` (`src/character/`) puts a
  verdict into the reputation and tag windows and the fail streak, except the owner's return for a new judgement
  (`rejudge`, P1-40). What a judge's pass must show (`src/verify/evidence.ts`, P1-40): `passWithoutNotes` (the
  Steward refuses it), and `withBreaksWeighed`, which takes a pass in a scratch plot whose ritual breaks code
  (`breaksDue`) with fewer than `MIN_BREAKS` breaks as the partial of that session.
- Reads the script tier (`src/script/`, §3.12, ADR 0017): `scriptParamsIssues` (a quest's `script.params` against
  the catalog's `params_schema`, read by zod's `fromJSONSchema`; `questFromCommand` refuses
  `invalid_script_params`), `scriptOutcomeOf` (exit 0 with one JSON line in the shape `produces` declares, 2 for a
  quest the script cannot use, anything else a broken script, or the timeout) and `scriptVerdictOf` (the machine's
  verdict: one check named after the script, `link-check` → `link_check`; a batch passes when every unit is done).
  `followUpOf` builds the `create_quest` of the session quest a failed run hands its work to, of the kind and
  class the catalog's `follow_up` names (`parseRegistry` checks them). `planTick` names open script-tier quests
  (`scripts`) and runs a Steward stopped in the middle of (`script_verdicts`); `working.release.by_machine` opens
  such a quest again, its run `cancelled`.
- Decides mana per gauge (`src/mana/`, ADR 0009; P1-22): a gauge (`PoolKey`) is a whole pool or the cap of one
  model in it (`model`); `binds` says which characters a gauge binds: a model's cap the slugs that name it, a pool
  the models the account lists in its group (`ManaReading.models`, `namesModel`), or, when it lists none, the models
  `poolOf(tribe, model)` charges to it by prefix (`POOL_MODEL_PREFIXES`). `ManaReading` and `readingOf` (an
  account's window as a reading); `decideManaState(readings, key, cfg, now)` → `ok | warning | closed | asleep` of
  one gauge, `manaStateOf` of a character (every gauge that binds it), against `min(cap_pct, 100 − king_reserve_pct)`;
  `asleepFor` (a gauge asleep binds the character), `spentFor` (the spent gauges a usage limit put to sleep);
  `estimatedReadings` (`estimate`: the sessions' tokens, or minutes for `mana_source: elapsed_time`, in five hours
  and seven days against `tribes[].budget`, for a pool and window the account gives no figure for; never spent);
  `warningsOf` (a gauge warns once at `warn_margin_pct` below the cap); `nextProbeOf`, when a sleeping gauge is
  probed next (just after a known reset, soon again when the account is late).
- Reads the tribe contract (`src/tribe/`, implementation-plan §3.14, ADR 0021): `AdapterCapabilities` (the
  yes-or-no `ADAPTER_CAPABILITIES`, `auth`, the sign-ins an adapter runs with, P1-19, and the optional `shell` per
  OS, read with `shellOf`, P1-40), `tribeLimitsOf` (one
  tribe narrowed by what its adapter lacks, `TRIBE_NARROWING`; `planTick` gives nothing to a tribe whose runner
  has no headless mode, no rank above its `max_rank`, and nothing on a guarded territory without a tool gate),
  `checkTribeAuth` and `defaultAuthOf` (the sign-in `tribes[].tool.auth` pins must be one the adapter declares;
  doctor pins the owner's login first; P1-19, where TribeSchema used to name Gemini CLI), `selectChancellor`, and
  `tribeLookOf` (a theme's crest and colour of a tribe, `NEUTRAL_TRIBE_LOOK`, `tribe-neutral`, for one the theme
  has no entry for yet). `ADAPTER_FILE_PATTERN` tells an owner adapter file `adapters/<name>.mjs`.
- Maps the domain onto the design system (implementation-plan §2.7): `statusToneOf`, `characterToneOf`, and
  `bannerOf` (`src/world/`), the one band the HUD shows.
- Builds the world state (`src/world/`) from the files (`worldStateOf`) or the log (`reduce`): every event that
  changes what the world shows carries the view after it (`questViewOf`, ...; `questLogTypeOf` names quest
  lines). `snapshotOf` / `readSnapshot` version the snapshot; `src/protocol/` is the herald's WebSocket protocol.
  A `quest.infirmary` line also says why in parts (P1-32): `trip` (`INFIRMARY_TRIPS`: the breaker trips,
  `max_attempts`, `script_broken`, `script_usage`, `script_fail`) and `detail` (`InfirmaryDetailSchema`), both
  optional so lines written before them still parse and reduce. `mana.exhausted` may name the reset it waits for
  (`resets_at`), and `mana.level` may read one model's own cap (`model`), which the reducer leaves out of the
  pool's band, as it does that cap's sleep (P1-32).
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
