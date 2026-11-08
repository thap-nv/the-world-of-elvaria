# @elvaria/steward

## Does

- Runs the Steward (implementation-plan §3.1): `createSteward(deps)` takes `.state/steward.lock` (one Steward per
  kingdom), rebuilds from the event log what it already answered, and ticks every `dispatch.tick_seconds`.
  Ticks never overlap.
- One tick, in the order of §3.1: the inbox in id order (the owner first); the ends of the sessions it runs;
  sessions the files say run but it does not hold (a Steward that stopped or crashed) end as a crash, so no
  quest ever runs two sessions; the inbox commands that waited, once more; the mana gauges; then the domain's
  `planTick` decides and the Steward carries it out: sessions past a breaker stop, characters on a fail streak go
  to the Temple
  (`character.suspend`, the bell), paused quests whose pool woke go on, claimed quests start, submitted quests get
  their checks and, in a later tick once those ended, the judge `selectVerifier` chose (or the machine's verdict
  under `machine_only`), returned quests go back to their assignee, open quests are claimed.
- Runs the machine's long work outside the tick (P1-25, `src/background.ts`): a submitted quest's checks and a
  script-tier run start in a tick and go on while later ticks apply the inbox, record the sessions' ends and give
  out work; `planTick` sees which quests have work running and which have checks ready (`BackgroundWork`). The
  work writes only into its run folder, never a quest or a character. Work for a quest that moved on (cancelled,
  judged, retried) is killed before each plan; `stop()` kills it all and the next Steward runs it again.
  `Steward.idle()` resolves once the work running now has ended (what a spec waits on).
- Trips the breakers (§3.4, P1-06; `src/sessions/breaker.ts`): `planTick` names each held session past its
  minutes (`quest.budget.max_minutes`, from its own attempt_log entry), its tokens (the running total of its
  `usage` signals against `budget.max_tokens`) or its turns; the Steward sinks the assignee into the swamp, kills
  the session's process tree, commits the work as `chore: wip <quest> (<trip>)` (a refusal keeps it in the plot
  and says so in the reason), sends the quest to the infirmary (`quest.infirmary`, `breaker:<trip>: <detail>`) and
  rings the bell; a verifier past a breaker leaves the review to the next one, until the second of a run
  (`reviewStalled`, P1-23): then the quest goes to the infirmary with the bell, and no third verifier opens; the
  owner's `retry` brings it back to review with a new judge, and the count starts over (P1-26). A CLI
  that stopped at its own `--max-turns` or budget gets the same end, a verifier's included. When the quest's journal shows an apprentice of that session past
  its minutes or cut at its turns, the reason asks the owner for a child quest for the work it left (§3.12). A quest whose secrets the treasury lacks, or its territory no longer
  allows, goes to the infirmary (`breaker:secrets`) instead of being claimed and released every tick; an
  owner's answer to such a blocked quest is refused (`secrets_lacking`).
- Keeps the pid of every session it holds in `.state/sessions.json` (written before each tick ends, emptied at
  stop). At start, before the first tick, it kills the tree of each pid the last Steward left there whose process
  started when that session was spawned (`processStartOf`, within a minute), and leaves a pid that now belongs to
  another process, or whose start the system would not tell, alone, with a warning. `sessionsLeftBehind(root)`
  tells `elvaria doctor` which of them still run, and nothing while a Steward holds the lock.
- Watches mana per pool (§3.5, ADR 0009; `src/mana/`): a session that hits its account's limit pauses its quest
  (assignee kept; a verifier leaves the review), the whole pool sleeps (`mana.exhausted`), every other session on
  it is killed and pauses and idle characters fall asleep; each paused assignee's work is committed as
  `chore: wip <quest> (mana)` after its session ends. A tribe with a pool asleep is probed (`mana.probe`) one minute after
  the reset its session or its last probe named, again every two minutes while the account resets late, else
  every `probe_interval_minutes` (`nextProbeOf`); a probe that goes through wakes the pool (`mana.restored`),
  sleepers wake and the paused quests go on with the same character and attempt, in a fresh session from the
  letter (`--resume` only with `resume_after_mana`, then with a short prompt). Awake pools are read without a
  model call (`probe({ping: false})`) in the background right after each session ends and every interval while
  quests are in play; windows a session reports in band (`mana` signal) come in too: `mana.level` on change; a
  pool at the cap takes no new session, one whose window reads spent sleeps. The owner's `wake` (`elvaria wake`)
  probes at once. The pools asleep are rebuilt from the log at start.
- Is the only writer of quests and characters (ADR 0005): every change goes through `transition()` or
  `transitionCharacter()`, is written to its file, then told in one event line carrying the view after it
  (P0-09), in the log and the quest's journal. Replaying the log over the morning gives back the files.
- Applies the owner's commands: `create_quest` (an id derived from the command id, so a command applied twice
  never makes two quests), `confirm`, `cancel` (kills the session), `archive`, `retry`, `seal` and `return` (the owner's
  verdict, `verdicts/<quest>-<n>-user.json`, weighed three times; a return needs notes of 20 characters and takes
  `fail_kind` `other` by default), `answer` (waits in the inbox until the asker is free and its pool has mana;
  within `dispatch.resume_after_answer_minutes` of the question, and when the adapter can, the asking session goes
  on with `--resume`), `reassign` (the owner's character, the level aside; or the Steward's own choice),
  `set_rank`, `edit_quest` (refused when the quest moved since the owner read it), `wake`, `suspend` and `release`
  (P1-26, `inbox/character-commands.ts`): a suspended character takes no work; the quest it works on ends its
  attempt `returned` (the session killed, its work committed as WIP) and waits for it or for a `reassign`, the
  quest it judges goes back to review for the next judge, a claim not started opens again (`claimed.release`), and
  a quest it sleeps on stays paused until reassigned; `release` makes it idle with its fail streak at 0. Both lines
  (`character.suspend`, `character.release`) are the owner's. `set_level` (P1-29,
  `inbox/character-settings.ts`, on `settingByOwner`, the one path for a setting of a character's own fields):
  the character's new level and `level_since`, told as the owner's `character.level_up`/`level_down`; its own
  level is refused `same_level`. A `create_quest` naming an `assignee` (P1-29) gives the new quest to it by the
  owner's `reassign` (`open → claimed`, the level aside); an assignee unknown, of another class, suspended or of a
  disabled tribe refuses the command and creates no quest, as for `reassign` (the domain's `namedAssignee`).
  Other kinds are refused with `unsupported` until their task. A `create_quest` that asks for a secret its
  territory does not allow is refused with `secret_not_allowed` (ADR 0013).
- Opens sessions through `AgentRunner` only (ADR 0006, 0021): the plot, the prompt and tool policy of
  `runner-core`, the budget, `.runs/<quest>-<n>`, and the env (§3.9): the minimal env it was given, the
  `ELVARIA_*` context of the hook and exactly the quest's `secrets_required` from the treasury (`sessionEnvOf`
  of `sessions/secrets.ts`); a name the territory no longer allows or the treasury lacks opens no session
  (`secretsLacking` asks first, by name only). A
  runner's `capabilities` narrow its tribe through `tribeLimitsOf`; a tribe without a runner takes no work.
- Masks what a session leaves behind with that session's secret values and the patterns, before the kingdom
  keeps it (`maskFinished`, ADR 0013): the handover letter (`redactHandover`), the question, and the verifier's
  output, so the verdict notes the next prompt reads hold none.
- Turns a session's end into the quest's move: submit (after committing the plot with `plotCommitMessage.submit`;
  a commit the territory's hooks refuse sends the quest to the infirmary, `breaker:commit`), a question (`ask`;
  one the owner already answered, left in the letter, is a submit), mana out, a crash, the CLI's turn or budget
  limit (breaker). For a verifier: the verdict file (a partial one as `<quest>-<n>-p<k>`), the ritual's pass rule
  over the checks (`underPassRule`), `validateVerdict`, `verdict.*`, the move, the assignee's windows and fail
  streak (`withVerdict`), then `levelChange`.
- Runs the territory's checks on what the quest touched before a judge's session opens (`Plots.check`: runChecks
  of P1-07 in `elvaria run`, outside the tick, its `signal` aborted when nobody waits for them any more): their
  results go into the judge's prompt, the verdict and `quest.checks_run`; each judge of a run gets its own run of
  them. The prompt shows the end of each failing check's log (`src/review/log-tail.ts`: the last 40 lines, at most
  4 000 characters for all of them), masked with the session's secret values and the patterns, because the log lies
  in `.runs/`, outside the plot, where the judge's tools do not reach. Under
  `verifier_same_family = machine_only` with no judge of another family, the machine's verdict comes from them
  alone (`verifier_id: machine`). A plan's `subquests.json` is checked the same way first (check `subquests`,
  `src/review/deliverable-checks.ts`, P1-15): what the delivery would open, or why none, so a list the Steward
  would refuse goes back to the mage. The judge's prompt carries the branch's diff (`Plots.diff`), the craft of
  its class (`registry/<class.prompt_file>`, as every session's does), and where the last judge of the run
  stopped when it left a `partial` verdict. Gives the plot back when a quest is archived (`Plots.release`; a
  dirty worktree stays, with a warning).
- Runs the script tier itself (§2.5, §3.12, ADR 0017; `src/script/`): a `create_quest` whose `script.params` do
  not fit the catalog's `params_schema` is refused (`invalid_script_params`); an open script-tier quest is claimed
  with no assignee, gets its plot, starts, and `node registry/scripts/<id>.mjs --params <json> --context <json>`
  runs in the plot outside the tick (`StewardDeps.scripts`, `nodeScriptRunner`): the minimal env and no secret,
  `--context` with the run folder and the territory's checks resolved (`Plots.scriptChecks`), its tree killed at
  `timeout_minutes`. Its output goes to `.runs/<quest>-<n>/script.log` and `script.json`; the machine judges from
  that in a tick after the run ended (`scriptVerdictOf`): a result goes to review, then done (or the seal), a failing one and a units list with
  open units to the infirmary with their verdict; a timeout trips the time breaker; a script that broke or could
  not use the quest goes to the infirmary at once (`script:broken`, `script:usage`). No runner is asked, mana 0.
  A failing result first opens the follow-up its catalog entry names (`follow_up: {kind, class}`, `followUpOf`):
  one open session quest, a child of the script quest (`created_by: battle`), its id derived from the quest and
  the run so a verdict judged twice opens it once; the open units point at it (`child_quest`) and the infirmary
  reason names it. `stop()` kills a running script, which then saves nothing; the next Steward judges a run it
  finds working or in review from `script.json`, or opens again one that saved nothing (`release`, the run
  `cancelled`), and runs it anew.
- Delivers every done quest once, by its kind's convention (`deliverable.type`; step 7 of §3.1, `src/deliver/`):
  a branch, file, report or draft on a git territory stays on its branch for the owner to merge by hand; a plot
  folder of a territory without git is copied into the territory (a file it replaces is kept in
  `.runs/<quest>-replaced/`; a territory folder that is not there gets nothing); a draft is never sent, and
  reaches `done` through the seal its kind asks for; a plan's `subquests.json` (quest-draft JSON at the root of
  its plot) becomes open child quests (`created_by: council`, ids derived from the plan and the ref), all or none:
  a list it cannot read, a draft the kingdom refuses, a question, a party's parts (P1-18) or a circle open none,
  and the owner hears it once (`subquests_refused`, the bell, a warning in the log).
  Each delivery writes `.runs/<quest>-delivery.md` (the pull request's description: the quest, the verdicts of
  its last run, the letter, what was copied or opened, the commands to merge) and then stamps
  `deliverable.delivered_at` with `path` (and `branch`); a delivery that fails halfway is done again next tick and
  finds what it already did.
- Tells once when an open quest nobody can take (`quest.unclaimable`, the bell), withdraws it with
  `reason: null`, and keeps the notices in `.state/unclaimable.json` (`readUnclaimable`) for `elvaria quest list`
  and `show`. Rings once when a submitted quest waits for a judge the roster does not have (`unjudgeable`,
  P1-15: `different_model` and no judge of the kind outside its doers on another model); no file, no event.

## Does not

- Decide: who takes what, who verifies, when a quest may move are pure functions of the domain (`planTick`,
  `transition`, `selectVerifier`, `validateVerdict`, ADR 0002).
- Estimate mana from tokens against `tribes[].budget`, warn, reassign a long-paused quest
  (`mana.reassign_after_hours`) or ring when a pool sleeps (P1-22); kill a process itself (runner-core's
  `killTree` does, through the runner's `kill`); know git or a territory's programs (`Plots` is given, with the
  territory's checks resolved for `run-check`; `folderPlots` is a folder with no git, no checks and no diff, for
  the specs).
- Push, merge or send anything a quest delivered (stage 1, §9.1 item 11): the owner does, from the delivery note.
  Open a party's parts and its merge quest when a contract is delivered (P1-18).
- Read `process.env` or a treasury file itself: the composition root hands it the minimal env and a `Treasury`.
- Import a concrete runner, the registry package or anything of the world layer (§1.3).

## Depends on

- `@elvaria/domain` (state machines, `planTick`, schemas), `@elvaria/store` (files, inbox, lock),
  `@elvaria/eventlog` (log, journals, redaction), `@elvaria/runner-core` (`AgentRunner`, prompts, tool policy).

## How to test

```bash
pnpm --filter @elvaria/steward test
```

Specs build a throwaway kingdom in the OS temp folder (a space in the name) with the default registry read by
path, and run `FakeRunner` for both tribes; a fake verifier hands in its verdict as structured output.
`integration.spec.ts` takes ten quests all the way round (a crash, a failed review, a question, a seal, a
dependency, a hang) and stops the Steward in the middle: the new one loses no quest, every `attempt_log`
entry matches exactly one session, and the replayed log equals the files. `deliver.spec.ts` delivers a build, a
report and a sealed draft from worktree-like plots, and a document copied into a territory without git;
`subquests.spec.ts` opens a plan's sub-quests (again after a delivery that failed halfway) and refuses lists it
cannot follow; assignees leave their files in the plot through `leavingRunners` (`src/__fixtures__/deliver.ts`).
`scripts.spec.ts` copies the real `link-check` and `run-check` of `packages/registry-default/scripts/` into the
kingdom (`src/__fixtures__/scripts.ts`) and takes script quests all the way with no runner asked: a link check
that passes, one with a dead link and its scribe's follow-up, a territory check run from its resolved argv and its
knight's follow-up; params the catalog refuses; stand-in scripts that break, refuse the quest, print outside the
contract or outlive a short timeout. `scripts-restart.spec.ts`: a script that runs on while a tick applies the
inbox, a Steward stopped in the middle of it, one that died without output or before its verdict, and a follow-up
opened once. `background-checks.spec.ts` (P1-25): a check that ends only when the spec says holds no tick (the
inbox is applied meanwhile), dies when the Steward stops and runs again under the next one, dies when the quest is
cancelled, and leaves the judge the end of its log with the treasury value and a token the patterns know masked. `apprentice-breaker.spec.ts`: the
infirmary note after an apprentice overran or was cut. `review-breakers.spec.ts`: two verifiers stopped by the
token breaker, or by their CLI's turn limit, send the review to the infirmary and no third opens.
