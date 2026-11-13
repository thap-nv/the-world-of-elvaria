# @elvaria/cli

## Does

- Ships the `elvaria` command, the only composition root (implementation-plan §1.1): `init`, `doctor`,
  `tribe list|add|check|disable|look`, `territory add|list|check|graph`, `character add|list|suspend|release|level|model`, `say`,
  `quest add|list|show|confirm|cancel|archive|edit|retry|reassign`,
  `seal`, `return`, `answer`, `memo list|show|decide`, `triage`, `run`, `wake`, `digest`, `metrics`,
  `sandbox generate|replay`, `migrate`, `upgrade`. The command table (`src/commands.ts`) drives parsing (`util.parseArgs`), help, and the reference
  `docs/cli.md` that `pnpm docs:gen` renders from it (`scripts/docs-cli.mjs`).
- Prints everything through `t()` of `@elvaria/i18n`, in `kingdom.owner.locale` unless `--locale vi|en` is given;
  `i18next/no-literal-string` (`packages/config/eslint-i18n.mjs`) guards it. Store and registry issues are
  translated by their `code`.
- Sends every quest change as an inbox command (`create_quest`, `confirm`, `cancel`, `archive`, `edit_quest`,
  `retry`, `reassign`, `seal`, `return`, `answer`; ADR 0005), after checking ids against the registry and the quest
  against the transition table; `archive` and `cancel` both take a quest in the infirmary (`infirmary.archive`, P1-56).
  While a Steward holds the kingdom's lock, `sendCommand` waits one tick and a little more for its `command.applied` or
  `command.rejected` line and prints it (`stale` with what to do about it); without a Steward it only drops the file.
  `quest edit --max-minutes` on a quest with a running session says what the new ceiling does to it: the Steward's
  time breaker reads the quest's ceiling on every tick, so a lower one cuts the session at its next tick (a warning
  when it has already run past it) and a higher one gives it the time, unless its CLI took its own clock when it
  opened (agy's `--print-timeout`; lessons of 2026-11-12, which corrected P1-56's "next session only"). `return` asks for a note of at least 20 characters (`--note`) and a `--fail-kind`
  (`other` by default), since the Steward writes it as the owner's fail verdict; `return --rejudge` (P1-40) says
  the judge erred: the work goes back to be judged again and the return does not count against the assignee. `answer <quest> "<answer>"` takes
  a non-empty answer for a `blocked` quest; the Steward then goes on with the same attempt, in the asking session
  when the answer comes within `dispatch.resume_after_answer_minutes` (ADR 0017). The bell of `run` prints that
  command with each question. `quest retry` opens a quest of the infirmary again, for every free character of its
  class (the line it prints says so); `quest retry --to <id>` sends `reassign` instead, so only that character takes
  it, with a full attempt budget (`infirmary.reassign`; refused on a stalled review and a script-tier quest, lessons
  of 2026-11-12); `quest reassign [--to <id>]`
  gives a quest to the character named (checked as the Steward checks it, `src/quest/assignee.ts` on the domain's
  `namedAssignee`: known, of the quest's class, not suspended, of an enabled tribe; a level below the rank is said,
  since the quest then waits for the seal) or, without `--to`, to the Steward's choice (P1-26). `quest add --to
<id>` names the new quest's assignee the same way (`create_quest.assignee`): only that character takes it
  (P1-29; refused on a script-tier quest). A single session quest `quest add` opens, without `--contract`, on a
  territory whose blind trial covers its rank says it will have none, and that `--contract` opens a party (P1-43).
  `quest show` of a quest nobody can take prints the `reassign` to its
  best candidate, or, when its party bars every character of the class (`party_bars`, P1-37), the `reassign` the
  owner may still give one of them; of a quest in the infirmary, why it went there, from the last `quest.infirmary` line of its
  journal (`src/quest/infirmary.ts`, P1-32): the trip and the attempt, then each part of the detail, in the
  owner's language (a line written before P1-32 shows its English reason). `quest add --scope` and `quest edit --scope` declare the files a quest changes (PS-05); `quest list` marks a quest
  that waits on its territory's scope rules and for whom, `quest show` prints its scope and that wait
  (`src/quest/scope.ts`). `quest list` has a column for a party's member, its role and where the party stands, and
  `quest show` prints the protected paths a quest's work changed, the reason it waits for the royal seal (PS-04), and
  `quest show` prints the party, the role, the contract and the merge quest (`src/quest/party.ts`, the domain's
  `partyStatusOf`; P1-21 (c)): the merge quest and the acceptance part share the contract's title. `quest show` also
  says what the last run came to (`src/quest/last-run.ts`, P1-46): its verdicts in the order they were written (each
  judge's partial verdict with where it stopped, the judge's or the machine's, the owner's), each with its failed
  checks and its notes, and the `plot.restored` lines of that run (the paths the Steward dropped from the plot after a judge or after the machine checks, P1-44 and P1-47), so
  the owner need not open `verdicts/` or the journal. `character suspend <id> [--reason]` and `character release <id>` send `suspend` and `release` (a
  character the Steward would refuse, unknown, suspended already or not suspended, is refused here), and `suspend`
  says what becomes of the quest the character holds (the owner's decision after P1-26). `character level <id>
<level>` sends `set_level` (a level outside 1–10 or the one the character has is refused here) and says the rank
  ceiling of the new level (P1-29). `character model <id> <model>` sends `set_model` (checked as the Steward checks
  it, the domain's `setModelLine`: a model of the character's own tribe, not the one it runs) and says when the new
  model's pool is turned off (P1-22).
- `say "<words>"` (P1-13, `src/say/`): one Chancellor session of `@elvaria/chancellor`, on the runners `run`
  builds (it needs a character of class `chancellor`, and it spends mana), turns the words into drafts; each
  draft kept goes to the inbox as `create_quest` with `draft: true`, the Steward writes it in status `draft`, and
  the owner opens it with `quest confirm`. The CLI writes no quest. `say --memo <memo>` (PS-02) hands the
  Chancellor a letter a character wrote, with the owner's words after it when given; its drafts carry the letter, and
  confirming one closes it (PS-03b).
- `triage` (PS-03b, `src/triage/`): the Chancellor's triage of the letters waiting (`runTriage`: open, routed to the
  Chancellor, not sent up yet, named by no command still in the inbox; at most 20, the oldest first), one session of
  `@elvaria/chancellor` for the batch, its commands written with `source: chancellor`; nothing when no letter waits.
  `run` gives the Steward the same as a scheduled job (`triageJob`, `kingdom.schedule.triage`), ready once no session
  of the Chancellor's tribe runs. `memo show` prints the Chancellor's advice on a letter it sent up; the digest lists
  it as `memo_escalated`; `metrics` counts the letters the owner and the triage decided.
- `memo list [--all]`, `memo show <memo>`, `memo decide <memo> shelved|rejected|handled [--quest] [--note]` (PS-02,
  `src/memo/`, ADR 0024): the letters (memos) characters wrote about work outside their quests, the open ones
  unless `--all`; `decide` sends `decide_memo` after refusing what it can tell already (an unknown or decided
  letter, a handled one without `--quest`, an unknown quest). The CLI writes no memo. `doctor` says a registry file
  the kingdom lacks (`registry/memos.json` before PS-02) is what `elvaria migrate` copies. (PS-22) `memo show` names
  the verdict an objection contests, why it went to the owner, and the second judge's verdict that closed it;
  `decide` offers the owner's three decisions, never `sustained` or `overruled`. `metrics` adds memos by kind and
  objections by first judge (`src/metrics/view-memos.ts`).
- `wake <tribe>` sends `wake` for a tribe of `kingdom.tribes[]`: the Steward probes that account at its next tick
  (ADR 0009), for instance after the owner signed in again.
- Writes new files the Steward does not own: `kingdom.json` (`init`, then `tribes[].tool` and, with `--enable`,
  `tribes[].enabled` from `doctor` once it finds nothing wrong, and `tribes[]` from `tribe add|check|disable|look`,
  P1-19), a
  territory, a newly summoned character (create only, never overwrite). Those two are also logged
  (`territory.attached`, `character.created`, with the view after the change, P0-09), so the world sees them.
  Without `--level`, a character starts at its model's level: the one its tribe's adapter declares
  (`capabilities.models`, PS-23), else by the slug's words (the domain's `startingLevelOf`: Opus 5, Sonnet or Pro 4,
  Argon 3, Haiku or Flash 2), else at 1 with a word on `--level` (P1-26); a `--level` above the model's says the
  Steward takes it as the model's strength, and how to lower it (P1-43). A tribe whose adapter declares its models
  takes only those, in `character add` and `character model` alike (`src/character/served.ts`, PS-23).
- `sandbox generate` writes a fake day of `@elvaria/sandbox` to `events/sandbox/<date>.jsonl` (nothing else of the
  kingdom changes); `sandbox replay <file> --speed 20` plays it back as a timeline, one sentence per line in the
  owner's language (`src/sandbox/timeline.ts`), paced by `CliIo.sleep`. Closing the pipe (`| head`) ends it quietly.
- `tribe add <id> --adapter <adapter>` (P1-19, implementation-plan §3.14, ADR 0021): a new tribe in
  `kingdom.tribes[]`, disabled, its adapter a built-in one or an owner file `adapters/<name>.mjs` that must be there;
  no character changes. `tribe check <id>` builds the tribe's runner as `run` does, prints what its adapter declares
  (the shell it declares per OS too, P1-46) and how far `tribeLimitsOf` lets it go, holds its pinned sign-in to the ones it declares (`checkTribeAuth`), and
  runs runner-core's conformance suite against it (with the real CLI only the checks that burn no or almost no mana;
  `--scenarios` runs all of them against a fake CLI; `--tool <path>` tries another CLI than the pinned one and
  writes nothing, PS-04b) and, once it passes, holds the tribe to the login its adapter
  reports, as doctor does (`loginFindings`, P1-34): a tribe that passes is enabled once doctor has pinned its CLI.
  A check's temp folder that a process of the CLI still holds past the retries (agy on Windows) is named on stderr
  and left for the owner; the check does not fail for it (`onLeftover`, lessons of 2026-11-12).
  `tribe disable <id>` stops a tribe taking new work. An owner adapter file is imported only here
  (`src/tribe/adapter-file.ts`): runner-core's `adapterKitOf` builds its kit (minimal env, the pinned or given CLI,
  `launchOf`, `hookCommand`) and `adapterOfModule` checks what `createAdapter(kit)` returns, so a broken file is a
  list of reasons for `run`, `doctor` and `tribe check`, never a crash. `tribe list` (P1-34, `src/tribe/list.ts`)
  prints one line per tribe: its look (PS-24: name, palette and crest), adapter, enabled or not, pinned CLI version, path and sign-in, and from its runner the
  highest rank `tribeLimitsOf` lets it take (none without `headless`), whether it takes guarded territories, and the
  capabilities and the shell on this OS it declares (P1-46); a tribe with no runner yet or an adapter file that does not load says so instead.
  `tribe look <id>` (PS-24, `src/tribe/look.ts`, `look-view.ts`) prints the tribe's look from the domain's `tribeLookOf`
  and its source (the owner's choice, the theme's pinned entry, or drawn by the id), with the palettes and crests no
  tribe holds; with `--palette|--crest|--figure|--aura|--frame <id>` or `--name` it writes the owner's choice to
  `tribes[].look` through `saveTribes`, every part (the look as it stands with the options laid over it), refusing a
  part the theme's pool lacks (exit 2) and a palette or crest another tribe has or the theme pins to another tribe
  (exit 1), and says which drawn looks moved with it; `--reset` drops the choice.
- `doctor`: finds each tribe's CLI (`--tool <tribe>=<path>`, the pinned path, PATH, then the adapter's own search:
  Claude Code inside the VS Code extension; npm `.cmd` shims run as `node <script>`; an adapter file is asked
  through its runner's `doctor()`, `src/doctor/adapter-tool.ts`, P1-19), pins path and version with the sign-in the
  adapter declares first (`defaultAuthOf`: the owner's login when it runs with one), refuses a pinned sign-in the
  adapter does not declare (`checkTribeAuth`, P1-19), asks
  the tribe's adapter about its login (a CLI that cannot sign in is an error, with or without a reason, P1-34), how
  soon it ends and the built hook, refuses Antigravity without
  `--acknowledge-terms` (ADR 0018), turns a disabled tribe on with `--enable <tribe>` (P1-15) only when that run
  has no error for it (P1-34: a CLI not logged in, a sign-in the adapter does not declare or terms not acknowledged
  keep it off, its CLI still pinned), refuses (exit 2, nothing written) a tribe option naming a tribe
  kingdom.json has not, `--acknowledge-terms` for a disabled tribe it would skip, or `--enable` of a tribe whose
  adapter is an owner file, which only `tribe check` enables (P1-34), checks git, the registry
  (a class prompt it lacks: `elvaria migrate` copies the default ones; catalog scripts: `missingRegistryFiles`;
  P1-41: default entries it lacks by id, and keys the default entries have that its own lack, `registryGaps`, as a
  warning) and each territory, with the program of every command (`commands.*`, `checks[].run|cleanup`) looked up
  on PATH the way the Steward finds it (P1-41, `src/doctor/check-commands.ts`: missing, a `.cmd`/`.bat` only a
  shell starts, or a line with shell syntax is an error naming the territory and the commands); the shell each
  tribe's adapter declares for this OS (`capabilities.shell`, P1-46) and, on Windows, for a tribe whose adapter
  declares Windows PowerShell (agy, or an owner's adapter file: read from the declaration, not a table of adapter
  ids, P1-46), PowerShell's Execution Policy (P1-41, `src/doctor/check-shell.ts`: one that refuses local scripts such as `pnpm.ps1` is an error of the tribe, with
  the command that fixes it, so `--enable` keeps it off), the
  treasury file (`inspectTreasury`: present, mode 0600 outside Windows, `{ "name": "value" }`, every name a
  territory allows; names only, never a value) and, while no Steward holds its lock, the sessions a stopped one
  left running (`sessionsLeftBehind`), which the next `run` kills (P1-11, `src/doctor/check-state.ts`), and the
  mana gauges (P1-32, `src/doctor/check-mana.ts`): a sleeping one as a warning, with the reset its sleep named,
  an awake one with its readings, then what a territory's quests need of the machine, as warnings (P1-56,
  `src/doctor/check-territory-setup.ts`: a Docker that does not answer `docker info` when a command mentions docker, a
  repo with no `user.email`, `.claude/rules/` files outside `laws.patch_paths`, the last also said by `territory add`)
  and the models whose doers have judges of another model on a single mana pool only, two judges on one gauge
  included (`src/doctor/check-judges.ts`, counted by pool since PS-03, (b) of P1-56),
  "not measured" when the Steward has logged none; under each reading the share of the window a session took, as
  the Steward measures it again at start from the log (`levelsFromLog`, `sharesOfHistory`), or the default it
  counts before that, and an awake gauge one more session would take to the cap, or one at it, as a warning
  (`windowClosingOf`, P1-49, (c) of P1-48).
- Mana gauges for `character list` and `doctor` (`src/gauges.ts`, P1-32), folded from the Steward's `mana.*`
  lines in the event log, since the Steward keeps no file of them: which gauges sleep (`mana.exhausted` /
  `mana.restored`) and the reset a sleep named, the latest reading of each window still in force (`mana.level`, a
  pool's or a model's own cap; `mana.warning`, the only line of a model's cap before P1-32) with its reset. `character list` marks each character the Steward put to sleep for mana
  (`sleeping_mana`) with the gauge it waits for, a model's own cap before its pool, and lists the sleeping gauges
  under the table. Only those: the log does not keep the models an account lists in a group, so the prefix table
  alone would call an Argon character bound by "Gemini Models", which the Steward, reading agy's `/usage`, does not.
- `digest` (PS-03, `src/digest/`): the digest as it stands, from the files, the open memos, the mana lines of the
  log and `.state/unclaimable.json` (`digestStateOf` of `@elvaria/steward`, `attentionQueue` of the domain), worded
  by `digestMarkdown` and printed; writes nothing and spends no mana. Quests waiting for a judge are known to the
  running Steward only, so they are in the digest it writes. `run` gives the Steward the `Digest` port
  (`src/run/digest-file.ts`): the same Markdown in `digest/<day>.md`, once a day at `kingdom.schedule.digest.at`;
  the bell says the digest is written and names a quest whose judges are all out of mana (`judge_mana`).
- `metrics [--since <day>] [--until <day>] [--json]` (PS-01, PS-01b: checks set aside for their environment, and the
  files a session read again, the ten most read): the metrics ledger of `metricsOf` (`@elvaria/domain`)
  over the days asked, as plain tables or JSON. `src/metrics/read.ts` reads quests, verdicts, the event log and
  `inbox/done/` without a lock and writes nothing, so it runs beside a Steward; a file it cannot use is named on
  stderr and left out. `src/metrics/view.ts` turns the ledger into sections that `scripts/docs-metrics-report.mjs`
  also renders into `docs/metrics-report.md`; `src/metrics/view-sessions.ts` adds the parts of PS-21 (graph
  queries, tool calls before an assignee's first edit, prompt size by role and block), on the section shape of
  `src/metrics/section.ts`.
- `migrate`: moves every older file to the current version, old text in `.backup/<stamp>/` (`migrateKingdom`),
  copies the registry files this Elvaria ships and the kingdom lacks (P1-15), then adds the default registry
  entries it lacks by id, whole, only when the registry still loads with them (P1-41, `addMissingRegistryEntries`):
  an entry the owner has is never changed, so a key it lacks (a kind's `ritual_overrides`) is only named.
- `run`: puts the work engine together and runs the Steward until Ctrl+C (`CliIo.untilStopped`): a runner per
  enabled tribe from `kingdom.tribes[].adapter` (`src/run/crew.ts`: `claude_code`, with `hookCommand` and
  `HOOK_SCRIPT` of `@elvaria/hooks`, since P1-15 `antigravity` from the pinned agy, built on first use in
  `src/run/antigravity.ts`, and since P1-19 an owner adapter file; a tribe without a runner takes no quest, and one
  whose adapter file is broken says why), plots over runner-core's
  `PlotManager` and `runChecks` (`src/run/plots.ts`: prepare, its `commands.setup` given the quest's secrets
  (P1-30), commit, the checks on what the quest touched, given them too (P1-10b), release) with a `ProcessHost` from PATH and each CLI's `forget` (`claude purge`), the console bell saying
  the Steward's notices in the owner's language (from P1-22 also a mana gauge that warns, sleeps or wakes; from
  P1-32 a quest gone to the infirmary by its trip, then each part of the detail on a line of its own, as `quest show`
  says them), and `.state/steward.lock` (a second `run` is refused). It names the build it runs on as it starts
  (`src/upgrade/running.ts`, PS-04b).
- `upgrade [--ref <ref>] | --rollback` and the pin (PS-04b, implementation-plan §3.16.4, ADR 0026; `src/upgrade/`):
  a build is a detached worktree of the repo this CLI runs from (`--ref`, `main` by default) at
  `<kingdom>/.builds/<sha>/`, installed (`pnpm install --frozen-lockfile`, with husky off) with the hook and the
  event log built; its CLI runs from source. `upgrade` holds the Steward's lock throughout (refused while a Steward
  runs, or while sessions of a stopped one still run), builds, then tries the build through its own commands as
  child processes (`src/upgrade/trial.ts`), first on a copy of the kingdom's settings (`src/upgrade/mirror.ts`:
  `kingdom.json`, registry, territories, characters, adapters, decree; no quest, log or inbox), so the kingdom is
  not written yet: `migrate`, then `doctor`, then `tribe check --scenarios --tool` for each enabled tribe against the
  fake CLI the build carries for its adapter (an adapter file has none, and is named); last, one script-tier quest
  (`count-files`) on a throwaway kingdom with every tribe off, until its `verdict.pass`
  (`src/upgrade/script-trial.ts`). Only then does it write `.state/build.json` (`{current, previous}`), run the new
  build's `migrate` on the kingdom (a failure leaves the build pinned and says how out), log `upgrade.started`, then
  `upgrade.switched` or `upgrade.failed`, and remove every build but those two; a failed build is removed. Node removes a build, then `git worktree prune` forgets it: pnpm's paths past 260
  characters are more than git for Windows deletes, and Node's rm takes pnpm's junctions off without following them.
  `--rollback` swaps the two (`upgrade.rolled_back`); upgrading to the build before tries it again without a
  rebuild. Every other command on a kingdom that pins a build runs on that build (`src/upgrade/pin.ts`, `entry.ts`,
  `relaunch.ts`): the bin starts `node <build>/apps/cli/src/cli.ts` with the same words, folder and terminal, an
  env of the minimal list, `ELVARIA_*` and `TZ`, and `ELVARIA_PINNED_BUILD` so it never hops twice; it waits
  through Ctrl+C and passes SIGTERM on. `--here` (a global option) and `upgrade` itself run on the code typed; a
  pointer it cannot read, or a pinned build no longer on disk, stops the command with the way out. `doctor` says
  what the kingdom pins.
- `territory graph <id> [--commit <ref>] [--query <words>]` (PS-21) builds the territory's code graph at a commit
  with the pinned graphify (0 mana), or finds it built, and asks it one question; `doctor` checks graphify when a
  territory has `code_graph` on or one is pinned (missing, unpinned or changed: a warning) and `--pin` writes
  `kingdom.programs.graphify`; `run` gives the Steward the graphs port when graphify is pinned (`src/run/graphs.ts`).
- `territory check <id>` (PS-25, implementation-plan §3.16.1): the territory's scorecard. It tries the territory with
  runner-core's `tryTerritory` (commands.setup, then every check, on a detached worktree at the head of its default
  branch, removed after; Ctrl+C kills the running command and keeps no result), reads the metrics ledger
  (`src/metrics/read.ts`) and the gazetteer, prints `territoryScorecardOf` of the domain in the owner's language
  (`src/territory/check-view.ts`), and exits 1 when the trial fails. It keeps how the card stood in
  `.state/territory-trials/<id>.json` (`src/territory/trial-record.ts`, the CLI's own file like `.state/build.json`),
  which `doctor` reads (`src/doctor/check-territory-trial.ts`): a git territory never tried, whose trial failed, or
  whose setup or checks changed since is a warning. No quest, event or model; `metrics` prints the first-pass rate
  by territory beside class, tag, model and kind.

## Does not

- Write or change a quest, or change an existing character: the Steward does (P1-03).
- Decide anything about quests or sessions, or talk to a CLI itself: the Steward and the adapters do; `doctor`
  asks only `--version` and, through the adapter, the login (no model call). Only `say`, `run` and `tribe check`
  with a real CLI start sessions that spend mana; `upgrade` tries a build with fake CLIs only.
- Push, merge or pull the Elvaria repo: `upgrade` builds a commit the repo already has, and never fetches.
- Inherit `process.env` into child processes: they get `minimalEnv` (ADR 0013), and never a shell (ADR 0015).

## Depends on

- `@elvaria/domain` (schemas, ids, transition table, views), `@elvaria/store` (kingdom folder, inbox, migrate),
  `@elvaria/eventlog` (append, redact; reads the log for the mana gauges, the metrics, and a quest's journal for its
  infirmary reason), `@elvaria/sandbox` (fake days and their replay),
  `@elvaria/registry-default` (`REGISTRY_ROOT`, `registryFiles()` for `init` and `migrate`), `@elvaria/i18n`, `@elvaria/steward`
  (the Steward, unclaimable notices, `questIdOfCommand`, `levelsFromLog`), `@elvaria/chancellor` (`draftQuests`,
  `draftCommands` for `say`), `@elvaria/runner-core` (`PlotManager`, the adapter kit, the conformance
  suite, `killTree` for `upgrade`), `@elvaria/runner-claude` (the
  `claude_code` adapter), `@elvaria/runner-antigravity` (the `antigravity` adapter, P1-15), `@elvaria/hooks` (the
  hook's command).

## How to test

```bash
pnpm --filter @elvaria/cli test   # builds dist/, then vitest: commands in-process + node dist/cli.js end to end
pnpm elvaria --help               # runs src/cli.ts directly (Node type stripping), no build
```

Specs run `runCli` on a fake machine (`test/cli.ts`: fixed clock, captured output) and throwaway kingdoms in
paths with a space and a Vietnamese letter. Fake CLIs are npm-style `.cmd` shims on Windows and shebang scripts
elsewhere; `cli.spec.ts` spawns the built bin as the owner would. Lines the Steward would have written are
planted with `openEventLog` / `openJournal`: `src/quest/infirmary.spec.ts` (the infirmary reason of `quest show`,
old lines included), `src/quest/last-run.spec.ts` (verdicts and `plot.restored` of the last run), `src/gauges.spec.ts` (the gauges, and `character list` and `doctor` showing them).
`fixtures/lantern-adapter.mjs` is an owner adapter file that imports nothing, for `fixtures/fake-lantern.mjs`, a
fake CLI with no tool gate: `src/tribe/tribe.spec.ts` adds, pins, checks and disables it; `src/tribe/round.spec.ts`
runs the Steward (`elvaria run`) with it until a rank D quest is done, while a rank C quest stays open (P1-19);
`src/tribe/list.spec.ts` lists it beside the built-in tribes, one with no runner and a broken file, and has
`doctor --enable` refuse it (P1-34). `fixtures/flint-adapter.mjs` and `fixtures/fake-flint.mjs` are the fourth tribe of
PS-23: a CLI with hooks of its own, described to Elvaria's hook by a neutral dialect in `policy.json`, and models of
several makers under its own names; `src/tribe/flint.spec.ts` (with `test/flint.ts`, which builds the hook when its
build is missing or stale) passes it through every check of the conformance suite, summons its characters at the
levels its models give, takes a rank C quest round, and finds its name in no source of `packages/` or `apps/`. `test/builds.ts` (PS-04b) has a stub build CLI that answers the trial's
commands as its `behavior.json` says and records each call, a stub pnpm that leaves a link into the build (a
junction on Windows, a symlink elsewhere), and a fixture repo builds are made from: `src/upgrade/upgrade.spec.ts`
upgrades, refuses and rolls back on real git worktrees, `src/upgrade/trial.spec.ts` runs the real trial (child
processes, a throwaway kingdom, a kill tree), `src/upgrade/entry.spec.ts` and `cli.spec.ts` run commands on a
pinned build. `src/digest/digest.spec.ts` (PS-03) plants a draft, a quest nobody can take, an open memo and a
sleeping pool and reads the digest in both languages, and has the port write a judge wait into `digest/<day>.md`.
`src/doctor/check-shell.spec.ts` puts a fake `powershell` on PATH that prints a
policy (`Restricted`, `RemoteSigned`); the doctor runs with it are Windows-only, the reading itself runs everywhere.
