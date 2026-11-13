# @elvaria/steward

## Does

- Runs the Steward (implementation-plan §3.1): `createSteward(deps)` takes `.state/steward.lock` (one Steward per
  kingdom), rebuilds from the event log what it already answered, and ticks every `dispatch.tick_seconds`.
  Ticks never overlap.
- One tick, in the order of §3.1: the inbox in id order (the owner first); the ends of the sessions it runs;
  sessions the files say run but it does not hold end, so no quest ever runs two sessions: at the first tick after
  start those the last Steward ran when it stopped or was killed count for nothing (P1-44, `reapLost` of
  `src/sessions/settle.ts`: the assignee goes on in a fresh session with its attempt given back, a judge leaves
  without counting toward a stalled review), and a review it left stalled without the move to the infirmary goes
  there before the plan (`src/restart.ts`); later, a
  session whose end could not be recorded ends as a crash; the inbox commands that waited, once more; the mana gauges; then the domain's
  `planTick` decides and the Steward carries it out: sessions past a breaker stop, characters on a fail streak go
  to the Temple
  (`character.suspend`, the bell), paused quests whose pool woke go on, claimed quests start, submitted quests get
  their checks and, in a later tick once those ended, the judge `selectVerifier` chose (or the machine's verdict
  under `machine_only`), returned quests go back to their assignee, open quests are claimed.
- Runs the machine's long work outside the tick (P1-25, `src/background.ts`): a submitted quest's checks and a
  script-tier run start in a tick and go on while later ticks apply the inbox, record the sessions' ends and give
  out work; `planTick` sees which quests have work running and which have checks ready (`BackgroundWork`). The
  work writes into its run folder and, for checks, a `check.start` and a `check.end` line (P1-10b: the owner
  and the world see that a quest in review with no judge is being checked, and how its checks ended: `pass`,
  `fail`, `error`, `stopped`), then puts the quest's own plot back with its `plot.restored` line (P1-47); never a
  quest or a character file. Work that ends on its own makes the loop tick at once
  rather than at its next beat (P1-10b), so a judge opens on checks that ended without waiting up to
  `tick_seconds`. Work for a quest that moved on (cancelled,
  judged, retried) is killed before each plan; `stop()` kills it all and the next Steward runs it again. A plot's
  `commands.setup` in the tick gets the stop's signal too (`plotOptionsOf`, P1-49): `stop()` kills an install in
  progress instead of waiting for it, the claim is given back, and the tick claims nothing more.
  `Steward.idle()` resolves once the work running now has ended (what a spec waits on). No more of it runs at once
  than `dispatch.max_background` (P1-47, 2 by default until a run measures the load): `planTick` starts checks
  first, then scripts, in the room the running work leaves, and the rest waits for a later tick; an acceptance
  part's checks, which run no command, go first and take no slot, and short work runs beside trials that hold
  every slot (P1-54).
- Files memos (PS-02, ADR 0024; `src/memos/`): when an assignee's run ends through a submit, a question or a
  crash (never a breaker), the Steward reads the letter's Memos section (runner-core's `memosOf`), hashes each
  memo's key with sha256 for its id (`memoIdOf`), and writes `memos/<id>.json` routed by the domain's `memoOf`, with
  `memo.filed` (the writer's) and `memo.routed` lines; a memo already filed is not filed again, and a line that
  follows no memo, an unknown kind or a write that fails is a warning, never the run's end. No quest moves. The
  owner's `decide_memo` closes a memo once (`memo.closed`, in the journal of the quest whose letter held it); a
  continuing assignee's prompt lists the memos its quest filed (`filedMemosOf`). (PS-22, `src/memos/objection.ts`) An
  objection contests the fail the run came back with (the owner's first, as the run's prompt read it): the domain
  routes it, and the move that ends the run sets the quest's pending `objection`; the next review takes a second
  judge (never the first one, never the machine), whose prompt holds the contested verdict and the memo
  (`objectionFor`); its verdict carries the `objection`, clears it from the quest and closes the memo (`sustained`,
  `overruled`), a pass taking the first fail out of the assignee's windows. A second judge's fail returns the quest
  with the contested verdict beside it (`continuationOf`). The owner's `decide_memo` on a pending objection takes it
  off its quest (`quest.edited`), and any judge may take the review again. (PS-03b) A create_quest or edit_quest
  naming `memos` closes them as handled by its quest once the quest has the work (at creation or edit, or at the
  owner's confirm of a draft); `escalate_memo` keeps the triage's advice on an open memo (`memo.escalated`).
  (PS-22b, `src/memos/{authoring,amendment}.ts`) An amendment is routed by who wrote its quest; the submit that filed
  one ends instead as an `ask` keeping `blocked.amendment`, no bell while its author decides. Jobs on call
  (`StewardDeps.onCall`) run outside the tick whenever they have work, one at a time with the scheduled ones; the
  view lists the quests waiting on their author (`JobView.amendments`). `decide_amendment` (source `chancellor`, told
  as the author's) rewrites the description while no session holds the quest, closes the memo `accepted` or
  `rejected` and answers the quest with the note, waiting in the inbox while the doer cannot go on; `owner` keeps the
  memo open with the advice and makes the quest the owner's question. The owner's `answer` or `decide_memo` on such a
  quest settles it too.
  Commands with `source: chancellor` are told as the Chancellor's (`actorOfCommand`), and their `command.*` lines
  carry the source.
- Runs the jobs of `kingdom.schedule` (PS-03, implementation-plan §3.16.3; `src/schedule/`): no cron. At the end
  of each tick the domain's `dueJobs` says which job's hour has come on a local day it has not run; an `in_tick`
  job (no model) runs there and then, an `off_tick` job (may call a model: PS-03b's triage, PS-21c's docs graph,
  given as `StewardDeps.jobs`) runs outside the tick, one at a time, and `stop()` aborts it. A job that ends without
  throwing writes `schedule.ran`; the next start reads the last day of each from the log, so a job runs once a day
  however the clock moves, and one a stop cut short runs again. (PS-03b) Jobs due together go by their hour, an
  in-tick job waits while an off-tick job of an earlier hour runs (the triage before the digest), and an off-tick job
  may wait for `ready` (its view names the tribes a session runs on, `busy`). The first job is the digest (`digestJob`, given
  `StewardDeps.digest`): the domain's `attentionQueue` over the files, the open memos, mana as the log last read it
  (`digestStateOf`) and the Steward's own notices (`noticesOf`: unclaimable, unjudgeable, judges out of mana); the
  `Digest` port of the composition root words it and writes `digest/<day>.md`, then one `digest.written` line and
  one bell (`digest`). No model, no mana.
- Rings once for a submitted quest whose judges are all held by their mana (PS-03, (d) of P1-50;
  `src/judge-waits.ts`): `planTick`'s `judge_waits` name it with the pools that hold its judges and their reset when
  a reading says; the bell `judge_mana` rings once per quest, as for a quest without a judge (`unjudgeable.ts`), and
  the digest lists it. Who judges, and when, is unchanged: the judge opens once a gauge reopens (ADR 0008).
- Sets aside checks that failed because of their environment (P1-54, `src/review/environment.ts`): a failing check
  whose log shows a line of the territory's `environment_errors` (Docker not running, a container gone) gets no
  judge, so its assignee keeps its level and no flake quest opens; the bell says so once per run (`environment`
  notice, `src/notice.ts`) and the checks run again `ENVIRONMENT_RECHECK_MINUTES` later until they pass.
- Trips the breakers (§3.4, P1-06; `src/sessions/breaker.ts`): `planTick` names each held session past its
  minutes (`quest.budget.max_minutes`, from its own attempt_log entry) or its tokens (the running total of its
  `usage` signals against `budget.max_tokens`, times `breakers.verifier_tokens_multiplier` for a judge); turns are
  the CLI's own limit (`breakers.max_turns` in the request), which ends the same way; the Steward sinks the assignee into the swamp, kills
  the session's process tree, commits the work as `chore: wip <quest> (<trip>)` (a refusal keeps it in the plot
  and says so in the reason), sends the quest to the infirmary (`quest.infirmary`, `breaker:<trip>: <detail>`) and
  rings the bell; a verifier past a breaker leaves the review to the next one, until the second of a run
  (`reviewStalled`, P1-23): then the quest goes to the infirmary with the bell, and no third verifier opens; the
  owner's `retry` brings it back to review with a new judge, and the count starts over (P1-26). A verifier that
  leaves with no verdict at all (its CLI failed, its output was none, its session was lost while the Steward ran) counts the same, and
  the stall it ends goes to the infirmary as `review:no_verdict` (P1-33); one that hands in a partial verdict
  (`verdict_partial`) made progress and counts apart: the third of the open group sends the review to the
  infirmary as `review:partial_verdicts`, no fourth judge opening (P1-42). Breakers measure a session as its holder's tribe allows:
  minutes only for a tribe without `usage` (`measureOf`, P1-33). A CLI
  that stopped at its own `--max-turns` or budget gets the same end, a verifier's included. When the quest's journal shows an apprentice of that session past
  its minutes or cut at its turns, the reason asks the owner for a child quest for the work it left (§3.12). A quest whose secrets the treasury lacks, or its territory no longer
  allows, goes to the infirmary (`breaker:secrets`) instead of being claimed and released every tick; an
  owner's answer to such a blocked quest is refused (`secrets_lacking`).
- Says why a quest goes to the infirmary once, as a cause (`src/infirmary.ts`, P1-32): a `trip` (the breaker, or
  `no_verdict`, `partial_verdicts`, `max_attempts`, `script_broken`, `script_usage`, `script_fail`) and a `detail`
  (what was said, a refused patch, the forbidden paths changed, a WIP commit refused, an apprentice cut short, the
  script and its follow-up, the verifiers stopped, the partial verdicts handed in). The
  `quest.infirmary` line carries both, beside the one English `reason` built from them for the chronicle, worded
  as before P1-32; the `infirmary` notice carries all three, so a bell can say why in the owner's language.
- Keeps the pid of every session it holds in `.state/sessions.json` (written before each tick ends, emptied at
  stop); a session that goes on in another process (a reply tried again, a reminder of the letter, P1-33) is
  written again with that process's pid and spawn time (`Sessions.respawned`), and the `quest.*` line that tells
  the run's end names those sessions (`data.sequels`, `runOf`, P1-49), since attempt_log keeps one entry for the
  run. At start, before the first tick, it kills the tree of each pid the last Steward left there whose process
  started when that session was spawned (`processStartOf`, within a minute), and leaves a pid that now belongs to
  another process, or whose start the system would not tell, alone, with a warning. `sessionsLeftBehind(root)`
  tells `elvaria doctor` which of them still run, and nothing while a Steward holds the lock; `stewardRuns(root)` is
  that lock question alone, which the CLI asks before it waits for the Steward's answer to a command (P1-56).
- Watches mana per gauge (§3.5, ADR 0009; `src/mana/`): a session that hits its account's limit pauses its quest
  (assignee kept; a verifier leaves the review); the account is read at once (`mana/limit.ts`, no model call) and
  the gauges it shows spent for the session's model sleep, the windows the session reported in band first (P1-48: a
  rejected `rate_limit_event` of Claude names the window it spent and its reset; read as the Agent SDK types it, no
  real line recorded yet) (`mana.exhausted`, with `model` for the cap of one model:
  Argon's spent cap stops only the Argon characters, P1-22, and `resets_at` when the limit or the reading named the
  reset, P1-32), else the pool of that model; every other session they
  bind is killed and pauses and idle characters they bind fall asleep; each paused assignee's work is committed as
  `chore: wip <quest> (mana)` after its session ends. A tribe with a pool asleep is probed (`mana.probe`) one minute after
  the reset its session or its last probe named, again every two minutes for ten minutes after a reset that comes late, else
  every `probe_interval_minutes` (`nextProbeOf`); a probe that goes through wakes the pool (`mana.restored`),
  sleepers wake and the paused quests go on with the same character and attempt, in a fresh session from the
  letter (`--resume` only with `resume_after_mana`, then with a short prompt). Awake pools are read without a
  model call (`probe({ping: false})`) in the background right after each session ends and every interval while
  quests are in play; windows a session reports in band (`mana` signal) come in too: `mana.level` on change, a
  model's own cap with its `model` since P1-32 (the HUD leaves those out, `elvaria doctor` shows them); a
  gauge at the cap takes no new session, nor one that the next session would take to the cap (P1-48: each reading
  is set against the one it replaces for the share of its window a session takes, `mana/shares.ts`, the largest
  kept and folded again from the log's `mana.level` lines after a restart; 7 % before any is measured), one whose window reads spent sleeps (a tribe with only a model's cap asleep
  is still read, and probed without a model call). A pool and window the account gives no figure for is estimated
  from the sessions (`mana.level` `source: estimate`); a gauge the world draws on that nears the cap warns once
  (`mana.warning`). The bell rings when a gauge warns, sleeps or wakes (`mana_warning`, `mana_asleep`,
  `mana_awake`). With `mana.reassign_after_hours`, a quest asleep that long goes to the character planTick chose
  (`paused_mana.reassign` by the Steward; the sleeper lets go) and starts. The owner's `wake` (`elvaria wake`)
  probes at once. The gauges asleep and warned are rebuilt from the log at start.
- Is the only writer of quests and characters (ADR 0005): every move of a quest or a character goes through
  `transition()` or `transitionCharacter()`, every other change of a field (a new or edited quest, a rank, a level,
  a model, the windows after a verdict) through the domain's own function for it; each is written to its file, then
  told in one event line carrying the view after it (P0-09), in the log and the quest's journal. Replaying the log
  over the morning gives back the files.
- Applies the owner's commands: `create_quest` (an id derived from the command id, so a command applied twice
  never makes two quests), `confirm`, `cancel` (kills the session), `archive`, `retry`, `seal` and `return` (the owner's
  verdict, `verdicts/<quest>-<n>-user.json`, weighed three times; a return needs notes of 20 characters and takes
  `fail_kind` `other` by default; a return with `rejudge` blames the judge and leaves the assignee's windows,
  fail streak and level alone, P1-40), `answer` (waits in the inbox until the asker is free and its pool has mana;
  within `dispatch.resume_after_answer_minutes` of the question, and when the adapter can, the asking session goes
  on with `--resume`), `reassign` (the owner's character, the level aside; or the Steward's own choice),
  `set_rank`, `edit_quest` (refused when the quest moved since the owner read it), `wake`, `suspend` and `release`
  (P1-26, `inbox/character-commands.ts`): a suspended character takes no work; the quest it works on ends its
  attempt `returned` (the session killed, its work committed as WIP) and waits for it or for a `reassign`, the
  quest it judges goes back to review for the next judge, a claim not started opens again (`claimed.release`), and
  a quest it sleeps on opens again without it (`paused_mana.suspend` → `open`, P1-22); `release` makes it idle with its fail streak at 0. Both lines
  (`character.suspend`, `character.release`) are the owner's. `set_level` (P1-29,
  `inbox/character-settings.ts`, on `settingByOwner`, the one path for a setting of a character's own fields):
  the character's new level and `level_since`, told as the owner's `character.level_up`/`level_down`; its own
  level is refused `same_level`. `set_model` (P1-22, on the same path): the character on another model of its
  tribe, told as the owner's `character.model_changed`; refused `same_model` or `model_not_of_tribe`. A `create_quest` naming an `assignee` (P1-29) gives the new quest to it by the
  owner's `reassign` (`open → claimed`, the level aside); an assignee unknown, of another class, suspended or of a
  disabled tribe refuses the command and creates no quest, as for `reassign` (the domain's `namedAssignee`).
  Other kinds are refused with `unsupported` until their task. A `create_quest` that asks for a secret its
  territory does not allow is refused with `secret_not_allowed` (ADR 0013).
- Writes what each session's prompt carried on the line that opens it (`load_trace`, PS-01b, `sessions/load-trace.ts`):
  the scripture files and their lines, the skills and the prompt's blocks; `command.applied` and `command.rejected`
  name the command's `kind`, and `check.end` names the check whose environment failed when the run is set aside
  (`environment`, (b) of P1-54), so the metrics ledger reads them from the log.
- Quotes a gazetteer stamped with the commit it was written at (`<!-- elvaria:commit <sha> -->`, PS-21) without the
  stamp and with how many commits touched each top-level folder since, up to the quest's fork point
  (`sessions/gazetteer.ts`, `Plots.drift`, optional: folder plots have none); a drift that cannot be read costs the
  note and a log line, never the prompt.
- Opens sessions through `AgentRunner` only (ADR 0006, 0021): the plot, the prompt (`sessions/prompt.ts`) and tool
  policy of `runner-core`, the budget, `.runs/<quest>-<n>`, and the env (§3.9): the minimal env it was given, the
  `ELVARIA_*` context of the hook and exactly the quest's `secrets_required` from the treasury (`sessionEnvOf`
  of `sessions/secrets.ts`); a name the territory no longer allows or the treasury lacks opens no session
  (`secretsLacking` asks first, by name only). The same secrets (`questSecretsOf`, read before the plot) go to
  `Plots.prepare` for the territory's `commands.setup`, so an install from a private registry works before the
  first session (P1-30); a quest that asks for none gives setup none and reads no treasury. A
  runner's `capabilities` narrow its tribe through `tribeLimitsOf`; a tribe without a runner takes no work.
- Masks what a session leaves behind with that session's secret values and the patterns, before the kingdom
  keeps it (`maskFinished`, ADR 0013): the handover letter (`redactHandover`), the question, and the verifier's
  output, so the verdict notes the next prompt reads hold none.
- Turns a session's end into the quest's move: submit (after committing the plot with `plotCommitMessage.submit`;
  a commit the territory's hooks refuse sends the quest to the infirmary, `breaker:commit`; a plot whose changes
  (`Plots.touched`) include a path of `laws.forbidden_paths` or a dotenv file, which only a program the session's
  shell ran could write, is not committed and goes to the infirmary with the bell, `breaker:forbidden_paths`,
  `detail.paths`, P1-49; every commit of a session's work checks so (`commitPlot`: the submit and each WIP; the
  Steward's own commit that takes a delivered contract's `subquests.json` off its branch, `closeContract`,
  goes through it too, P1-55), a WIP left in the plot with the reason, and a plot whose changes cannot be listed is not committed either;
  the same read names the paths of `laws.protected_paths` the work changed, and the submit sets the royal seal and
  `quest.protected_changes` through `Move.before` (`protectedMarkOf`, PS-04, ADR 0026), as the machine's merge of a
  party does from its own changes (`protectedChangesIn`); a part of a party gets the paths without the seal, which
  its merge quest always asks for;
  before it, on a
  territory with `laws.patch_paths`, the assignee's `elvaria.patch` is applied through `Plots.applyPatch` and told
  in a `plot.patched` line, and a patch that touches other paths or does not apply sends the quest to the
  infirmary instead, `breaker:commit: elvaria.patch was not applied: …`, P1-28; the next run's prompt reads why
  back from the run's `quest.infirmary` line in the quest's journal, `continuationOf` and `refusedPatchOf`:
  `detail.patch` since P1-32, the reason's prefix on an older line, P1-31), a question (`ask`;
  one the owner already answered, left in the letter, is a submit), mana out, a crash, the CLI's turn or budget
  limit (breaker). For a verifier: the verdict file (a partial one as `<quest>-<n>-p<k>`; a pass without notes is
  no verdict, P1-40), the ritual's pass rule over the checks (`underPassRule`), the judge's breaks in a scratch plot
  (`withBreaksWeighed`: too few make the pass a partial, P1-40), `validateVerdict`, `verdict.*`, the move, the
  assignee's windows and fail streak (`withVerdict`), then `levelChange`. A session's prompt names the shell its
  tribe's adapter declares for this OS (`shellOf` with `StewardDeps.platform`, `process.platform` by default, P1-40),
  and its tool policy and prompt get the search commands when that adapter's CLI has no search tool
  (`capabilities.search: false`, P1-53).
- Keeps what a character could not tidy when the Steward commits (P1-55, `src/sessions/commit.ts`, `stop-letter.ts`): every
  commit comes with the run's folder in `.runs/`, so a scratch file at the plot's root (`isScratchFile`) is moved to
  `set-aside/` instead of into the commit, a commit the hook refuses leaves `wip.patch` there, and a quest left with no
  `handover.md` gets a minimal one (`writeStopLetter`; a letter the character wrote is never touched).
- Applies the limits `tribeLimitsOf` gives a tribe its adapter narrows (§3.14, P1-33; `src/sessions/spawn.ts`):
  a judge of a tribe without `structured_output` gets the verdict's schema in its prompt and its verdict cut out of
  its last text (runner-core's `spawnParsed`), checked by `judgeVerdictOf`, which names each issue; an unusable
  reply is tried once more in `<run_dir>/retry/`, resumed when the tribe can. An assignee of a tribe without
  `tool_gate` has no Stop hook: the Steward notes its letter when the attempt starts (`letter-start.json`), and a
  session that ends with the letter unchanged is followed by a reminder session (`<run_dir>/letter-<k>/`, at most
  `LETTER_REMINDERS_MAX`, resumed when the tribe can), then the quest goes on and the journal tells the judge
  (`agent.notification` `handover_unchanged`), as the hook would (ADR 0010; `src/sessions/letter.ts`). A tribe
  without `context_file` reads the territory's `context_files` in the system part of its prompt. Among judges
  otherwise equal, `selectVerifier` takes one whose tribe has structured output first.
- Judges tests as the product in a scratch plot (ADR 0022, P1-20; `src/review/scratch.ts`): when the quest's
  ritual (`ritualOf`: its tags may choose `mutation_check`) has `scratch_plot` and its plot is a worktree, its
  checks run as `Plots.trial` (a fresh scratch plot of the branch, reset, three runs, coverage against the base),
  its judge opens in that plot (`Plots.scratch`) with Edit and Write and without commit or push, and the plot is
  removed after the judge's session whatever its end (`Plots.releaseScratch`, also after a breaker, the machine's
  verdict and at archive). On a territory with exclusive checks the judge opens only once the Steward holds the territory's exclusive lock, kept for its session (`src/review/exclusive.ts`, released at its end, by a tick when it lost its session, and at `stop()`), so it runs e2e too; after failing checks it waits for no lock and runs no exclusive check (P1-54: the pass rule fails the quest, the judge reads why); the checks of other quests wait for it (`exclusiveWaitMinutes`). A verdict that fails on a flake (`flake_check`, or a judge's `flaky`) opens one quest
  of the ritual's `flaky_follow_up` (`fix`, knight) before the quest moves on; the quest's branch never changes.
- Puts the quest's plot back to its commit after a judge outside a scratch plot (P1-44, `src/review/after-judge.ts`),
  and after the machine checks in the quest's own plot, before the judge opens (P1-47, `src/review/checks.ts`): the
  judge has no Edit or Write, but the checks' commands, its own or the machine's, may write in the plot (a
  generator, a formatter); the work was all committed before its review, so what is changed or untracked goes
  (`Plots.restore`; ignored files stay, `src/review/restore.ts`), a warning names it and a `plot.restored` line in
  the quest's journal lists it (with the judge's session after a judge, none after the checks). A plot git cannot
  put back costs a warning and stays as the commands left it.
- Tells an assignee that goes on with a quest (revived, or returned) which checks the machine will run on its work:
  it asks the plot what the branch touched (`Plots.touched`, P1-43) and the prompt names what `selectChecks` picks
  for it; a plot that cannot say gives no such section, and the session still opens.
- Runs the territory's checks on what the quest touched before a judge's session opens (`Plots.check`: runChecks
  of P1-07 in `elvaria run`, outside the tick, its `signal` aborted when nobody waits for them any more), with the
  quest's secrets from the treasury (`PlotCheck.secrets`, `questSecretsOf`, P1-10b), resolved in the tick before
  they start; a quest whose secrets are gone by then goes to the infirmary (`breaker:secrets`) and runs none: their
  results go into the judge's prompt, the verdict and `quest.checks_run`. The run's next judge (after a partial
  verdict, a breaker or a session without a verdict) gets the same results while the plot's head is the commit they
  ran on (`Plots.head`, P1-38); a moved head and a plot without git get their own run. A judge in a scratch plot
  leaves with its plot: the next one gets a fresh scratch plot (`Plots.prepareScratch`, after `commands.setup`, then
  `commands.reset` once with its own log, P1-47, under the exclusive lock, P1-54) and the same trial while the head stays, the trial run again once
  it moved or the plot could not be made or reset (P1-42). A
  judge a breaker stopped is not chosen again in that run while another judge may take the review (domain
  `cutVerifiersOf`). The prompt shows the end of each failing check's log (`src/review/log-tail.ts`: the last 40 lines, at most
  2 000 characters a check and 4 000 for all of them), masked with the session's secret values and the patterns, because the log lies
  in `.runs/`, outside the plot, where the judge's tools do not reach; so does the prompt of an assignee whose work
  came back, for the checks of the verdict that returned it (P1-10b). Under
  `verifier_same_family = machine_only` with no judge of another family, the machine's verdict comes from them
  alone (`verifier_id: machine`). A plan's `subquests.json` is checked the same way first (check `subquests`,
  `src/review/deliverable-checks.ts`, P1-15): what the delivery would open, or why none, so a list the Steward
  would refuse goes back to the mage. From PS-06 that includes a plan the domain's `planIssuesOf` finds not ready
  (a session sub-quest without `scope_paths`, two that may run at once on scopes that meet, a given peak context
  above the budget, a description outside the quest template): the check fails as `incomplete` whatever the judge
  says, and the delivery reads the same answer. From PS-06b the check also holds the plan file to its template
  (`src/review/plan-file.ts`): a `plans/*.md` the quest changed (`Plots.touched`) with every section of the domain's
  `PLAN_FILE_SECTIONS`; a plot that does not list `subquests.json` among its changes cannot say what the quest wrote,
  and the log says the file went unchecked. Only before the judge: the delivery after the seal does not read it. The judge's prompt carries the branch's diff (`Plots.diff`), the craft of
  its class (`registry/<class.prompt_file>`, as every session's does), and where the last judge of the run
  stopped when it left a `partial` verdict, and (PS-05) the files the work changed outside the quest's `scope_paths`,
  the territory's `shared_paths` aside (`src/sessions/out-of-scope.ts`, matched with `globToRegExp`), which the
  `quest.submitted` line carries too as `out_of_scope`: a signal for the judge, never a fail. Gives the plot back when a quest is archived (`Plots.release`; a
  dirty worktree stays, with a warning).
- Runs the script tier itself (§2.5, §3.12, ADR 0017; `src/script/`): a `create_quest` whose `script.params` do
  not fit the catalog's `params_schema` is refused (`invalid_script_params`); an open script-tier quest is claimed
  with no assignee, gets its plot (its `commands.setup` given the quest's secrets, or the quest goes to the
  infirmary with `breaker:secrets` when the treasury or the territory cannot give them, P1-47), starts, and
  `node registry/scripts/<id>.mjs --params <json> --context <json>`
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
  a list it cannot read, a draft the kingdom refuses, a question or a circle open none, and the owner hears it
  once (`subquests_refused`, the bell, a warning in the log).
- Opens a party when its contract quest is delivered (implementation-plan §3.13, ADR 0020, P1-18, `src/party/`):
  the contract's list holds parts only (`party_role: part`, `contract`), and each opens in the contract's party,
  waiting for the contract, with the merge quest the Steward adds itself (domain's `mergeQuestOf`: a knight's
  build on every part, their tags, the royal seal); a part listed by a plain plan, anything else listed by a
  contract, a party inside a party, or a list that breaks the party's invariants (`partyIssues`: one territory)
  opens none. Then the contract's `subquests.json` leaves its branch in a commit of its own (`closeContract`),
  since every branch of the party starts from it. A new plot starts on the branch its quest builds on (domain's
  `plotBaseOf` → `Plots.prepare({from})`): a part on its contract's (or a part it waits for), a quest on a
  dependency done but not merged yet (P1-16 (f)). The merge quest's first run is the machine's (`party/machine.ts`,
  P1-18 (h)): claimed with no assignee, its parts merged in, submitted to the checks and a judge with no knight's
  session; a merge that stops is released (the conflict stays in progress in the plot) and a knight takes the next
  run, as after a judge fails the machine's. Before each session of the merge quest's knight, never a
  judge's, its parts are merged in (`Plots.merge`; a conflict is left in progress for the knight, and the log
  says so), and again right before the checks of a run, so the parts a conflict left go in once the knight concluded
  it (`mergePartsBeforeChecks`, P1-55); before its judge the check `party` says whether every part is in (`Plots.unmerged`; a missing part
  fails the run as `incomplete`, so the next session gets it). The territory's checks run by the quest's place
  (`PlotCheck.party_role`: a part and the contract quest skip `defer_to_merge` checks, the merge quest runs them all), and the delivery
  note of a party's quest says where the party stands (`partyStatusOf`) and that only the merge quest's branch is
  merged by hand. (P1-21) On a territory whose `blind_trial` is due, the delivery adds the `acceptance` part
  (domain's `acceptanceQuestOf`) before the merge quest, which waits for it too; its plot starts on the contract's
  branch, it runs no territory check, and `selectAssignee` keeps its writer apart from the parts' assignees, as it
  keeps every judge of a party from the party's work (also for the owner's `reassign` without a name). (P1-37) The
  delivery decides the blind trial once, from the lead's drafts (`acceptanceIdFor`), before any part is made: every
  part then waits for the acceptance part (domain's `partWaitsFor`), and the acceptance part is written first, so a
  crash never leaves a part waiting for a quest never made. Each merge
  that takes a part in or stops at one writes `plot.merged` to the log and the merge quest's journal; the merge
  quest's judge reads `Plots.diff(plot, 'after_merges')`, its own work only.
  Each delivery writes `.runs/<quest>-delivery.md` (the pull request's description: the quest, the verdicts of
  its last run, the letter, the paths the Steward applied from the assignee's patch over every run, read from the
  quest's `plot.patched` lines (P1-31), what was copied or opened, the commands to merge) and then stamps
  `deliverable.delivered_at` with `path` (and `branch`); a delivery that fails halfway is done again next tick and
  finds what it already did.
- Tells once when an open quest nobody can take (`quest.unclaimable`, the bell), withdraws it with
  `reason: null`, and keeps the notices in `.state/unclaimable.json` (`readUnclaimable`) for `elvaria quest list`
  and `show`. Rings once when a submitted quest waits for a judge the roster does not have (`unjudgeable`,
  P1-15: `different_model` and no judge of the kind outside its doers on another model); no file, no event.
- Builds the territories' code graphs outside the tick (PS-21, ADR 0029, `graph-builds.ts`) through the optional
  `deps.graphs` port (runner-core's `codeGraphsOf`): for each territory with `code_graph` on, the default branch's tip
  every tick and a quest's base commit when its session opens; one build per territory, the latest commit next,
  `graph.built` / `graph.failed` lines (a failed commit is not tried again by this Steward), killed at stop. A session
  whose graph is built gets the graph commands in its policy, `GRAPHIFY_OUT` and graphify's folder in its env, and
  the prompt's graph block (`sessions/graph.ts`); one whose graph is not built yet opens without it. For a quest
  whose kind delivers sub-quests (PS-21b, `sessions/plan-graph.ts`), its mage reads the impact of the quest's scope
  in that block, and its judge the sub-quests the graph links (the domain's `planLinksOf` on `subquests.json`), a
  warning in the review that fails nothing.

## Does not

- Decide: who takes what, who verifies, when a quest may move are pure functions of the domain (`planTick`,
  `transition`, `selectVerifier`, `validateVerdict`, ADR 0002).
- Switch or rotate accounts: a quest asleep too long goes only to a character whose own mana is open; kill a
  process with code of its own (a session dies through its runner's `kill`, a session the last Steward left
  through runner-core's `killTree`, a script through runner-core's `startChild`); know git or a territory's programs (`Plots` is given, with the
  territory's checks resolved for `run-check`; `folderPlots` is a folder with no git, no checks and no diff, for
  the specs).
- Push, merge or send anything a quest delivered (stage 1, §9.1 item 11): the owner does, from the delivery note.
  The parts it merges into a merge quest's branch stay in that branch, inside the territory's own repository.
- Read `process.env` or a treasury file itself: the composition root hands it the minimal env and a `Treasury`.
- Import a concrete runner, the registry package or anything of the world layer (§1.3).
- Word the digest or write its file: it decides when and what; the `Digest` port of `apps/cli` writes it in the
  owner's language (the Steward imports no i18n, PS-03).

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
`party.spec.ts` runs a party on a real git repo (`src/__fixtures__/party.ts`, P1-18): contract, two parts (the
first on the contract's branch, the second on the first's, which it waits for), the merge quest with both merged,
its `party` check, judges from outside the party, the seal and the notes; the machine's merge a judge failed, taken
by a knight who reads the verdict; then three parts editing one file, two conflicts, the knight resolving them over
two runs.
`party-rules.spec.ts` refuses the lists that break the party rules, starts a sub-quest on the branch of the
one it waits for (P1-16 (f)), and takes the parts of a contract archived after its delivery (P1-21 (a)).
`blind-trial.spec.ts` runs a blind trial (P1-21): the acceptance part on the contract's branch, its writer apart
from the parts' assignees and blind to their work, the merge quest holding both sets of tests, its judge reading
only what came after the last merge, and one `plot.merged` line; (P1-37) the acceptance part written and run
before every part, which waits for it and never starts on its branch.
`patch.spec.ts` applies or refuses an assignee's `elvaria.patch` on real git repos (`src/__fixtures__/git-plots.ts`,
P1-28), then checks that the delivery note names exactly the patched paths and has no such section without a patch,
and that the run after a refused patch reads why in its prompt while the first run does not (P1-31).
`restart.spec.ts` (P1-44): a session that went with the last Steward (its pid dead in `.state/sessions.json`) costs
no attempt and its character goes on from its letter, a judge lost so counts toward no stalled review, a review left
stalled without its move to the infirmary goes there at the next start (no verdict, partial verdicts), and one the
owner retried before the stop gets its new judge. `after-judge.spec.ts` (P1-44): on real git repos, a judge whose
command rewrote the contract and left output leaves the plot clean and one `plot.restored` line; the returned
assignee opens on the commit, so the judge's change never reaches the branch; a plot that cannot be put back costs
a warning. `checks-restore.spec.ts` (P1-47): a drift check that regenerates files in the plot leaves it clean, with
one `plot.restored` line and no session, before the judge opens; a plot that cannot be put back costs a warning and
the judge still opens. `scratch-again.spec.ts` (P1-42, P1-47): the run's second judge in a scratch plot gets a fresh
plot at the same head and the first judge's trial, which runs once; with a `commands.reset`, that plot is reset
once (its own log), the first judge's three times by the trial. `background-cap.spec.ts` (P1-47): two quests
submitted in one tick get their checks one after the other under a cap of one, both at once under two.
`infirmary.spec.ts` builds the reason of every trip from its detail, word for word as before P1-32, and reads a
refused patch back from a new line and from an older one (P1-32).
`scripts.spec.ts` copies the real `link-check` and `run-check` of `packages/registry-default/scripts/` into the
kingdom (`src/__fixtures__/scripts.ts`) and takes script quests all the way with no runner asked: a link check
that passes, one with a dead link and its scribe's follow-up, a territory check run from its resolved argv and its
knight's follow-up; params the catalog refuses; stand-in scripts that break, refuse the quest, print outside the
contract or outlive a short timeout. `scripts-restart.spec.ts`: a script that runs on while a tick applies the
inbox, a Steward stopped in the middle of it, one that died without output or before its verdict, and a follow-up
opened once. `background-checks.spec.ts` (P1-25): a check that ends only when the spec says holds no tick (the
inbox is applied meanwhile), dies when the Steward stops and runs again under the next one, dies when the quest is
cancelled, and leaves the judge the end of its log with the treasury value and a token the patterns know masked.
`check-signals.spec.ts` (P1-10b): the checks get exactly the quest's secrets (none for a quest that asks for none),
write `check.start` and `check.end` (`stopped` when the Steward stops under them), send a quest whose secrets are
gone by then to the infirmary, leave the returned assignee the end of the red check's log masked, and the loop
ticks as soon as they end, not a beat later. `setup-secrets.spec.ts` (P1-30): the plot of the assignee and of the
judge gets exactly the quest's secrets for its setup (none, and no treasury read, for a quest that asks for none),
and a treasury that cannot give the values by then prepares no plot and gives the claim back; a script-tier quest's
plot gets them too while its script gets none, and one whose secrets the treasury lacks goes to the infirmary once,
never claimed and released every tick (P1-47). `stop-setup.spec.ts` (P1-49): a stop kills the setup of the plot in
progress, gives the claim back and claims nothing more. `forbidden-paths.spec.ts` (P1-49): on real git repos, an
assignee that leaves `infra/secrets/key.txt` or `apps/api/.env` in its plot goes to the infirmary with
`forbidden_paths`, the bell and nothing committed; a clean plot submits as before; a pause for mana leaves such work
uncommitted and says why; a plot whose changes cannot be listed is not committed.
`apprentice-breaker.spec.ts`: the
infirmary note after an apprentice overran or was cut. `review-breakers.spec.ts`: two verifiers stopped by the
token breaker, or by their CLI's turn limit, send the review to the infirmary and no third opens.
`environment-checks.spec.ts` (P1-54): checks whose log shows their environment failed get no judge, no level
change, no flake quest and one bell, wait `ENVIRONMENT_RECHECK_MINUTES` before they run again, and are judged once
they pass. `trial-red.spec.ts` (P1-54, real git): after a red trial the judge of a scratch plot opens while another
quest keeps the exclusive lock, and gets no exclusive check's command.
`digest.spec.ts` (PS-03): the digest is written once a day at `schedule.digest.at`, rung once, and not again when
the clock goes back and forth or a new Steward starts the same day; it lists the quests nobody can take and the open
memos in their groups with their commands; no runner is asked; a port that throws warns once and tries again at the
next start. `judge-waits.spec.ts` (PS-03): a quest whose only judge's account is spent rings `judge_mana` once, is
in the digest with the pool asleep, and is judged by that judge once the window resets. `schedule.spec.ts` (PS-03):
jobs outside the tick run one at a time without holding it, write `schedule.ran` when they end, stop unrecorded with
the Steward and run again at the next start, and warn when they throw.
