# @elvaria/runner-core

## Does

- Defines the one interface between the Steward and an agent CLI (implementation-plan §3.7, ADR 0006, 0021):
  `AgentRunner` (`tribe`, `adapter`, `capabilities`, `spawn`, `probe`, `doctor`), `SpawnRequest`, `RunningSession`
  (`session_id`, `pid`, `signals`, `wait`, `kill`), `RunnerSignal` and `RunResult`. `RunResult.rate_limited` tells
  a session that ran out of mana from a crash; `RunResult.question` is the Question section of the handover
  letter (§2.4), read by `readQuestion` after every session. For the mana gauge (P1-05, §3.5) the signal `mana`
  carries the account's windows a session reports in band, `ProbeResult.windows` those a probe read, and
  `probe({ping: false})` only reads them, without calling a model.
- Ships `createFakeRunner()`: characters that play a scenario in process (`submit`, `crash`, `hang`,
  `rate_limit`, `forbidden_command`, `ask`, `scratch_commit`: a judge in its scratch plot that tries
  `git commit` then `git push`, P1-20, and `spawn_child`, which runs the suite's spawn probe for real, P1-12e),
  chosen per spawn by `scenarioOf` or by env `ELVARIA_FAKE_SCENARIO`.
  It writes the letter, blocks the forbidden push through the policy when it declares `tool_gate`, keeps a
  resumed session id, and records every request for the Steward's tests. Its `probe` answers one result, or one
  per call (a pool that wakes on the second probe).
- Builds `ToolPolicy` from class + territory laws + role (`toolPolicyOf`): `tools` (Claude `--tools`), `allow` and
  `deny` rules in Claude Code syntax, the apprentice (`Agent(apprentice)` in a class is a flag), and the laws the
  hook enforces; `search_commands` (`git grep`, `git ls-files`) for a class with Glob or Grep on a git plot when
  the tribe's CLI has no search tool (`cli_search: false`, the adapter's `capabilities.search`, P1-53). A verifier never has Edit, Write or NotebookEdit, except in its scratch plot (`scratch: true`,
  ADR 0022, P1-20): Edit and Write even when its class denies them, `git status`/`git restore`, the territory's exclusive checks (the Steward holds their lock for its session; not with `exclusive: false`, a judge after failing checks, P1-54), and a deny rule on
  `git commit` plus the law `NO_HISTORY_COMMAND` (commit, merge, reset, branch, stash, worktree…) for the hook; a character with a shell may run the
  territory's non-exclusive checks, and one that also edits files its `commands.generate` (P1-24); every session
  is fenced (no `git push`, no `.env`, no built-in agent, no `Edit` on `laws.read_only_paths`, which stay
  readable, nor on git's own folder `GIT_PATHS` = `.git/**`, P1-49: agy 1.5.4 wrote `.git/`, Claude Code refuses it
  by itself; reads stay allowed, since the hook matches a forbidden path against every word of a shell line).
  `forbiddenPathsOf(territory)` is the dotenv files plus `laws.forbidden_paths`, and `forbiddenChangesOf(changed,
globs)` the changed paths a glob matches at any depth as the hook's do: the Steward reads a plot's changes against
  them before it commits (P1-49), since a program a session's shell runs writes past the fence.
- Builds prompts from the Markdown templates in `prompts/` (`loadPromptTemplates`); a quest with `scope_paths` gets a
  `Scope:` fact, and its judge the files changed outside it (`prompts/out-of-scope.md`, `src/prompt/scope.ts`, PS-05),
  while a quest without one reads as before; the judge of a quest with `protected_changes` gets the files to read line
  by line (`prompts/protected-changes.md`, `src/prompt/protected.ts`, PS-04 (c)): `buildPrompt` for an
  assignee (new, or continuing after `returned` / `revive` with the letter, the last 20 journal lines, the
  branch's log and the owner's answer; after `returned`, also the checks that failed with the end of each log,
  `prompts/failed-checks.md`, P1-10b, and after the owner's return for a new judgement a word that the judge
  erred, `prompts/rejudge.md`; after either, the checks the machine will run on the work, as `selectChecks` picks
  them for what the branch touches (`Continuation.touched`), with those that may still run and those the party
  role leaves to the merge quest (`deferredChecks`), `prompts/checks-ahead.md`, P1-43; and why the Steward refused
  the patch the run before wrote, `Continuation.refused_patch`, `prompts/refused-patch.md`, P1-31) and a verifier (the ritual's steps from `prompts/ritual-steps.md`, the
  checks with the end of each failing one's log the caller read and masked (`PromptCheck.log_tail`, P1-25; both in `src/prompt/checks.ts`), the letter, the diff, or where to read it when the caller has none, and where the last judge of the
  run stopped when it left a `partial` verdict, P1-15); both list the shell commands
  their `ToolPolicy` allows, one per call (`prompts/shell.md`, P1-11), after the shell they run in when the caller
  names it (`PromptInput.shell`, the adapter's `capabilities.shell` for this OS, P1-40), and how to read: with Read,
  or, when the CLI has none (`PromptInput.cli_read: false`, the adapter's `capabilities.read`, PS-23), with
  read-only commands of the shell, or for a class without one with `git grep -h -n -e '^'` (`GIT_READ_LINE`); then
  the search commands
  of a tribe whose CLI has no search tool with how to call them, to a class without a shell too
  (`prompts/search.md`, P1-53); an assignee that edits files also reads
  the territory's read-only paths and the generators its shell may run (`prompts/read-only.md`, P1-24), and its
  patch paths with the patch convention (`prompts/patch.md`, P1-28: `PATCH_FILE` at the root of the plot);
  `buildChancellorPrompt` for the
  Chancellor; `buildTriagePrompt` for its triage of memos (PS-03b: `prompts/triage.md`, `triage-context.md`); `resumedPrompt` for a session continued with `--resume` (the system part as built, a user part that only says it goes on, with the owner's
  answer when there is one). The system part opens with the royal decree when `<kingdom>/decree.md` exists, then
  the laws of the role and the craft of the character's class (`class_prompt`: the kingdom's `registry/<class.prompt_file>`
  without its maintainer note, `prompts/class.md`, P1-15), and last the territory's `context_files` for a tribe
  whose CLI loads none (P1-33). `buildPrompt` and `resumedPrompt` also give the prompt's blocks (`PromptBlock`:
  part, id of `PROMPT_BLOCK_IDS`, size in characters; `src/prompt/prompt-blocks.ts`, PS-01b), the empty ones left
  out; the text is joined as before, and the Steward writes the blocks into the session's load trace.
  The quest's facts carry its kind's delivery convention when the Steward needs a file of a given shape: a plan
  (`subquests`) writes its sub-quests as quest-draft JSON to `SUBQUESTS_FILE` (`subquests.json`) at the root of
  its plot, where its judge reads them and the Steward opens them once the quest is done (P1-14), with the
  words a draft may use: the kinds and the classes each allows, the tags, the territory's secrets (P1-15); from
  PS-06 each kind's seal, each class's tools (`classToolsOf`, `src/prompt/drafting.ts`), the territory's checks,
  and after the description the drafting rules (`prompts/drafting.md`: the quest template of
  `prompts/quest-template.md` and the way to size a session of `prompts/estimate.md`), which its mage and its judge
  both read. The Chancellor and its triage quote the same two texts; the Chancellor's prompt also carries the
  council's thresholds (`kingdom.dispatch.council`) and, on its second try, its first reply and why
  (`prompts/chancellor-returned.md`, `ReturnedReply`).
- Reads the memos a character wrote (PS-02, ADR 0024): the letter template has a `## Memos` section
  (`HANDOVER_SECTIONS`), law 8 of `prompts/assignee.md` says work outside the quest is a memo, not a change
  (`- <kind>: <text> refs: <path>, <path>`), and `memosOf(letter)` returns the memos and the lines that follow no
  memo; a `-` or `none` line is nothing, as `fakeLetter` writes. The Steward calls it as a run ends; `RunResult` and
  the adapters do not change. A continuing assignee reads the memos its quest's letters filed
  (`Memory.memos`, `prompts/memos.md`, `memosBlock` of `src/prompt/memory.ts`): a block of its own, `memos` in
  `PROMPT_BLOCK_IDS`, right after the continuation, so the load trace counts it apart. (PS-22) `prompts/returned.md`
  says a note held wrong is an objection memo (`- objection: … refs: …`), not a change to satisfy it nor a note passed
  over; a second judge reads the `objection` block (`prompts/objection.md`, `objectionBlock` of
  `src/prompt/objection.ts`, before the review: the contested verdict and the memo, the first judge never named), and
  an assignee its final verdict beside the contested one (`prompts/final-verdict.md`, `Continuation.contested`).
  Law 4 of `prompts/verifier.md`: a judge judges by the quest's goal and the checks, not the wording of its steps.
  (PS-22b) Law 9 of `prompts/assignee.md`: a change of what the quest promises is an amendment memo
  (`- amendment: … refs: …`), a change of the way is a decision under Decisions taken. `buildAmendmentPrompt`
  (`prompts/amendment.md`, `amendment-context.md`) is the author's prompt, a mage's with its plan file's summary
  when the caller gives one (`AmendmentContext.plan_summaries`, fix/mage-plan-file); the doer's next session, fresh or resumed,
  reads the decision instead of an owner's answer (`amendmentAnswerBlock`, `prompts/amendment-answer.md` and its
  three `amendment-accepted|rejected|owner.md`), a resumed one with the description as accepted.
- Runs the conformance suite (`conformanceChecks`, `runConformance`): plain checks with `node:assert`, so a spec
  wraps them in `it` and `elvaria tribe check` (P1-19) runs them too. With a real CLI (`live`) only `capabilities`,
  `doctor`, `probe`, `submit`, `hang`, `forbidden_command` and `spawn_child` run (a few cheap sessions, a little
  mana); `crash`, `rate_limit`, `scratch_commit` and `ask` need a fake. `spawn_child` (P1-12e,
  `src/conformance/spawn-probe.ts`) puts `elvaria-spawn-probe.mjs` in the plot and asks the session to run
  `node elvaria-spawn-probe.mjs`, which starts a child with piped stdio, as a territory's build and test do, and
  writes what became of it; a sandbox that runs the command but not its child (Codex's unelevated one on Windows,
  `spawn EPERM`) fails it. A fake CLI runs the probe for real through `runFakeShellLine` once its gates let the line
  through. `openWorkspace` and `conformanceRequest` give an adapter's specs the same requests. The
  `capabilities` check also wants `capabilities.auth`, the sign-ins the adapter runs with (P1-19): a non-empty list
  of `login` / `api_key`. A check's workspace that still will not go after the retries of `rm` (a real agy held one
  for minutes on Windows, 2026-11-12) stays on disk: `play` tells `target.onLeftover` (a process warning without
  it) and the check reports what its session did, never the cleanup. A check that fails, past its ceiling or on what
  its session yielded (`PlaySteps.verify` runs while the workspace is still there), first has its session's process
  tree killed (`killTree`, then the runner's own kill) and its workspace handed to `target.onFailed` before the
  workspace goes (lessons of 2026-11-13: a real agy ran on to 80 369 tokens after its `submit` timed out).
- Hands an owner adapter file its kit (`src/kit/`, P1-19, implementation-plan §3.14, ADR 0021): `adapterKitOf(host)`
  freezes the tribe, the kingdom folder, the minimal env, the CLI to drive (`tool_path`: the path the owner gave,
  else the pinned one), `launchOf`, `hookCommand` and runner-core's shared parts (`process`: `startChild`,
  `runToEnd`, `killTree`; `session`: the signal channel, run context, `policy.json`, `writeRunFile` for a file of
  the run inside `<run_dir>` only, the run log and redacted output, the letter's Question, `countedTokens`;
  `policy`: `commandRefusal`, `toolOf`, `NO_PUSH_COMMAND`), so the file imports nothing. The prompt, the tool policy
  and the plot already come in each `SpawnRequest`. `adapterOfModule(module, kit)` checks the imported module
  (`createAdapter` exported, called without throwing) and the runner it returns (`runnerProblems`: the kit's tribe
  and adapter, every capability, `spawn`, `probe`, `doctor`), one sentence per problem, and makes the runner's
  `doctor()` fail while the hook the kit names is not built, as every built-in adapter's does (`hookProblem`,
  `withHookProblem`, `src/runner/hook-built.ts`, fix/held-tribe-sessions). `ToolInfo.notes` carries
  `DoctorNote` codes and parameters (`DOCTOR_NOTES`, `DOCTOR_NOTE_PARAMS`, `doctorNoteOf`, `callNote`,
  `hookNote`); `detail` remains verbatim external text. The kit validates adapter notes, replacing malformed
  entries with `doctor:bad_note`, and appends `doctor:hook_missing` when needed. The optional `shell` is
  checked only when given (`shellProblems`, P1-40), and so are `search` (`searchProblems`, P1-53), `read`
  (`readProblems`) and `models` (the domain's `modelsProblems`, PS-23), here and in the suite's `capabilities`
  check. An adapter whose CLI has hooks of its own writes its neutral hook dialect into `policy.json` through
  `writePolicyFile(…, { dialect })` (`HookDialect`, `src/runner/hook-dialect.ts`, PS-23), so the hook reads that
  CLI without a branch of its own. A built-in package also exports an `AdapterTool` (its program, its search
  outside PATH, whether the provider's terms need acknowledging, its fake CLI) for the composition root (PS-23).
- Proves in the conformance suite that a judge in its scratch plot, whose class allows commit and push, has both
  refused (`scratch_commit`, fakes only, P1-20).
- Gives a tribe without a JSON Schema flag its structured reply (`src/structured/`, implementation-plan §3.14
  `structured_output: prompt_and_parse`, P1-33, moved from the Chancellor): `spawnParsed(runner, request, {check,
resume})` puts `replyFormatBlock(schema)` in the system part instead of the flag, makes the JSON of the last
  text the run's `structured`, and tries a reply the caller's `check` refuses once more in `<run_dir>/retry/`,
  told what was wrong (`retryBlock`): resumed when the tribe can, else fresh with the whole prompt. Under it,
  `spawnSequel(runner, request, sequel)` runs one session and the ones that follow it as one `RunningSession`:
  the first session's id, every signal (tokens counted on top of the sessions before), the sums of tokens, turns
  and time, the last result, `RunResult.sequels` naming the others; a kill ends the run and no sequel opens
  after it. Its `pid` is the process running now, and `Sequel.spawned` (`ParseOptions.spawned`) says when a
  sequel's process starts, so the caller can record it. The Steward uses it for the reminders of the letter too (`handover_check: after_session`).
- Puts the territory's `context_files` in the system part for a tribe whose CLI loads no context file
  (`readContextFiles`, `prompts/context-files.md`, §3.14 `context: prompt`, P1-33): the files the globs name in
  the plot, in their order, each cut at `CONTEXT_FILE_MAX_CHARS` (what agy embeds), and the reminder of an
  unchanged letter (`letterReminderPrompt`, `prompts/letter-reminder.md`).
- Gives every quest its own ground (`createPlotManager`, implementation-plan §3.3, ADR 0012). On a git territory,
  `prepare` adds `<repo>/<worktree_dir>/<quest-id>` on branch `quest/<quest-id>` (`--no-track`), forked from the
  default branch: origin's after a fetch when it only adds to the local one, else the local one; the main
  checkout is never pulled. It is idempotent: a worktree already there is reused, a branch that outlived its
  worktree is checked out again. Each prepare also makes sure of the repo's `.git/info/exclude` lines
  (`PLOT_EXCLUDES`) and, on Windows, `core.longpaths`, and runs `commands.setup` until it succeeds once (log in
  `.runs/<quest>-setup.log`), with the quest's secrets when the caller passes them (P1-30:
  `prepare(quest, territory, {secrets})`, put in its env over the host's minimal env as a check's are); `{signal}`
  kills it (P1-49: the Steward's stop, so Ctrl+C does not wait for an install), the plot then not set up. A new
  worktree may start elsewhere (P1-18: `prepare(quest, territory, {from})`): on the first branch of `from` that
  exists and that the default branch does not hold yet, a party's contract or a dependency not merged yet; the
  diff then counts from there. The fork point and the setup state live in `elvaria-plot.json` in the worktree's
  private git folder. `status`, `head` (the commit at HEAD, null without git: the Steward reuses checks that ran on
  it for the run's next judge, P1-38), `touched` (paths changed since the fork, committed or not, plus untracked files),
  `commitAll` (everything, through the territory's own hooks; `refused` when a hook says no; given a `CommitRescue` folder
  (P1-55, `plot/rescue.ts`) it first moves the scratch files at the plot's root to `set-aside/` there, and a refusal leaves
  `wip.patch` and the staged paths; the Steward's messages
  are `plotCommitMessage`, Conventional Commits so commitlint accepts them), `restore` (P1-44: after a judge outside a
  scratch plot, `git reset --hard HEAD` and `git clean -d --force`, so ignored files and the runner files the plot
  excludes stay; returns the paths it dropped, an untracked folder as one path ending in `/`, and leaves a clean
  plot alone; nothing for a plot without git), `applyPatch` (P1-28: the assignee's
  `PATCH_FILE` = `elvaria.patch` for `laws.patch_paths`, the paths its CLI refuses to write; every path the patch
  touches, as `git apply --numstat` and its header lines name it, must be one of them and never git's own folder
  (`patchProblem`), then `git apply --recount --check` and `git apply`, and the file goes; otherwise `refused`
  with why, the patch left in place; `none` without a patch, a patch path or git), `diff` (what a judge reads, P1-15:
  `git diff <base>...HEAD`, summary then patch, cut at `DIFF_MAX_CHARS` on a whole line with a note saying where
  the rest is; null for a plot without git; with `after_merges`, P1-21 (e), a party's merge quest's own work:
  what changed after its last merge, then each merge with the conflicts it resolved, git's dense combined diff),
  `merge` (P1-18, a party's merge quest: each branch the worktree does
  not hold yet is merged with `--no-ff`, `plotCommitMessage.merge`, through the territory's hooks, until one stops;
  a conflict is left in progress for the character, whose commit, or the Steward's `commitAll`, concludes it even
  when the resolution changes nothing; nothing is merged into uncommitted changes or a merge in progress),
  `unmerged` (the branches HEAD does not hold) and `release`
  (removes a clean worktree, keeps the branch, takes the folders git leaves on Windows around pnpm's dead
  junctions when nothing else is in them, `leftover` says why a folder stays, then calls each `forget` callback,
  such as a tribe CLI dropping its transcripts). A territory without git gets `quests/<id>/work/` in the kingdom.
- Says how far a territory moved since its gazetteer was written (PS-21): `PlotManager.drift(plot, from)` counts the
  commits from `from` to the plot's fork point per top-level folder (`src/plot/drift.ts`, `git log --name-only`,
  root files left out; null without git, a record or a commit git knows), and `gazetteerWithDrift`
  (`src/prompt/gazetteer-drift.ts`) drops the `<!-- elvaria:commit <sha> -->` stamp of a gazetteer's first line and
  adds a sentence naming the folders that moved; a gazetteer without the stamp stays as it is.
- Tries a territory before its first quest (PS-25, `src/plot/territory-trial.ts`): `tryTerritory` adds a detached
  worktree `<repo>/<worktree_dir>/trial-<territory>` at the commit a new quest would fork from (`forkPoint`, fetched
  as for a quest), runs commands.setup with the log and timeout of a quest plot's setup, then every check of the
  territory through `runChecks` (selected as for a party's merge quest: all of them), and removes the worktree, dirty
  or not; no branch is made, only the logs stay in `.runs/trial-<territory>*`. A failed step names the command its
  log ran last and the line of its output that says why (`src/plot/trial-log.ts`: a test runner's `FAIL` line,
  else its `×`, else the first word of failure outside a table row or a file name, colours stripped), or the line the
  territory's `environment_errors` find; given the gazetteer's stamp it counts the commits since. No secret reaches
  the trial: a setup that needs one fails there. `commitsSinceStamp` counts the same commits without a trial and
  without a fetch (`forkPoint` with `fetch: false`: origin's branch as the last fetch left it), for `doctor`.
- Runs the machine checks before a judge (`runChecks`, §3.2): the territory's `checks` whose `when` globs match
  what the quest touched (`selectChecks`, `globToRegExp`: dot names match, case-insensitive, like the laws' globs
  in the hook), one at a time in the plot, each logged to `<run_dir>/checks/<id>.log`; with
  `ChecksRequest.party_role` (P1-18, §3.15) a party's merge quest runs every check and a part skips those marked
  `defer_to_merge`, as does the contract quest (P1-37: an interface written before the code fails any drift check);
  the blind trial's acceptance part (P1-21) runs none, its tests waiting for the merge quest. An `exclusive` check holds
  the territory's lock (`.state/checks/<territory>-exclusive`, `src/checks/exclusive-lock.ts`) so two quests never
  run one at once; a timed-out check runs its `cleanup`, under that lock too (P1-54). The checks that are not
  exclusive run first (P1-54), so a short one never waits out the lock. A check that cannot run (shell syntax, program
  not found, lock never freed) fails. A failing check whose log ends with a line of the territory's
  `environment_errors` (or that never got the lock) carries that line as `CheckRun.environment` (P1-54,
  `src/checks/environment.ts`): its environment failed, not the work.
  `ChecksRequest.signal` (P1-25: the Steward runs checks outside its tick) kills the running check and starts no
  other when it aborts, the log saying so; `runProgram` takes the same `signal`. `ChecksRequest.secrets` (P1-10b:
  the quest's `secrets_required`, treasury name → value) puts them in each check's env over the host's minimal env
  (`sessionEnv`, no `ELVARIA_*`), so a check that needs a private registry passes as the session did. `ChecksRequest.lock_wait_ms` (P1-20) says how long an exclusive check waits for the lock, a judge's session included. A check's
  `run` may list commands (P1-20): they run in order in one log, the first that fails ending the check, as CI's
  `&&` (`runLines`).
- Gives the judge of tests as the product its scratch plot and its trial (ADR 0022, P1-20):
  `PlotManager.prepareScratch` makes `<worktree_dir>/<quest-id>-verify` fresh, detached at the head of
  `quest/<id>`, its record carrying the quest plot's base, and runs `commands.setup` (log
  `.runs/<quest>-verify-setup.log`, killed by `{signal}` as the trial's and `scratchAgain`'s callers give it,
  P1-49); `checkoutScratch` moves it between head and base, `releaseScratch` removes it
  dirty or not, `scratchOf` finds it. `runTrial` runs there `commands.reset` then the checks, again after a reset
  up to `runs` times while every run passes (logs in `<run_dir>/run-<k>/checks/`), then `commands.coverage` on
  the head and on the base (istanbul `coverage/coverage-summary.json`); it adds the checks `rerun_clean` (every
  reset passed), `flake_check` and `coverage_not_lower`. (P1-54) Each reset holds the territory's exclusive lock;
  the reruns run only the checks with `flake` when one has it (`flakeRerunsOf`: on the spec files the quest touched,
  through `flake.run`, when it names how), and a rerun its environment failed is no flake: `flake_check` then fails
  with that `environment`; its log ends with the end of each failing rerun's log, for the judge. `trialInScratch`
  does both, a setup that fails coming back as a failing `rerun_clean`. `scratchAgain` makes the scratch plot of the run's next judge, whose trial the
  Steward keeps from the judge before while the branch head stays (P1-42): `prepareScratch`, then `commands.reset`
  once under the exclusive lock (P1-47, P1-54; log `.runs/<quest>-verify-reset.log`, `scratchResetLogOf`; none and
  no log without a reset), so the
  judge does not meet the database the last one's breaks left; a plot not made, or a setup or reset that fails,
  throws.
  The log of a check or of `commands.setup` loses the values of the secrets the command was given (`withSecrets`),
  then the secret shapes it printed, when it closes (`maskLogFile`, ADR 0013); the command writes straight into the
  file, so the masking is not line by line.
- Starts territory programs without a shell (`runProgram`, `argvOf`, `splitCommandLine`): quoted words, shell
  syntax refused, the program resolved by the `ProcessHost` the composition root passes in (it owns PATH and turns
  an npm `.cmd` shim into `node <script>`), and an env with no `GIT_*` (`childEnvOf`).
- Kills process trees (`src/process/`, P1-06, §3.4): `killTree(pid)` runs `taskkill /PID <pid> /T /F` on Windows,
  and on macOS and Linux sends SIGTERM to the process and every descendant `ps -A -o pid=,ppid=` names, then
  SIGKILL to whoever is left after `KILL_GRACE_MS` (5 s). A check or setup past its timeout, a killed CLI
  (`runner-claude`'s `kill`, `startChild`'s) and the Steward's breakers all take the whole tree. `startChild` /
  `runToEnd` start a CLI and read it line by line, with stdin closed or holding `stdin` (Antigravity takes its
  prompt in argv, Codex on stdin, P1-12d); `runToEnd` says in `problem` why a call did not run to its end (stopped
  at its timeout, `noAnswerWithin`, or never started), which every adapter's `doctor()` reports instead of "not
  signed in" (fix/busy-machine). `processStartOf(pid)`
  (ps `etime`; on Windows .NET `Process.GetProcessById` through PowerShell, which a cold start makes slow, so it
  waits up to `POWERSHELL_TIMEOUT_MS`; a pid that runs nothing answers at once) lets the Steward tell a session's process from a later one
  under the same pid after a restart. System programs live at fixed paths (`/bin/ps`, `System32`), never PATH.
- Gives every adapter the session's side of the hook contract (P1-09, §3.6): `runContextOf(req)` (kingdom,
  attempt and zone from env `ELVARIA_*`; the quest from the request, else env; character, role, model from the
  request; the env names of the quest's secrets), `contextEnv`, and `writePolicyFile` for `<run_dir>/policy.json` v1, the file `--policy` points the
  hook at: context, `secrets` (names only), `tools` (the class's, for a CLI with no `--tools`), `laws` (with
  `read_only_paths`, P1-24), the adapter's `apprentice_models` when it has an apprentice (the models up to the
  character's own, §3.12, P1-17), and `cli_protected_paths`: the adapter's, the paths its CLI refuses to write
  whatever the rules say (P1-24), then `GIT_PATHS` for every tribe (P1-49), so the hook refuses a write tool there
  first, and `elvaria_protected_paths` (P1-56): the part of it the adapter did not list, Elvaria's own rule, which the
  hook's refusal does not blame on the CLI; `laws.patch_paths` (only on a git territory) and, when there are some, `patch_file` (P1-28);
  `search_commands` when the tool policy has them (P1-53).
  The `apprentice` prompt tells the assignee to leave the apprentice's `model` out for lookups, name a stronger
  one only for reasoning, and to stop and write the unfinished child work in the letter when an apprentice is
  cut at its turn limit or runs long.
- Holds the treasury (`src/treasury/`, §3.9, ADR 0013): `openFileTreasury(file)` reads `{ "name": "value" }`
  from `kingdom.paths.treasury` on each call (a missing file is empty; outside Windows a file others can read is
  refused; no error ever quotes a value), `inspectTreasury` (the file's names or a typed problem, for the
  doctor), `secretEnvName` (`npm_token` → `NPM_TOKEN`), `minimalEnv` (the allowlist every child starts from), `sessionEnv` (minimal env + `ELVARIA_*` + exactly the quest's secrets; a
  secret that would replace another variable is refused), and `secretValuesOf` / `sessionRedactor` for the
  adapters, which mask the session's values before the patterns.
- Writes the lines only a CLI's output knows (`openRunLog`): `agent.session.end`, `agent.subagent.*`,
  `mana.signal`, stamped and redacted like the hook's, checked by `EventSchema`, to the log and the journal; and
  tells whether Elvaria's SessionStart hook recorded a session (`recorded`). Keeps a CLI's raw stdout and stderr
  in `.runs/`, redacted (`openRunOutput`).
- Code graphs (PS-21, ADR 0029, `src/graph/`): `buildGraph` runs graphify `update <source> --no-cluster` with
  `graphEnvOf`'s fixed env (`GRAPHIFY_BACKEND=none`, no query log, no skill refresh, `PYTHONHASHSEED=0`, no `.pyc`,
  `GRAPHIFY_OUT`) from a detached worktree of the territory (`.state/graphs/<territory>/source`) into
  `.state/graphs/<territory>/<commit>/`, seeded from the newest graph; it keeps `GRAPH_KEEP` (3) and one build per
  territory under a lock (`GRAPH_BUSY`). `codeGraphsOf` is the port the Steward and the CLI get (`base` from the plot
  record, `head`, `built`, `build`, `envFor`, `ask`). `toolPolicyOf({ graph: true })` grants `graph_commands` (the
  domain's `GRAPH_COMMANDS`) to a class with Glob or Grep that does not deny a bare `Bash`, and `policy.json` carries
  them; `buildPrompt` with `graph` adds the `graph` block (`prompts/graph.md`) to the system part, with a line for
  the judge.
- The code graph in planning (PS-21b): `readGraphLinks` reads a built `graph.json` (no graphify process) into the
  distinct uses between files (`USE_RELATIONS`: calls, imports, inheritance, references); `answerFilesOf` keeps the
  files and names of a `graphify query` answer. `buildChancellorPrompt` with `code` (`TerritoryCode`, gathered by
  `elvaria say`) adds two blocks to the system part (agy takes the user part on its command line): the files the
  owner's words name with their sizes (`prompts/chancellor-files.md`) and the graph's answer with the impact of those
  files (`prompts/chancellor-graph.md`). When a territory has `code_graph` on, the classes of the Chancellor and of a
  plan quest's facts say which ask the graph (`asksGraph`, the rule of `toolPolicyOf`) and how work needing the
  code's structure goes to one. `PromptGraph.impact` adds the impact line to a mage's graph block; a judge's
  `plan_links` adds `prompts/plan-links.md` to its review. `coverOf` and `scopeCovers` read a scope's globs as the
  judge's files outside the scope always have.

## Does not

- Talk to a real CLI: adapters do (`runner-claude` P1-09, `runner-antigravity` P1-12b; `runner-gemini` P1-12c and
  `runner-codex` P1-12d have their names in `boundaries.mjs` and are not built).
- Import an owner adapter file: only `apps/cli` does (ADR 0021); runner-core builds its kit and checks its runner.
- Write a CLI's own settings or agents file: the adapters do, from `ToolPolicy` and `SpawnRequest`. Choose which
  secrets a session gets: the quest names them, the Steward checks them against the territory and builds the env.
- Read a keychain: the file treasury is stage 1's; a keychain adapter can stand behind `Treasury` later.
- Reach a grandchild that left the tree before the kill (re-parented to init on POSIX, or whose parent ended on
  Windows): `taskkill /T` and the ps walk see only live parent links.
- Search PATH, push, merge, or force anything: a dirty worktree is not released, a refused commit stays refused.
- Name a tribe CLI: `claude purge --yes <worktree>` reaches `release` as a `forget` callback (ADR 0021).
- Decide anything: the Steward chooses who, when and with which continuation; `tribeLimitsOf` lives in the
  domain.

## Depends on

- `@elvaria/domain` (schemas, registry, capabilities, `ritualOf`, `FAIL_KINDS`, `countedTokens`, `Result`, `EventSchema`),
  `@elvaria/eventlog` (append, read a journal, stamp, redact), `@elvaria/store` (`readTextFile`,
  `writeFileAtomic`, `acquireLock`, kingdom paths). No third-party package; git is the territory's own, found
  by the host.

## How to test

```bash
pnpm --filter @elvaria/runner-core test
```

`src/prompt/__snapshots__/*.txt` hold the prompts of the four roles, with and without a decree (and an assignee
revived after a refused patch, `assignee-revived.txt` of `src/prompt/refused-patch.spec.ts`, P1-31);
`src/policy/__snapshots__/class-policies.txt` holds the policy of every default class. Review a change there as
you would a change of prose. `src/conformance/conformance.spec.ts` runs the suite against FakeRunner, and against
runners that lie about their capabilities. The plot and check specs build real git repos (a bare origin, a clone,
worktrees, a refusing pre-commit hook) and plots in temp folders with spaces in their names; git runs without the
caller's `GIT_*` (`src/__fixtures__/git-repo.ts`), and one spec proves a `GIT_DIR` in the host env is ignored.
The `src/process/` specs kill real node process trees (`src/__fixtures__/tree.ts`: a node that starts an idle
grandchild) on this machine: the CI matrix, started by hand since 2026-11-10, runs them on Windows and macOS, and the
SIGTERM-then-SIGKILL case on POSIX only.
(P1-54) `src/checks/run-checks-environment.spec.ts` and `trial-environment.spec.ts` hold the territory's exclusive
lock from the spec to show a reset, a cleanup and an exclusive check waiting for it, and print Docker's lines from
fake checks to show a failing check, a reset and a rerun told apart as their environment's;
`flake-reruns.spec.ts` covers which checks flake_check runs again and how spec paths are quoted.
