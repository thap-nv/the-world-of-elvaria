# @elvaria/domain

## Does

- Defines `INFIRMARY_REASONS`, their exact parameter keys and `infirmaryReasonOf` (`src/infirmary/`).
  Event v2 carries `{ code, params }` for `quest.infirmary.reason`; `legacy.params.text` preserves v1 words.

- Holds the zod schemas that are the source of the 20 data contracts (ADR 0003, `CONTRACTS` in
  `src/schema/contracts.ts`): kingdom, territory, quest, character, campaign, verdict, lesson, event,
  inbox-command, the six registry files, skill, quest-draft, world-map, memo (PS-02) and memo-triage (PS-03b), with
  their TypeScript types.
  `pnpm schemas` writes `docs/schemas/` from them; each contract's `examples` live in `examples/`.
- Checks a registry across its six files (`parseRegistry`, `checkRegistry`): unknown ritual, class, kind,
  step or tag (a kind's `ritual_overrides`, P1-20), duplicate ids, a verifier allowed to take work, a class and a
  kind that disagree, a follow-up (a script's `follow_up`, a ritual's `flaky_follow_up`) the kingdom cannot make.
- Chooses the ritual that judges a quest (`ritualOf`, ADR 0011, 0022; P1-20): the kind's, unless one of its
  `ritual_overrides` meets the quest's tags (tests as the product: `build`/`refactor` tagged `e2e` or
  `integration` → `mutation_check`); `judgedInScratch` says its judge works in a scratch plot (a ritual with
  `scratch_plot`, a git worktree). What the machine decides there is pure too (`src/verify/trial.ts`):
  `rerunDue` (up to `FLAKE_RUNS` runs while every run passes), `exclusiveWaitMinutes` (how long an exclusive check waits for a judge that holds the lock), `flakyChecksOf` (a run its environment failed is no flake, P1-54), `coverageTotalsOf` (an istanbul
  json-summary) and `coverageDropsOf` (counts compared, no rounding); `flakyFollowUpOf` builds the quest that
  exorcises a flake, of the kind and class the ritual's `flaky_follow_up` names. `commandLinesOf` reads a
  territory command that may be a list (`checks[].run`, `commands.reset`, `commands.coverage`). (P1-54) A failing
  check that failed because of its environment is told by `src/verify/environment.ts`: `environmentLineOf` (the
  line of its log one of the territory's `environment_errors` finds, Docker's own lines by default),
  `environmentFailureOf` (the first such check of a run sets the whole run aside) and `recheckDue` (the run's checks
  run again `ENVIRONMENT_RECHECK_MINUTES` later); `checks[].flake` (`specs`, `run` with `SPECS_PLACEHOLDER`) names
  the checks flake_check runs again.
- Runs the quest state machine (`src/quest/`): the table of moves is data (`QUEST_TRANSITIONS`), and
  `transition(quest, event, actor)` is the only way a quest changes status. It keeps `attempts`, the attempt log
  and who holds the quest, refuses what the table does not allow, and validates the result against the schema.
  `partyIssues` checks the invariants of a party across its quests; `renderQuestTransitionTable` renders the
  table of implementation-plan §2.5. (P1-44) A session that ended while no Steward ran says nothing: `release`
  gives a character's attempt back (`working.release.by_character`, to `returned`, so the redispatch takes it
  again) or lets a judge leave without counting toward a stalled review (`review.release.has_verifier`), its entry
  `cancelled`; `reviewStallOf` names what stalled a review (partial verdicts, or how the last judge who left without
  one ended), for the move a Steward that starts on it makes.
- Shapes a party (`src/party/`, §3.13, ADR 0020, P1-18): `mergeQuestOf` (the merge quest the Steward adds when a
  contract is delivered: a knight's build waiting for every part, their tags and secrets, the highest rank, the
  royal seal), `PartyPlace` (a part's or the merge quest's place, given to `questFromCommand` through
  `NewQuestContext.party`, since the inbox names only a contract; a part whose draft leaves `seal_required` out
  waits for no seal, whatever its kind's `seal_default`, as the merge quest always does), `partyStatusOf`
  (`forming`, `parts`, `merging`, `done` or `stuck`, derived, never stored) and `plotBaseOf` (the branches a quest's plot builds on: a part on its
  contract's, a merge quest on the contract's with every part merged in, any quest on a dependency's not merged
  yet, P1-16 (f)). The territory's `checks[].defer_to_merge` (§3.15) leaves a heavy check to the merge quest.
  `machineMergeDue` (P1-18 (h)): a merge quest's first run is the machine's, and only while no run was ever started on it (`attempts = 0` and an empty log, P1-55); the run takes a run number and no attempt (`machineRun`). `planTick` lists it in `merges`
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
  contract midway holds up nothing. The event `plot.merged` records a merge of a party's parts; `plot.restored`
  (P1-44) a plot the Steward put back to its commit after a judge outside a scratch plot.
- Decides memos (`src/memo/`, PS-02, ADR 0024): `routeMemo` sends a memo where its kind's entry in
  `registry/memos.json` says (no switch on the kind), `memoKeyOf` and `memoIdOf` make its id from the quest, the kind
  and the text normalized (one Unicode form, spaces collapsed, lower case; the caller hashes the key), so a letter
  read again files nothing twice, `memoOf` builds the open memo the Steward files, and `closeMemo` closes it once.
  The events `memo.filed`, `memo.routed`, `memo.closed` and the inbox command `decide_memo` have their schemas here.
  (PS-22, `src/memo/objection.ts`) A kind routed to a `judge` (`objection`) goes there only when `contestRoute` allows
  it: it contests a judge's fail that sent the run back, no other objection contests that verdict, and the verdict
  answered none itself; otherwise it goes to the `owner` with its `refusal`. `objectionOf` names the quest's pending
  objection (`quest.objection`: the memo, the contested verdict, its judge) and `objectionOutcomeOf` closes it by the
  second judge's verdict (`sustained` on a pass, `overruled` on a fail). (PS-22b, `src/memo/amendment.ts`) A kind routed
  to its quest's `author` (`amendment`) goes to the author `authorOf` reads from `created_by` and the parents (the
  Chancellor, or the mage whose plan quest the council made the quest from), else to the owner (`authorRoute`:
  `no_author`, `below_rank` under `kingdom.dispatch.amendments.from_rank`, `second_amendment`); `amendmentDeciderOf` says
  who a quest blocked on it waits for (`blocked.amendment`, which the `ask` event carries), `awaitsAuthor` whether the
  author's session is due. The amendment-decision contract and the `decide_amendment` command have their schemas here;
  `Metrics.amendments` counts them (`src/metrics/amendment-counts.ts`).
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
  ever take (`unjudgeable`, `waitsForNoJudge`, P1-15), those whose judges are all held by their mana, with the
  pools that hold them (`judge_waits`, `judgeWaitOf` over selectVerifier's `awaitedJudges` and the roster's
  `manaOpen`, PS-03), returned quests sent back, claims (class, level
  by `canTake`, limits of tribe and territory, round-robin, affinity), the open quests nobody can take, and the
  done quests still to deliver (`deliveries`, P1-14). (A1b of the lessons of 2026-11-13) A tribe whose CLI is gone or
  says another version than `checkedVersionOf` (the version its last `tribe check` with the real CLI passed on, else the
  pinned one) opens no session in any step (`versionHoldsOf` over `KingdomSnapshot.tools_found`, the one hold in the
  roster); it still counts and stands by, so nothing is named unclaimable or unjudgeable for it. Checks and scripts, which run outside the tick, start only in
  the room `dispatch.max_background` leaves beside the work running (`BackgroundWork.running`, P1-47), checks
  first; a sandbox day has no background, so no cap. (P1-54, `startingNow` of `src/dispatch/background-room.ts`) The
  checks of a blind trial's acceptance part, which run no command, go first and take no slot, and when trials in a
  scratch plot hold every slot one piece of work that is no trial still runs beside them; checks set aside for their
  environment (`BackgroundWork.environment`) get no judge and start again once `recheckDue`.
  From P1-05 a character's mana must be open (`poolOpenOf`: its pool enabled, every gauge that binds it awake and
  below the cap), and paused quests whose gauges woke go on before any new work (`wakes`, `wakesOf`); then, with
  `mana.reassign_after_hours` set, a quest asleep that long goes to a free character of its class whose mana is
  open (`reassigns`, `reassignsOf`, `pausedSince`, P1-22). `resumedSession` decides whether a revived assignee continues its CLI
  session (an answer within `resume_after_answer_minutes`, mana with `resume_after_mana`, an adapter that can
  resume); `answeredAlready` knows a question the owner answered. `namedAssignee` checks the character the
  owner names for a quest (`reassign`, `create_quest.assignee`): known, of the class, not suspended, of an enabled
  tribe, the level aside; `questFromCommand` refuses an assignee it rejects before the quest exists (P1-29).
- Keeps quests whose files meet apart (`src/dispatch/scope.ts`, implementation-plan §3.16.5, ADR 0028, PS-05):
  `quest.scope_paths` is optional; `scopesMeet` compares the literal text of the globs, a doubt is an overlap, and
  entries inside `territory.shared_paths` do not count. A session-tier quest holds its scope from its first run until
  it is archived (`holdsScope`); the roster gives a quest room only when its territory has a slot (R1), no session
  quest without a scope works there and it has one or no session quest works there (R2), and no quest outside its
  base chain (`baseChainOf`: the branches its plot is built on, and those a merge quest merges) holds a scope that
  meets its own (R3). Script-tier quests stand outside R2 and R3. A quest without a scope that waits for its territory
  keeps the scoped quests after it in the claims of that tick (`claims` of `src/dispatch/tick-steps.ts`).
  `scopeHolderOf` names whom a quest waits for. The merge quest takes its parts' scopes together, the acceptance part
  and the follow-ups the scope of the quest they come from.
- Decides the council (`src/council/`, implementation-plan §3.16.6, ADR 0028, PS-06): `councilDue` (a session
  draft from `kingdom.dispatch.council.from_rank`, or `from_areas` tags over as many areas: territories, and within
  one the groups of scope globs that meet, shared paths aside); `templateIssuesOf` (the
  quest template of `QUEST_TEMPLATE_SECTIONS`: every section, numbered steps up to `STEPS_REQUIRED_UP_TO`, a check
  named in "Done when" that the territory has); `planIssuesOf` (a plan's sub-quests: a scope for each session one,
  scopes apart for two that may run at once, a given peak context within the budget, the template);
  `peakContextOf` and `questEstimateOf` (a draft's `estimate.context` is a planning number the quest does not
  keep). The brief (`BriefSchema`) is a block of the quest-draft file; `seal_required` of a draft is optional.
  PS-21b adds `planLinksOf`: two session sub-quests on the graph's territory that may run at once with scopes apart,
  whose files the code graph links (a call, an import), as a warning for the plan's judge, never an issue; the links
  (`FileLink`) and the test of a path against a scope come from the caller.
  (PS-06b) The plan file (`src/council/plan-file.ts`): `planFilesOf` (the `plans/*.md` among the paths a quest
  changed), `planFileIssuesOf` (one of them has every section of `PLAN_FILE_SECTIONS`, each holding something),
  `planSummaryOf` (its `## Summary`, the page the owner seals on) and `splitBrief` (the brief a plan quest's
  description opens with, apart from the rest); `src/council/sections.ts` reads the `## ` sections for both templates.
- Marks a quest whose work changed a protected path (`src/verify/protected.ts`, implementation-plan §3.16.4, ADR 0026,
  PS-04): `territory.laws.protected_paths` is optional, with no default; `protectedMarkOf` gives what the submit sets
  (`seal_required: true` and `quest.protected_changes`, the paths gathered over the submits, never lowered; for a
  part of a party, `part` or `acceptance`, the paths alone, since its merge quest always waits for the seal), and
  `wantsStrongJudge(quest)` puts the judge of the higher level first from rank B or once the quest is so marked,
  below the separation rules of `selectVerifier`.
- Decides the breakers (`src/breaker/`, §3.4, P1-06): `evaluateBreakers(attempt, limits, now, usage)` → `ok` or
  the first trip of `time` (on the minute `budget.max_minutes` is spent), `tokens` or `turns` (once past
  `budget.max_tokens`, `breakers.max_turns`); a tribe whose adapter reports no usage (its `TribeLimits.breakers`
  is `minutes_only`, handed in as `measure` by `measureOf`) has the time breaker alone (P1-33); `breakersOf`
  applies it to the sessions the Steward holds
  (`KingdomSnapshot.sessions`), each timed from its own attempt_log entry, and `planTick` returns them first as
  `breakers`. The trips `commit`, `secrets` and `forbidden_paths` happen where no session runs: `secrets` takes a
  claimed, returned, paused or unjudged quest to the infirmary (§2.5); `forbidden_paths` (P1-49) a finished session
  that left a path of `laws.forbidden_paths` changed in its plot, which the Steward does not commit. (P1-18 (f)) A judge's session may spend
  `breakers.verifier_tokens_multiplier` (2) times the quest's tokens (`tokenCeilingOf`), since it reads the whole
  diff and runs the checks again. (P1-23) `countedTokens` is the unit of a session's
  tokens for every adapter: input, output and cache writes in full, cache reads at a tenth
  (`CACHE_READS_PER_TOKEN`); `reviewStalled` says `REVIEW_BREAKS_MAX` (2) verifiers of the
  open group left without a verdict, cut by a breaker or ended with none (P1-33), or `REVIEW_PARTIALS_MAX` (3)
  handed in a partial one (P1-42), and the review goes to the infirmary instead of a fresh verifier. (P1-26) The owner's retry of
  such a quest goes back to review, same run, for a new judge (`infirmary.retry.stalled_review`); `reviewBreaksOf`
  counts only the verifiers that left without a verdict since that retry, derived from `attempt_log` (a stall closes each group of
  `REVIEW_BREAKS_MAX`). (P1-38) `leftVerifiersOf` names the judges that left the open group without a verdict, whom
  `selectVerifier` passes over while another judge may take the review (a breaker's since P1-38; a crash's and a
  session that never opened, `review.no_session` with outcome `no_session`, since fix/review-no-session, where
  `unopenedReviewsOf` names for the digest the reviews whose latest judge could not open a session); (P1-48) `justPartialOf` names the judge
  whose session, the latest of the open group, handed in a partial verdict, passed over the same way. (P1-42) Judges that hand in a partial
  verdict count apart (`reviewPartialsOf`, outcome `partial`): the `REVIEW_PARTIALS_MAX`-th (3) of the open group
  stalls the review too (`partialsStalled`, `review.verdict_partial.needs_verifier`). A quest without an estimate gets
  `context_budget_tokens` × `CONTEXT_BUDGETS_BY_RANK` of its rank as the stand-in (`questFromCommand`: F–E 1, D 2,
  C 3, B 3 since P1-54, from the sessions of P1-50 on dc1; A 4, S 6.375 since P1-56, by the owner's choice), so its token ceiling grows with the rank; (P1-45) a quest with an estimate never gets a lower
  ceiling than that, nor fewer minutes than it estimates, up to `attempt_minutes.high`. (P1-46) The rule is
  `questBudgetOf(rank, estimate, breakers)`, exported so the sandbox gives its fake quests the same ceilings.
- Keeps the separation of duties (`src/verify/`, ADR 0008, 0020): `selectVerifier` (never an assignee of the quest
  or of its party, never the model of anyone who worked the quest (`policy.doers`, P1-55), another model family first by `familyOfCharacter` (the family the tribe's adapter declares, else `familyOf` of the slug; PS-23: a family nobody knows is never another one, `apartFromAll`), then another tribe, then
  on a quest of rank `STRONG_JUDGE_MIN_RANK` (B) or above the judge of the higher level, P1-48;
  `dispatch.verifier_same_family` for the rest; not a judge a breaker stopped in the run, nor the one that just
  handed in a partial verdict, while another may judge; before that, not a judge whose tribe takes a shorter prompt
  on this OS than the one the Steward measured for it (`withinPromptLimit` over `KingdomSnapshot.review_prompts` and
  `TribeLimits.prompt_max_chars`, `src/verify/prompt-limit.ts`, fix/verifier-prompt-limit), while another may judge; (PS-22) never the judge whose verdict the quest's `objection`
  contests, and never the machine for an objection, which waits as unjudgeable when no judge is left), `underPassRule` (a failing check fails the quest under
  `all_checks_and_agent`, as `tests_fail`, or `incomplete` for the Steward's `subquests` check, P1-15, and its
  `party` check of a merge quest, P1-18, and `coverage_not_lower`, P1-20, or `flaky` for `flake_check`), `machineVerdictOf` (the machine's verdict from the checks), `validateVerdict` (no
  worker, only the session the Steward spawned, no pass over a failing check, not the objection's first judge) and the verdict ids of a run
  (`<quest>-<n>`, `-p<k>` for a partial, `-user` for the owner's). `withVerdict` (`src/character/`) puts a
  verdict into the reputation and tag windows and the fail streak, except the owner's return for a new judgement
  (`rejudge`, P1-40); a pass that sustains an objection takes the verdict it overturned out of the windows (PS-22). What a judge's pass must show (`src/verify/evidence.ts`, P1-40): `passWithoutNotes` (the
  Steward refuses it), and `withBreaksWeighed`, which takes a pass in a scratch plot whose ritual breaks code
  (`breaksDue`) with fewer than `MIN_BREAKS` breaks as the partial of that session.
- Reads the script tier (`src/script/`, §3.12, ADR 0017): `scriptParamsIssues` (a quest's `script.params` against
  the catalog's `params_schema`, read by zod's `fromJSONSchema`; `questFromCommand` refuses
  `invalid_script_params`), `scriptOutcomeOf` (exit 0 with one JSON line in the shape `produces` declares, 2 for a
  quest the script cannot use, anything else a broken script, or the timeout) and `scriptVerdictOf` (the machine's
  verdict: one check named after the script, `link-check` → `link_check`; a batch passes when every unit is done).
  `followUpOf` builds the `create_quest` of the session quest a failed run hands its work to, of the kind and
  class the catalog's `follow_up` names (`parseRegistry` checks them). `planTick` names the open script-tier quests
  to start (`scripts`) and those working or in review whose script no longer runs (`script_verdicts`: a run that
  ended since the last tick, or one a Steward stopped in the middle of); `working.release.by_machine` opens
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
  probed next (just after a known reset, soon again when the account is late). (P1-48) `sessionShareOf` measures
  the share of a window one session takes (the rise between two readings over the sessions the gauge binds that
  ended between them, `endedSessionsOf`; `sharesOfHistory` for the log's readings), `withSessionShare` keeps the
  largest of each window, and `manaStateOf` with `shares` closes a gauge as soon as one more session would take a
  window to the cap (`shareAheadOf`: the measured share, `SESSION_SHARE_DEFAULT_PCT` (7) before any, never more
  than `warn_margin_pct`); `RosterSource.mana.shares` carries them to `planTick`. (P1-49) `measuredShareOf` is the
  measured share alone, and `windowClosingOf` says whether one window closes its gauge, `cap` or `early` (one
  session before the cap), for `elvaria doctor`.
- Reads the tribe contract (`src/tribe/`, implementation-plan §3.14, ADR 0021): `AdapterCapabilities` (the
  yes-or-no `ADAPTER_CAPABILITIES`, `auth`, the sign-ins an adapter runs with, P1-19, the optional `shell` per
  OS, read with `shellOf`, P1-40, the optional `prompt_max_chars` per OS, read with `promptMaxOf` and added to a
  tribe's limits by `tribeLimitsOn(caps, platform)`, fix/verifier-prompt-limit, and the optional `search`, false for a CLI with no search tool, P1-53; PS-23: the optional `read`, false for a
  CLI with no tool that reads a file, and `models`, the models it serves with the maker family and starting level of
  each, `TribeModel`, read with `modelEntryOf`, checked with `modelsProblems`, gathered per tribe with
  `modelsOfTribes` for `KingdomSnapshot.models`), `tribeLimitsOf` (one
  tribe narrowed by what its adapter lacks, `TRIBE_NARROWING`; `planTick` gives nothing to a tribe whose runner
  has no headless mode, no rank above its `max_rank`, and nothing on a guarded territory without a tool gate),
  `checkTribeAuth` and `defaultAuthOf` (the sign-in `tribes[].tool.auth` pins must be one the adapter declares;
  doctor pins the owner's login first; P1-19, where TribeSchema used to name Gemini CLI), `selectChancellor`, and
  `tribeLookOf` / `tribeLooksOf` (PS-24: a tribe's look, a set of parts of the theme's look pool — palette, crest,
  figure, aura, portrait frame — and a name: the owner's choice `tribes[].look`, else the theme's pinned entry,
  else drawn by the tribe id, the same on every run, in the order of `kingdom.tribes[]`, past the palettes and
  crests other tribes hold; display only, no prompt and no dispatch reads it), `lookPoolOf(theme)` and
  `parseLookPool` (the pools the themes ship: `src/tribe/fantasy-looks.json`, checked by `TribeLookPoolSchema`; the
  spec holds its palettes to the design system's tokens, read through `designCss`).
  `ADAPTER_FILE_PATTERN` tells an owner adapter file `adapters/<name>.mjs`.
- Maps the domain onto the design system (implementation-plan §2.7): `statusToneOf` (`src/quest/`),
  `characterToneOf` (`src/character/`) and `bannerOf` (`src/world/`), the one band the HUD shows.
- Builds the world state (`src/world/`) from the files (`worldStateOf`) or the log (`reduce`): every event that
  changes what the world shows carries the view after it (`questViewOf`, ...; `questLogTypeOf` names quest
  lines). `snapshotOf` / `readSnapshot` version the snapshot; `src/protocol/` is the herald's WebSocket protocol.
  A `quest.infirmary` line also says why in parts (P1-32): `trip` (`INFIRMARY_TRIPS`: the breaker trips,
  `no_verdict` and `partial_verdicts` for a stalled review, `max_attempts`, `script_broken`, `script_usage`,
  `script_fail`) and `detail` (`InfirmaryDetailSchema`; `paths`
  for `forbidden_paths`, P1-49), both optional so lines written before them still parse and reduce. A line that
  tells a run's end may name the sessions that followed its first (`sequels`, from `RunEnd.sequels`, P1-49), which
  attempt_log does not keep. `mana.exhausted` may name the reset it waits for
  (`resets_at`), and `mana.level` may read one model's own cap (`model`), which the reducer leaves out of the
  pool's band, as it does that cap's sleep (P1-32).
- Keeps the metrics ledger, read side (`src/metrics/`, implementation-plan §3.16.1, ADR 0027, PS-01): `metricsOf(input,
window)` over quests, verdicts, the event log and the handled inbox commands counts the runs of a window, the
  rework (every character session beyond one assignee and one verifier per quest, `reworkOf`) with its cause, the
  first-pass rate by class, tag, model and kind, escaped defects (the owner returned a passed run), the cost of each
  sealed quest and the owner's commands on quests. Causes are data (`src/metrics/causes.ts`): `OUTCOME_CAUSES`,
  `FAIL_KIND_CAUSES`, `TRIP_CAUSES` give `infra`, `output` or `question`, and `unknown` when the files tell
  nothing; `OWNER_COMMAND_KINDS` lists the commands that count as stepping in, by the `kind` of their
  `command.applied` line, or of their inbox/done file for a line written before PS-01b. From the log alone
  (`src/metrics/log-counts.ts`, PS-01b): the runs of checks set aside for their environment (`check.end` `environment`)
  and each session's reads by file (`agent.tool` reads), the files read more than once first; and (PS-05) the submits
  whose work changed files outside their quest's scope (`out_of_scope` of `quest.submitted`). From the log and the
  attempt logs (`src/metrics/session-counts.ts`, PS-21): the code graph's queries (`graphCommandOf`), each assignee
  session's tool calls before its first edit, and the prompt's size by role and block from the load traces. (PS-22,
  `src/metrics/memo-counts.ts`) Memos by kind with those sent to the owner, from the memo lines, and for each judge the
  verdicts a second judge read beside an objection and those it overturned, from the verdicts' `objection`. (PS-25)
  The first-pass rate by territory too (`by_territory`), and each quest row names its territory and counts its runs
  of checks that passed or failed, and those set aside among them (`checkRunsOf`). (PS-06b) How long quests stay in
  each status, review split by whether a judge holds it (`statusTimesOf`, from the quest lines' views; a stay still
  open is not counted); the pass rate of each quest's first, second, … run (`passByRunOf` over `runJudgementsOf`,
  of which `firstPassOf` is the first); the Chancellor's advice on the memos it sent up beside the owner's decisions
  (`adviceOf`, `ADVICE_DECISIONS`). `planAccuracyOf(input, quest)` sets a plan quest's sub-quests, the mage's only,
  beside what they did: scope and files edited and changed outside it, estimate and first run, memos, rework.
- Scores a territory (`src/scorecard/`, PS-25): `territoryScorecardOf` over the territory file, the metrics ledger,
  one trial (runner-core's `tryTerritory`) and the gazetteer gives six items, each `pass`, `fail` or `unmeasured`,
  with reasons as codes and values (`SCORECARD_REASONS`), never sentences: the trial, each check's time against its
  timeout, the share of runs of checks set aside, the gazetteer (there, fresh by its stamp, naming the commands a
  session meets: `sessionCommandsOf`, `namesCommand`), `shared_paths` and `protected_paths` declared, and the
  territory's first-pass rate. The thresholds are named in `src/scorecard/constants.ts`; `ready` is the trial alone.
  Only `TRIAL_ITEMS` (the trial, each check's time) need a trial: `itemsWithoutTrialOf` gives the other four from the
  territory file, the ledger and the gazetteer, which `doctor` reads again on each run (fix/kingdom-upkeep).
- Decides when the Steward's scheduled jobs run (`src/schedule/`, PS-03): `dueJobs` over `kingdom.schedule`, the
  kingdom's local day and time (`localClockOf`) and the day each job last ran: a daily job is due once its `at` has
  come on a day it has not run (`DAILY_JOBS`: `chronicle`, `triage`, `digest`), so a late start catches up and a clock set back
  never runs it twice. `schedule.ran` and `digest.written` give the lines their shape (`src/schema/event/schedule-data.ts`).
- Lists what waits for the owner (`attentionQueue`, `src/world/attention.ts`, PS-03): over the world state, `now`
  and the Steward's notices (unclaimable, unjudgeable, judges out of mana), each item with its group (`must`: the
  work stands still; `can_wait`), an advice code and the `elvaria` command, both from `ATTENTION_TABLE` by kind:
  questions, seals, the infirmary, drafts, open memos, pools asleep or at the warning share, and (PS-05) the done
  quests that still hold a scope quests ready to start wait for (`scope_held`, from `scopeHoldsOf` over the quest
  files, which the caller passes with the notices: the world state holds no scope), and the tribes the Steward holds
  by their CLI (`tribes_held`: `tribe_held` for a new version, `tribe_gone` for a CLI gone, both with `tribe check
<tribe>`; A1b of the lessons of 2026-11-13). The world state holds the
  open memos since PS-03 (`memos`, `memoViewOf`; `memo.*` lines reduce into it; `WORLD_STATE_VERSION` 2). A memo the
  Chancellor's triage sent up carries its advice (`escalated`, PS-03b) and lists as `memo_escalated`.
- Decides what the world takes in alone of the memos the Chancellor triages (`src/delegation/`, PS-03b):
  `kingdom.delegation` (`DelegationSchema`: `max_rank`, `same_scope`, `ask`) and `delegationHolds`, which answers with
  what holds a piece of work for the owner: a matter of `ask` the Chancellor flagged (or `protected_paths` when a
  memo's files lie under its territory's `laws.protected_paths`, `DelegatedMemo.protected_refs` as the caller
  matched them, the owner's settlement of PS-03b (a)), a rank above `max_rank`, files
  not surely inside the work's scope (`pathInScope`, the reverse doubt of `scopesMeet`), or the Chancellor's own
  choice; none when the Steward may apply it. The memo-triage contract (`MemoTriageFileSchema`), `escalateMemo` and
  the memo's `escalation`, the command `escalate_memo`, `memos` on create_quest, edit_quest and the quest, the source
  `chancellor` and the line `memo.escalated` have their schemas here; `memoCountsOf` (PS-22) counts, by kind, the memos the owner
  and the triage decided and those the triage sent up (`Metrics.memos`), and a command of the triage is none of the
  owner's steps.
- Gives the load trace of a session's opening line its shape (`LoadTraceSchema`, `src/schema/event/load-trace.ts`,
  PS-01b): the scripture files and their lines, the skill ids and the prompt's blocks by part, id and size.
- Gives the core types every package builds on: `Result`, branded ids (`QuestId`, `TribeId`, ...), `Clock` and
  `Instant`, `zonedTime` (local day and ISO offset in `kingdom.tz`), `IdSource` (ULIDs and dated ids).
- Names every number it decides with in `src/constants.ts` and the `constants.ts` of the folders that have one.
- Names the code graph's read-only commands (`GRAPH_COMMANDS`, `graphCommandOf`, PS-21), the territory's optional
  `code_graph` switch, `kingdom.programs.graphify` (`ProgramsSchema`) and the `graph.built` / `graph.failed` lines.
  Counts an area's impact from the graph's links (`impactOf`, `src/graph/links.ts`, PS-21b): the files outside it
  that use a file inside it, an input to the rank.

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
