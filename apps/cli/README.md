# @elvaria/cli

## Does

- Ships the `elvaria` command, the only composition root (implementation-plan §1.1): `init`, `doctor`,
  `tribe list|add|check|disable|look`, `territory add|list|check|graph|delivery`, `character add|list|suspend|release|level|model`, `say`,
  `quest add|list|show|confirm|cancel|archive|edit|retry|reassign|deliver`,
  `seal`, `return`, `answer`, `memo list|show|decide`, `triage`, `run`, `wake`, `digest`, `chronicle`, `metrics`,
  `sandbox generate|replay`, `migrate`, `upgrade`. The command table (`src/commands.ts`) drives parsing (`util.parseArgs`), help, and the reference
  `docs/cli.md` that `pnpm docs:gen` renders from it (`scripts/docs-cli.mjs`).
- Prints everything through `t()` of `@elvaria/i18n`, in `kingdom.owner.locale` unless `--locale vi|en` is given;
  `i18next/no-literal-string` (`packages/config/eslint-i18n.mjs`) guards it. Store and registry issues are
  translated by their `code`.
- Sends every quest change as an inbox command (`create_quest`, `confirm`, `cancel`, `archive`, `edit_quest`,
  `retry`, `reassign`, `seal`, `return`, `answer`, `deliver`; ADR 0005), after checking ids against the registry and the quest
  against the transition table; `archive` and `cancel` both take a quest in the infirmary (`infirmary.archive`, P1-56).
- `say` (PS-06) gives the Chancellor `kingdom.dispatch.council` and prints the brief of work for the council (goal,
  out of scope, acceptance examples, assumptions, each question with its recommended answer) with the plan quest
  that confirming accepts them for (`src/say/report.ts`, `reportBrief`); the drop reasons of the quest template and
  the council are translated like the others. Before the session (PS-21b, `src/say/code.ts`, 0 mana), it reads the
  paths and globs of the words (`src/say/words.ts`) in every git territory's tracked files, with their sizes and
  lines, whatever `code_graph` says; and where a territory has `code_graph` on and graphify's graph of the default
  branch's tip is built, it asks `graphify query` with the code names and paths of the words and counts the impact of
  the named files from the graph's links. It builds no graph, and says in one line each what the Chancellor got,
  including the paths no territory holds a file at, which the Chancellor hears as not found ((202), fix/test-guards).
  While a Steward holds the kingdom's lock, `sendCommand` waits one tick and a little more for its `command.applied` or
  `command.rejected` line and prints it (`stale` with what to do about it); without a Steward it only drops the file.
  `quest edit --max-minutes` on a quest with a running session says what the new ceiling does to it: the Steward's
  time breaker reads the quest's ceiling on every tick, so a lower one cuts the session at its next tick (a warning
  when it has already run past it) and a higher one gives it the time, unless its CLI took its own clock when it
  opened (agy's `--print-timeout`; lessons of 2026-11-12, which corrected P1-56's "next session only").
  (PS-28b) `quest edit --max-tokens` sends the command whatever the figure, then computes the token ceiling before and
  after on the edited quest (`src/quest/edit-tokens.ts`, the domain's `tokenCeilingFor` with the calibration the
  Steward uses): a figure that lifts nothing says so and names the smallest that would; a running session hears its
  new ceiling and cut from the next tick, or a warning when its latest notch line is already past the new cut.
  `quest show` prints the budget, the ceilings in force for the assignee and the judge (nominal, at the reminder mark,
  at the cut, and why the token ceiling is not the budget; `src/quest/ceiling.ts`) and, for a running session, the
  `Stamina` line folded from the journal by `sessionStaminaOf` (`src/quest/stamina-view.ts`: ten cells, the mark, the
  gauge, then the fixed sentence that it measures the way to the cut, and the cut before after one that went on). The
  bell of `run` says `wrap_up` with the command that gives the session more (`src/run/wrap-up-line.ts`). `return` asks for a note of at least 20 characters (`--note`) and a `--fail-kind`
  (`other` by default), since the Steward writes it as the owner's fail verdict; `return --rejudge` (P1-40) says
  the judge erred: the work goes back to be judged again and the return does not count against the assignee. `answer <quest> "<answer>"` takes
  a non-empty answer for a `blocked` quest; the Steward then goes on with the same attempt, in the asking session
  when the answer comes within `dispatch.resume_after_answer_minutes` (ADR 0017). The bell of `run` prints that
  command with each question. `quest retry` opens a quest of the infirmary again, for every free character of its
  class (the line it prints says so); `quest retry --to <id>` sends `reassign` instead, so only that character takes
  it, with a full attempt budget (`infirmary.reassign`; refused on a stalled review and a script-tier quest, lessons
  of 2026-11-12); `quest submit <id>` (fix/quest-hold, `src/quest/lifecycle.ts`) sends the work of a quest in the
  infirmary whose last session was its assignee's to review, same run (`submit`; a stalled review is pointed to
  `retry`); `quest hold <id> [--reason]` and `quest unhold <id>` (`src/quest/hold.ts`) hold an open or claimed quest
  so the Steward neither claims nor starts it, and lift the hold (`hold`, `unhold`; `quest list` marks it held, `quest
show` says since when and why); `quest reassign [--to <id>]`
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
  `quest show` says a quest was spared the seal by the kingdom's delegation, or why the machine raised it (PS-08b,
  `src/quest/seal-view.ts`); the digest prints a merge without the seal with its `git revert` line, `metrics` the
  merges without the seal per territory, and `doctor` a kind `kingdom.delegation.seal` names that the registry lacks;
  (PS-08g) `quest escaped <id> [--note …]` reports a defect that escaped with a quest already merged
  (`report_escape`), refused before the merge or a second time; `territory delegation <id> [--resume]` prints the
  kingdom's scope of the delegation, whether the territory merges by itself and whether the breaker suspended it, since
  which quest and why, and sends `resume_delegation` for a suspended one (`src/territory/delegation.ts`); the digest,
  the bell and `metrics` say the suspension, the escapes among the merges without the seal and the owner's reports;
  `quest show` prints the protected paths a quest's work changed, the reason it waits for the royal seal (PS-04), and
  `quest show` prints the party, the role, the contract and the merge quest (`src/quest/party.ts`, the domain's
  `partyStatusOf`; P1-21 (c)): the merge quest and the acceptance part share the contract's title. `quest show` also
  says what the last run came to (`src/quest/last-run.ts`, P1-46): its verdicts in the order they were written (each
  judge's partial verdict with where it stopped, the judge's or the machine's, the owner's), each with its failed
  checks and its notes, and the `plot.restored` lines of that run (the paths the Steward dropped from the plot after a judge or after the machine checks, P1-44 and P1-47), so
  the owner need not open `verdicts/` or the journal. Of a plan quest (PS-06b, `src/quest/plan-view.ts`), `quest
show` prints the brief apart from the rest of the description and, while the plan waits for the seal, the
  `## Summary` of the plan file the quest changed in its plot (what the plot changed from runner-core's PlotManager). `character suspend <id> [--reason]` and `character release <id>` send `suspend` and `release` (a
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
  of the Chancellor's tribe runs, or at once when no letter waits (fix/acceptance-scope: until it starts, planTick
  opens no new session of that tribe, once it is the next job to start: fix/run-221-domain). A Chancellor of a tribe held by its CLI's version gives way to the next one
  (`pickChancellor`, fix/held-tribe-sessions); with none left the job waits for the hold to end, and `triage` or
  `say` by hand, which ask the CLIs first (`tribeHoldsOf`), open no session and print the bell's line of each hold
  with its `tribe check`. `memo show` prints the Chancellor's advice on a letter it sent up; the digest lists
  it as `memo_escalated`; `metrics` counts the letters the owner and the triage decided.
- `memo list [--all]`, `memo show <memo>`, `memo decide <memo> shelved|rejected|handled [--quest] [--note]` (PS-02,
  `src/memo/`, ADR 0024): the letters (memos) characters wrote about work outside their quests, the open ones
  unless `--all`; `decide` sends `decide_memo` after refusing what it can tell already (an unknown or decided
  letter, a handled one without `--quest`, an unknown quest, a `--note` that names another letter's id), and says
  back the letter it closes (kind, sender, first line of its text; lesson (151)). The CLI writes no memo. `doctor` says a registry file
  the kingdom lacks (`registry/memos.json` before PS-02) is what `elvaria migrate` copies. (PS-22) `memo show` names
  the verdict an objection contests, why it went to the owner, and the second judge's verdict that closed it;
  `decide` offers the owner's three decisions, never `sustained` or `overruled`. `metrics` adds memos by kind and
  objections by first judge (`src/metrics/view-memos.ts`). (PS-22b) `memo show` names an amendment's mage;
  `decide` offers `accepted` too, and on an amendment its quest waits on lets the quest go on; `metrics` adds the
  amendments; `quest show` names the amendment a quest waits on and who decides it. `elvaria run` gives the Steward the
  amendments' authors as a job on call (`src/amend/`): the Chancellor, or the mage of the plan in the Chancellor's
  office, one session per amendment once its tribe is free and not held by its CLI's version (the Steward's
  `notices.tribes_held`; held, it waits, writing nothing); no author or a failed session hands it to the owner. The
  mage also reads the `## Summary` of the plan's file while the plan's plot holds it (`planSummariesOf`, shared with
  `quest show`; fix/mage-plan-file).
- Each session of the Chancellor's office that answers (`say`, `triage` by hand or as the job, an amendment's author)
  writes a `chancellor.answered` line (`src/say/answered.ts`, fix/run-221-followups): the character who spoke, its
  tribe and model, `matter` (`drafts`, `triage`, `amendment`) and the tokens the session reported; the Steward's
  mana estimate counts them from its next start, as a tribe check's. A session with no reply to use writes none; a
  line that cannot be written is said, and what the session answered stands.
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
  `--to herald [--port <n>]` (P2-01c, `src/sandbox/replay-herald.ts`) plays the same schedule through a Herald over a
  throwaway kingdom made with `init`'s defaults in the OS temp folder: it pairs one `full` device and prints its link,
  appends the day's lines to that kingdom's sandbox log once the browser opens its stream (`sandbox: true`), and on
  Ctrl+C stops the Herald and removes the folder.
- `tribe add <id> --adapter <adapter>` (P1-19, implementation-plan §3.14, ADR 0021): a new tribe in
  `kingdom.tribes[]`, disabled, its adapter a built-in one or an owner file `adapters/<name>.mjs` that must be there;
  no character changes. `--sibling-of <root>` (PS-27b) writes `sibling_of`, the adapter the root's when `--adapter`
  is absent, and refuses (exit 1) a root the kingdom lacks, a root that is a sibling and another adapter, again
  under the kingdom file's lock. `tribe check <id>` builds the tribe's runner as `run` does, prints what its adapter declares
  (the shell and the longest user prompt it declares per OS too, P1-46 and fix/cli-lines, `src/tribe/check-declared.ts`) and how far `tribeLimitsOf` lets it go, holds its pinned sign-in to the ones it declares (`checkTribeAuth`), and
  runs runner-core's conformance suite against it (with the real CLI only the checks that burn no or almost no mana;
  `--scenarios` runs all of them against a fake CLI; `--tool <path>` tries another CLI than the pinned one, and with
  `--scenarios` writes nothing, PS-04b) and, once it passes, holds the tribe to the login its adapter
  reports, as doctor does (`loginFindingsOf`, P1-34), its config folder, and the other enabled tribes of its adapter
  on the same folder or account (PS-27, `accountFindingsAgainst`): a tribe that passes is enabled once doctor has
  pinned its CLI.
  With the real CLI (`src/tribe/check-live.ts`, lessons of 2026-11-13) it runs the CLI doctor would find (the pinned
  file, else PATH or the adapter's search, or `--tool`), and a pass pins that CLI's path and version for this tribe
  alone, the version as `tool.checked_version` (B1, A1b); a session's ceiling is 300 s (120 s for a fake CLI),
  `--timeout <seconds>` sets another, and a failed check's workspace is kept in `.runs/tribe-check-<tribe>-<stamp>/`.
  It prints the tokens each check's sessions reported and their sum, and writes a `tribe.checked` line the Steward's
  mana estimate counts (`src/tribe/check-spent.ts`, run (221) (b)); a fake CLI (`--scenarios`) spends nothing, so
  neither.
  A check's temp folder that a process of the CLI still holds past the retries (agy on Windows) is named on stderr
  and left for the owner; the check does not fail for it (`onLeftover`, lessons of 2026-11-12). `run` gives the
  Steward `toolFound` (`src/run/tool-found.ts`): the CLI each runner starts and its `--version`, or a file gone;
  `tribeHoldsOf` asks the same for a command run by hand.
  `tribe disable <id>` stops a tribe taking new work. Enabled owner adapter files require the SHA-256
  pinned by a passing `tribe check`; missing or changed hashes refuse loading until a new check passes.
  `--scenarios` still enables a passing tribe but does not pin `adapter_sha256`;
  `--scenarios --tool` writes nothing. A real CLI check with `--tool` pins that CLI and the adapter hash.
  An owner adapter file is imported only here
  (`src/tribe/adapter-file.ts`): runner-core's `adapterKitOf` builds its kit (minimal env, the pinned or given CLI,
  `launchOf`, `hookCommand`) and `adapterOfModule` checks what `createAdapter(kit)` returns, so a broken file is a
  list of reasons for `run`, `doctor` and `tribe check`, never a crash. `tribe list` (P1-34, `src/tribe/list.ts`)
  prints one line per tribe: its look (PS-24: name, palette and crest), adapter, enabled or not, pinned CLI version, path, sign-in and config folder (PS-27), and from its runner the
  highest rank `tribeLimitsOf` lets it take (none without `headless`), whether it takes guarded territories, and the
  capabilities, the shell and the prompt limit (`capabilities.prompt_max_chars`) on this OS it declares (P1-46, fix/cli-lines); a tribe with no runner yet or an adapter file that does not load says so instead.
  `tribe look <id>` (PS-24, `src/tribe/look.ts`, `look-view.ts`) prints the tribe's look from the domain's `tribeLookOf`
  and its source (the owner's choice, the theme's pinned entry, or drawn by the id), with the palettes and crests no
  tribe holds; with `--palette|--crest|--figure|--aura|--frame <id>` or `--name` it writes the owner's choice to
  `tribes[].look` through `saveTribes`, every part (the look as it stands with the options laid over it), refusing a
  part the theme's pool lacks (exit 2) and a palette or crest another tribe has or the theme pins to another tribe
  (exit 1), and says which drawn looks moved with it; `--reset` drops the choice. For a sibling (PS-27b,
  `src/tribe/look-sibling.ts`) it prints the root and ordinal, writes only `sibling_name` (`--name`, `--reset`) and
  refuses a part option (exit 1); a root lists its siblings and says they followed a change. `look-view.ts` names a
  sibling by `sibling_name`, else the root's name with its Roman ordinal, and a root with siblings and no name of the
  owner's with "I", in `tribe look`, `tribe list` and `tribe add`.
- `doctor`: finds each tribe's CLI (`--tool <tribe>=<path>`, the pinned path, PATH, then the adapter's own search:
  Claude Code inside the VS Code extension; npm `.cmd` shims run as `node <script>`; an adapter file is asked
  through its runner's `doctor()`, `src/doctor/adapter-tool.ts`, P1-19), pins path and version with the sign-in the
  adapter declares first (`defaultAuthOf`: the owner's login when it runs with one; a CLI changed since is only said,
  with `tribe check <tribe>` as the next step, and `--pin` keeps the old checked version, which the Steward holds the
  tribe to, saying so: lessons of 2026-11-13), refuses a pinned sign-in the
  adapter does not declare (`checkTribeAuth`, P1-19), pins `tool.config_dir` with `--config-dir <tribe>=<folder>`
  (PS-27, `src/doctor/config-dir.ts`; empty drops it; refused before anything runs for an unknown tribe, a relative
  or missing folder, or one inside the kingdom or a territory's repo or worktree folder), holds a tribe's folder to
  its adapter's `capabilities.config_dir` and outside those places, fails both tribes of every pair of login tribes
  of one adapter on one folder or one account (`src/doctor/check-accounts.ts`, the domain's `accountClashesOf`,
  never naming the account) and keeps such a tribe off with `--enable`, warns of a sibling_of that is not valid,
  one across adapters and a `look` on a sibling (PS-27b, `src/doctor/check-siblings.ts`), asks
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
  tribe's adapter declares for this OS (`capabilities.shell`, P1-46) and its prompt limit there
  (`capabilities.prompt_max_chars`, fix/cli-lines, `src/doctor/check-prompt.ts`), whether its CLI reads images
  (`capabilities.vision`, PS-11, a ✓ line when it does) and, on Windows, for a tribe whose adapter
  declares Windows PowerShell (agy, or an owner's adapter file: read from the declaration, not a table of adapter
  ids, P1-46), PowerShell's Execution Policy (P1-41, `src/doctor/check-shell.ts`: one that refuses local scripts such as `pnpm.ps1` is an error of the tribe, with
  the command that fixes it, so `--enable` keeps it off), the
  treasury file (`inspectTreasury`: present, mode 0600 outside Windows, `{ "name": "value" }`, every name a
  territory allows; names only, never a value) and, while no Steward holds its lock, the sessions a stopped one
  left running (`sessionsLeftBehind`), which the next `run` kills (P1-11, `src/doctor/check-state.ts`), and the
  mana gauges (P1-32, `src/doctor/check-mana.ts`): a sleeping one as a warning, with the reset its sleep named,
  an awake one with its readings, then what a territory's quests need of the machine, as warnings (P1-56,
  `src/doctor/check-territory-setup.ts`: a Docker that does not answer `docker info` when a command mentions docker, a
  repo with no `user.email`, `.claude/rules/` files outside `laws.patch_paths`, a `CLAUDE.local.md` Claude Code
  loads into the plots when they sit inside the repo (P1-02, `src/territory/claude-local.ts`), the last two also
  said by `territory add`)
  and globs in `shared_paths`, `laws.read_only_paths` and `laws.patch_paths` matching no tracked file on the default branch (AH-16; `laws.forbidden_paths` is excluded),
  and the models whose doers have judges of another model on a single mana pool only, two judges on one gauge
  included (`src/doctor/check-judges.ts`, counted by pool since PS-03, (b) of P1-56),
  "not measured" when the Steward has logged none; under each reading the share of the window a session took, as
  the Steward measures it again at start from the log (`levelsFromLog`, `sharesOfHistory`), or the default it
  counts before that, and an awake gauge one more session would take to the cap, or one at it, as a warning
  (`windowClosingOf`, P1-49, (c) of P1-48).
- Mana gauges for `character list` and `doctor` (`src/mana/gauges.ts`, P1-32), folded from the Steward's `mana.*`
  lines in the event log, since the Steward keeps no file of them: which gauges sleep (`mana.exhausted` /
  `mana.restored`) and the reset a sleep named, the latest reading of each window still in force (`mana.level`, a
  pool's or a model's own cap; `mana.warning`, the only line of a model's cap before P1-32) with its reset. `character list` marks each character the Steward put to sleep for mana
  (`sleeping_mana`) with the gauge it waits for, a model's own cap before its pool, and lists the sleeping gauges
  under the table. Only those: the log does not keep the models an account lists in a group, so the prefix table
  alone would call an Argon character bound by "Gemini Models", which the Steward, reading agy's `/usage`, does not.
- `elvaria watch [--interval <seconds>]` (`src/watch/`): a read-only board of unfinished quests, including
  drafts and blocked quests, followed by the attention queue from the snapshot files and event log.
  Refreshes every 5 seconds by default; the interval must be a positive integer in seconds.
  Non-TTY output prints once. Ctrl+C clears the timer and removes the signal listener; no raw terminal mode is used.
- `chronicle [--day]` (P2-06, `src/chronicle/`): the chronicle of a local day: the Steward's `chronicle/<day>.md` when it
  wrote one, otherwise built on the spot from the files and the log with the same ledger (`dayLedgerOf` of the
  domain) and words (`chronicleMarkdown`, namespace `chronicle`), redacted, and written nowhere. `run` gives the Steward
  the `Chronicle` port (`fileChronicle`), which writes `chronicle/<day>.json` and `.md` once, redacted (ADR 0013).
  (P2-06b) `run` also gives the `Poet` port (`filePoet`, `src/chronicle/poet.ts`): the Bard's session with no tool
  (`askBard` of the chancellor) on the redacted ledger, its prose redacted and held against the ledger
  (`checkChronicle`), asked once more with the errors, then appended under the machine's part or dropped with one
  stderr line; a file that holds the prose already opens no session. The bell's `chronicle` line is said on the
  terminal only.
- `digest` (PS-03, `src/digest/`): the digest as it stands, from the files, the open memos, the verdicts, the
  registry and the event log, read by the store's `readKingdomSource` like the Herald's (P2-01c) (`attentionOf` of
  the domain, P2-04: the list the Steward's digest and the herald build from them too), worded by `digestMarkdown` and printed; writes nothing and spends no mana. The quests waiting for
  a judge and the tribes held by their CLI come from their `quest.judge_wait` and `tribe.held` lines, so they are
  listed without a running Steward; only a branch a running Steward found with nothing to push is its own (here such
  a quest counts as carried). A quest in review whose latest judge could not open a session (`judge_no_session`,
  from the quest files, fix/review-no-session) is listed with `character suspend`. A
  pull request the Steward merges itself under the delegation of the seal names nothing for the owner, as in the
  Steward's digest: the policy is `sealPolicyOf` of the domain, from `kingdom.delegation.seal` and the breaker's lines
  of the log (fix/run-221-followups). `run` gives the Steward the `Digest` port
  (`src/run/digest-file.ts`): the same Markdown in `digest/<day>.md`, once a day at `kingdom.schedule.digest.at`;
  the bell says the digest is written and names a quest whose judges are all out of mana (`judge_mana`).
- `metrics [--since <day>] [--until <day>] [--json] [--plan <quest>]` (PS-01, PS-01b: checks set aside for their environment, and the
  files a session read again, the ten most read): the metrics ledger of `metricsOf` (`@elvaria/domain`)
  over the days asked, as plain tables or JSON. `src/metrics/read.ts` reads quests, verdicts, the event log and
  `inbox/done/` without a lock and writes nothing, so it runs beside a Steward; a file it cannot use is named on
  stderr and left out. `src/metrics/view.ts` turns the ledger into sections that `scripts/docs-metrics-report.mjs`
  also renders into `docs/metrics-report.md`; `src/metrics/view-sessions.ts` adds the parts of PS-21 (graph
  queries, tool calls before an assignee's first edit, prompt size by role and block), on the section shape of
  `src/metrics/section.ts`; `src/metrics/view-waits.ts` those of PS-06b (time in each status, pass rate by run, the
  Chancellor's advice beside the owner's decisions); `src/metrics/view-wrap-ups.ts` the table of PS-28c (per tribe,
  the assignee sessions reminded at the soft ceiling that ended on their own or were cut, from the characters
  `read.ts` reads too; (PS-12b) with a column for those whose limit was raised while they ran);
  `src/metrics/view-lessons.ts` the three tables of PS-12b: each lesson's loads, `helped`, `missed` and effect, each
  kind of failure by bucket of 20 judged runs, and the failures that repeat. For these `read.ts` also parses the
  scriptures with the Steward's `lessonsIn` and hands the ledger the kind and scope of each line; the sentence stays
  in `MetricsSource.sentences` and the view joins it when it prints, so `--json` names lines by ref alone
  (`src/metrics/view-limits.ts` holds the known limits). `--plan <quest>` prints instead how a plan quest's sub-quests went
  against its plan (`planAccuracyOf`, `src/metrics/view-plan.ts`); a quest that is no plan, one that is not there, or
  `--plan` with a window is a usage error. The text view also prints kingdom-wide calibration for every configured
  tribe: token factor, turn ceiling, independent sample counts and default/measured sources, using the same domain
  `calibrationOf` as the Steward. `--json` retains the plan accuracy object.
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
  (P1-30), commit, the checks on what the quest touched, given them too (P1-10b), release) with a `ProcessHost` from PATH and each CLI's `forget` (`claude purge`, one per Claude tribe, each in its own config folder, PS-27), the console bell saying
  the Steward's notices in the owner's language (from P1-22 also a mana gauge that warns, sleeps or wakes; from
  P1-32 a quest gone to the infirmary by its trip, then each part of the detail on a line of its own, as `quest show`
  says them), and `.state/steward.lock` (a second `run` is refused). It names the build it runs on as it starts
  (`src/upgrade/running.ts`, PS-04b).
- `upgrade [--ref <ref>] | --rollback` and the pin (PS-04b, implementation-plan §3.16.4, ADR 0026; `src/upgrade/`):
  every git call uses runner-core's `gitGuard` switches before its command (SEC-02b).
  a build is a detached worktree of the repo this CLI runs from (`--ref`, `main` by default; a local branch that
  lacks commits of its `origin/` copy as last fetched is built with a warning, and nothing is fetched,
  `src/upgrade/behind.ts`) at
  `<kingdom>/.builds/<sha>/`, installed (`pnpm install --frozen-lockfile`, with husky off) with the hook and the
  event log built; its CLI runs from source. `upgrade` holds the Steward's lock throughout (refused while a Steward
  runs, or while sessions of a stopped one still run), builds, then tries the build through its own commands as
  child processes (`src/upgrade/trial.ts`), first on a copy of the kingdom's settings (`src/upgrade/mirror.ts`:
  `kingdom.json`, registry, territories, characters, adapters, decree; no quest, log or inbox), so the kingdom is
  not written yet: `migrate`, then `doctor` (with `ELVARIA_UPGRADE_TRIAL=1`: a tribe the new build's Steward
  holds anyway, its CLI gone or changed, only warns, `src/doctor/held-in-trial.ts`, fix/held-tribe-sessions), then
  `tribe check --scenarios --tool` for each enabled tribe against the
  fake CLI the build carries for its adapter (an adapter file has none, and is named); last, one script-tier quest
  (`count-files`) on a throwaway kingdom with every tribe off, until its `verdict.pass`
  (`src/upgrade/script-trial.ts`). Only then does it write `.state/build.json` (`{current, previous}`), run the new
  build's `migrate` on the kingdom (a failure leaves the build pinned and says how out), bring in the registry
  defaults the new build changed where the kingdom still held the build before's (`src/upgrade/registry-defaults.ts`,
  the store's `refreshRegistryDefaults`; old text in `.backup/<stamp>-registry/`) and name the ones the owner edited
  with the `git diff --no-index` that shows the change, log `upgrade.started`, then
  `upgrade.switched` or `upgrade.failed`, and remove every build but those two; a failed build is removed. Node removes a build, then `git worktree prune` forgets it: pnpm's paths past 260
  characters are more than git for Windows deletes, and Node's rm takes pnpm's junctions off without following them.
  `--rollback` swaps the two (`upgrade.rolled_back`); upgrading to the build before tries it again without a
  rebuild. Every other command on a kingdom that pins a build runs on that build (`src/upgrade/pin.ts`, `entry.ts`,
  `relaunch.ts`): the bin starts `node <build>/apps/cli/src/cli.ts` with the same words, folder and terminal, an
  env of the minimal list, `ELVARIA_*` and `TZ`, and `ELVARIA_PINNED_BUILD` so it never hops twice; it waits
  through Ctrl+C and passes SIGTERM on. `--here` (a global option) and `upgrade` itself run on the code typed; a
  pointer it cannot read, or a pinned build no longer on disk, stops the command with the way out. `doctor` says
  what the kingdom pins, and the build before as a way back only while its CLI is still on disk ((170)).
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
  whose setup or checks changed since is a warning. Once it passed, `doctor` takes only the trial and each check's
  time from the record and reads the other four items again (the domain's `itemsWithoutTrialOf`: the ledger once
  per run, the gazetteer's commits counted with no fetch), naming under its line which items come from the trial
  and when, which are read now, and why each item read now fails. No quest, event or model; `metrics` prints the
  first-pass rate by territory beside class, tag, model and kind.
- `territory checks <id> [--mode full|narrow|deferred]` (CM-01, ADR 0032, `src/territory/check-policy.ts`) prints a
  territory's check mode (the domain's `checkPolicyOf`: no `check_policy` reads as full), its `full_when` and each
  check's `run` and `narrow`, or writes the mode into `check_policy` under the store's lock (ADR 0005, as `territory
delivery`), with no event; `deferred` is refused unless the territory delivers by `pr_merge` with merge commits.
  `Plots.check` hands runChecks the run's `mode` and, for a narrow run, the plot's base (`PlotManager.checkBase`,
  ELVARIA_CHECK_BASE).
- `territory delivery <id> [--mode manual|pr|pr_merge] [--merge-method merge|squash] [--required-check <name>]…
[--timeout <minutes>]` (PS-08, ADR 0023, `src/territory/delivery.ts`) prints how a territory delivers (the
  domain's `deliveryOf`: no `delivery` field reads as manual) or changes it, writing the `delivery` field of
  territory.json under the store's lock (ADR 0005, as `territory add` writes the file), with no event: the field
  is not in the territory view. A mode that pushes is refused unless `vcs.remote` names a repo on the forge
  (`src/forge/remote.ts`: github.com only). `doctor` then checks each territory whose delivery is not manual
  (`src/doctor/check-delivery.ts`): its remote, a credential from `git credential fill` in the territory's
  folder with runner-core's `gitGuard` switches (`src/forge/credential.ts`: the owner's helpers alone, never one
  that the territory's config names, and an empty `core.askPass`, SEC-02; minimal env plus `GIT_TERMINAL_PROMPT=0`, the one `GIT_*`
  variable Elvaria sets, and `GCM_INTERACTIVE=never`; 10 s, then its tree is killed; on macOS a stopped call names
  the Keychain's Always Allow), and `GET /repos/{owner}/{repo}` on GitHub (`src/forge/github.ts`, through
  `CliIo.fetch`): no right to push is an error, a forge out of reach a warning. It prints neither the token nor
  the account's name.
- The forge the Steward delivers to (PS-08c, ADR 0023): `run` gives it `forgesOf` (`src/run/forges.ts`), the git
  found on PATH (none without git) and GitHub's adapter of the Steward's `Forge` port (`src/forge/github-forge.ts`
  over `github-api.ts`, `github-pulls.ts`, `github-merge.ts`): REST through `CliIo.fetch` with a time limit and the
  Steward's stop (every call takes its `AbortSignal`, PS-08d), the
  token read from git's store at every call (`gitToken`) and kept by none, every `detail` masked with it and redact's
  patterns. It finds the branch's pull request in any state (an open one first) or opens it (a 422 looks again),
  reads where it stands (merged with its `merge_commit_sha`, closed, conflict, the required check runs and commit
  statuses), merges with the
  head's sha (405 a conflict, 409 a moved head) and deletes a branch only while its tip is that head; a 401 or 403
  is the credential's, a rate-limited 403 the forge's. `quest deliver <id>` (`src/quest/deliver.ts`) sends `deliver`
  for a done quest whose territory delivers to its forge (the domain's `forgeDue`), refusing the others.
  `quest show` prints the delivery's pull request, or where it stopped, why and the command
  (`src/quest/delivery-view.ts`, `forgeOutcomesOf` on the quest's journal); `digest` lists `delivery_failed`,
  `delivery_waits` and (PS-09b) `delivery_merging`; the bell says `delivery_pushed` (with the files a shared secret
  pattern matched) and `delivery_failed`, naming the merge queue's merge quest when one resolves the stop, as
  `quest show` does; `quest list` and `quest show` call that quest's role "Queue merge quest" (`src/quest/party.ts`). `run` gives the Steward `baseTips` and `inBase` of PlotManager (`src/run/plots.ts`), the looks
  that archive a done quest merged into its base branch (PS-08d).
- The newer build the digest offers (`upgrade_available`, PS-08d, `src/upgrade/offer.ts`): with a pin, the commits
  on `main` of the repo the CLI runs from (a build and `--here` share its refs; no fetch) that touch `packages/` or
  `apps/` since the pinned commit; `run` gives it to the Steward as `upgradeOffer`, `digest` reads it too.
- The patrol (PS-26): `territory patrol <id> [--on|--off]` prints or writes `territory.patrol` (ADR 0005 exception,
  as `territory delivery`); `run` gives the Steward `Plots.patrol` (`tryTerritory` under `patrol-<id>`, the scans
  in the plot); `digest` lists `base_red` and `patrol_scan` from the log (`baseHealthOf`); the bell says `base_red`;
  `metrics` has the table "Default branch red after a merge".
- A red default branch (PS-09d): `territory patrol <id> --now` sends the inbox command `patrol` for a patrolled
  territory; `quest list` and `quest show` mark the open quests that wait for a green branch (`quest/base-wait.ts`,
  `baseRedOf` over the log); `digest` says how many wait in the `base_red` item.
- A guest entry of the merge queue (CM-07): `territory enqueue <id> --pr <n>` sends the inbox command
  `enqueue_branch` for a git territory delivered by `pr_merge`; `run` gives the Steward `Plots.guest` (`tryGuest`
  under `guest-<id>`), and the GitHub adapter's `status` names the pull request's branch. (CM-08) `run` also gives
  it `Plots.train` (`tryTrain` under `train-<id>`), the delivery train of a `deferred` territory, and
  `territory deliver <id>` sends `deliver` naming the territory: its train leaves at the Steward's next tick.
- Scripture line by line (PS-12, `src/scripture/`, 0 mana, reads only): `scripture lint` checks every line of the
  temple's scripture and each character's against the grammar and the rules of lesson-sharing T4 (`lintScripture`
  of the domain, the event log's redaction through the Steward's `lessonsIn`), prints `<file>:<line>: <level>:
<issue>`, warns of a character whose heaviest session would load more than 40 lessons (`worstLoadOf`), and exits
  1 on an error. `scripture list [--character <id>]` prints each lesson with its ref, scope, fail kind and source;
  with a character, its own lines then the temple's and what its heaviest session loads or the cap cuts. `doctor`
  adds the lint's summary as one line, a warning at most (`doctor/check-scripture.ts`).
- (PS-12c) `scripture list` reads who wrote each line from the ledger beside the scripture (`scripture.json`,
  `sourceOf`): the Monk, the owner (every line the ledger does not keep), or outside. The bell of `run` says a temple
  report once: lines added, taken out and refused, letters filed, or that it was refused whole (`src/run/temple-line.ts`);
  (PS-12g) and the characters its new lines freed. `scripture lint` and `doctor` also name each ledger entry whose line
  the owner deleted (`deletedByOwnerOf`), which is no error. `digest` lists the characters suspended for a fail streak
  with the Monk's letters, and the repeated failures that wait while the Temple cannot run (`templeNoticesOf`); an item
  without a command (`temple_off`) prints no command line.
- (PS-12d, `src/temple/evidence.ts`, 0 mana, reads only) `temple evidence [--json]` prints the evidence pack a session
  of the Monk would read now (`templeEvidenceOf` of the domain): each repeated failure of the last 50 judged runs with
  its verdicts' notes, redacted by the event log's patterns and cut at 600 characters, the lines of scripture with
  their counts and who wrote them, the Monk's lines worth a review, each territory's checks and the catalog's scripts,
  cut at the prompt ceiling of the first Monk's tribe on this OS (read from its runner's capabilities, not spawned).
- (PS-12f, `src/temple/`, spends mana) `temple run` and the Temple as a job on call: `runTemple` takes the evidence pack
  (`templeEvidenceOf`), and when it holds a repeated failure or a line worth a review asks the Monk once
  (`askTemple`: a session with no tool, on the Monk's own tribe and model; `monkOf` picks a Monk of a class with
  `is_monk`, not suspended, on a tribe with a runner) and files its reply as one `temple_report` in the inbox (the
  Steward applies it, PS-12c). A pack with nothing to ask opens no session. Either way it writes `temple.ran` (day,
  operations, letters, tokens; a session that failed too, so the Temple does not reopen it each tick); a Steward
  stopped mid-session writes nothing, so the next start runs it again. `elvaria run` gives the Steward the same as a
  job on call (`templeJob`, `kingdom.schedule.temple`): ready once the Temple is due, a Monk is free, its tribe is
  not held by its CLI's version and a pool opens a session; unlike the triage it holds no tribe free. No Monk at all
  is printed once. `temple run` runs it now, whether the schedule is on or off.
- The Herald (P2-01b, `src/herald/`, 0 mana): `herald [--port <n>]` runs `startHerald` of `@elvaria/herald` on
  127.0.0.1 (port `kingdom.herald.port`, 0 picks a free one) with the kingdom's origins, the clock and randomness of
  the machine, its page texts in the owner's language (`src/herald/pages.ts`: `cli.herald.page.*`, a device's
  refusals from `device.refusal.*`) and its redacted log as lines, until Ctrl+C or a stop signal, then closes it; a
  port in use prints the system's code (`EADDRINUSE`) and exits 1. (P2-01c) It hands the Herald the kingdom and
  `ctx.ids`, so the Herald streams the world at `/ws` and writes the commands of paired devices to `inbox/`; each
  stream opened or closed and each command accepted or refused is a log line (`cli.herald.log.*`). `herald pair --role full|scoped|inquiry --label
<name> [--territory <id>]…` writes a new `devices/<id>.json` (id `ids.device()`; full carries no territory,
  scoped and inquiry at least one, each attached) and a one-time code with `issuePairingCode` (only its hash lands in
  `.state/herald-pairing.json`), and prints the code once as `<origin>/pair?code=…` for loopback and each origin of
  `kingdom.herald`. `herald pair --device <id>` (P2-01c) pairs a device that exists again when its browser lost the
  cookie: a new code for the same id, role and territories, no device file written, never for a revoked device and
  with no `--role`, `--label` or `--territory` beside it. `herald devices` lists the devices with their role (`device.role.*`), territories, creation, last
  seen (`readSessions`: the latest `last_seen_at`) and revocation; `herald device <id>` prints one, or changes
  `--role`, `--territory` (replaces the list) or `--label`, refusing a revoked device; `herald revoke <id>|--all`
  sets `revoked_at` once. The three write the device files themselves (ADR 0005 exception, .claude/rules/cli.md).
  `doctor` adds one line for `kingdom.herald`: the port and the origins besides loopback, a warning for one that is
  plain http off this machine (`doctor/check-herald.ts`).
- (P2-03) The bell of `run` (`src/bell/run-bell.ts`) rings the console bell and, while `kingdom.bell.desktop` is on
  and stdout is a terminal, the desktop bell beside it, through `fanOut` (`src/bell/fan-out.ts`): a bell that throws
  or rejects is one warning line and the others still ring. `DESKTOP_RINGS` (`src/bell/toast.ts`, one cell per kind
  of notice, W13) picks the notices that also become a system notification: the seal, the infirmary, a question, a
  whole pool out of mana, `base_red` and `delegation_suspended`; the toast is a heading and one line naming the
  quest, pool or territory, masked, never the question or a path. `src/bell/desktop.ts` starts
  `node src/bell/show-toast.(ts|js) <toast as JSON>` for each, without a shell and with the minimal env, and does not
  wait for it; that process (`src/bell/platform.ts`) hands the toast to node-notifier's Windows toaster (SnoreToast)
  or macOS Notification Center (terminal-notifier). Linux and the rest: one warning line, then quiet.
  On Windows, every toast uses `assets/bell/elvaria-bell.png` (a placeholder logo). `bell install` copies it to
  `<kingdom>/.state/bell/elvaria-bell.png` and registers `HKCU\Software\Classes\AppUserModelId\Elvaria`
  with `DisplayName` and `IconUri`, without admin rights or a Start-menu shortcut. `run` probes the registration
  once at startup and sends `appID: Elvaria` only when registered; restart it after installing or uninstalling.
  `bell uninstall` removes the key and copy. Both commands do nothing on other platforms; `doctor` suggests
  `elvaria bell install` when the Windows name is missing and the desktop bell is on.

## Does not

- Write or change a quest, or change an existing character: the Steward does (P1-03).
- Decide anything about quests or sessions, or talk to a CLI itself: the Steward and the adapters do; `doctor`
  asks only `--version` and, through the adapter, the login (no model call). Only `say`, `run` and `tribe check`
  with a real CLI start sessions that spend mana; `upgrade` tries a build with fake CLIs only.
- Push, merge or pull the Elvaria repo: `upgrade` builds a commit the repo already has, and never fetches. Nor push a
  territory's branch itself: the Steward of `run` does (PS-08c), with the git and the forge adapter given to it;
  `territory delivery` only writes settings, `doctor` only reads a credential and asks the forge one question, and
  `quest deliver` only writes a command.
- Inherit `process.env` into child processes: they get `minimalEnv` (ADR 0013), and never a shell (ADR 0015). The
  desktop bell's toast runs in a Node process of its own for that reason: node-notifier starts its bundled programs
  with the env of the process it runs in (P2-03).

## Depends on

- `@elvaria/domain` (schemas, ids, transition table, views), `@elvaria/store` (kingdom folder, inbox, migrate),
  `@elvaria/eventlog` (append, redact; reads the log for the mana gauges, the metrics, and a quest's journal for its
  infirmary reason; `createRedactor` masks the forge adapter's messages), `@elvaria/sandbox` (fake days and their replay),
  `@elvaria/registry-default` (`REGISTRY_ROOT`, `registryFiles()` for `init` and `migrate`), `@elvaria/i18n`, `@elvaria/steward`
  (the Steward, unclaimable notices, `questIdOfCommand`, `levelsFromLog`, the `Forge` port and
  `DELIVERY_GIT_SWITCHES`), `@elvaria/chancellor` (`draftQuests`,
  `draftCommands` for `say`), `@elvaria/runner-core` (`PlotManager`, the adapter kit, the conformance
  suite, `killTree` for `upgrade`), `@elvaria/runner-claude` (the
  `claude_code` adapter), `@elvaria/runner-antigravity` (the `antigravity` adapter, P1-15), `@elvaria/runner-codex`
  (the `codex_cli` adapter), `@elvaria/hooks` (the hook's command), `@elvaria/herald` (the Herald's server, pairing
  codes and sessions, P2-01b).
- `node-notifier` (P2-03, W9): only in the toast's own process (`src/bell/show-toast.ts`), with its bundled
  SnoreToast (Windows) and terminal-notifier (macOS); no install script.
- `@elvaria/config` (dev only: `tsconfig.json` extends its `tsconfig/node.json`).
- `@elvaria/testkit` (dev only: throwaway folders and their cleanup).

## How to test

```bash
pnpm --filter @elvaria/cli test   # builds dist/, then vitest: commands in-process + node dist/cli.js end to end
pnpm elvaria --help               # runs src/cli.ts directly (Node type stripping), no build
```

Vitest's global setup (`src/__fixtures__/global-setup.ts`) builds the hook of `packages/hooks` once, before any spec, when its
build is missing or older than its source: the runners the specs start use it as `elvaria run` would, and Codex's
doctor reports a missing build as `auth_ok: false`, so a spec run alone with no build failed (fix/busy-machine).

Specs run `runCli` on a fake machine (`src/__fixtures__/cli.ts`: fixed clock, captured output) and throwaway kingdoms in
paths with a space and a Vietnamese letter. Fake CLIs are npm-style `.cmd` shims on Windows and shebang scripts
elsewhere; `cli.spec.ts` spawns the built bin as the owner would. Lines the Steward would have written are
planted with `openEventLog` / `openJournal`: `src/quest/infirmary.spec.ts` (the infirmary reason of `quest show`,
old lines included), `src/quest/last-run.spec.ts` (verdicts and `plot.restored` of the last run), `src/mana/gauges.spec.ts` (the gauges, and `character list` and `doctor` showing them),
`src/quest/stamina-view.spec.ts` and `src/quest/edit-tokens.spec.ts` (PS-28b: the session and notch lines of
`src/__fixtures__/stamina.ts`, for the ceilings, the stamina bar and what a new token budget does).
No spec reads a real credential or reaches a forge (PS-08): `src/__fixtures__/credential.ts` empties `credential.helper` in the
`.gitconfig` of the spec's own home folder (the owner's config: a delivery's git asks no helper of the repo's own,
SEC-02) and names a Node script that answers as a helper does (a token of GitHub's `gho_` shape, nothing, or no
answer at all), and `poisonRepo` makes a repo's own config name programs that must never run; `testIo` hands every command a `fetch` that fails, and
`src/doctor/check-delivery.spec.ts` passes a fake one. The specs compare the token, never print it, and look for it
in the output and in every file of the kingdom. (PS-08c) `src/__fixtures__/github.ts` is a fake GitHub that answers by method
and path and keeps every request: `src/forge/github-forge.spec.ts` takes each call of the forge port through it
(a 422 that races, the credential's refusals apart from the forge's, a token echoed back or in a network error
masked, `gitToken` on the fake helper), `src/forge/github-status.spec.ts` a pull request's state and its required
checks. `src/quest/deliver.spec.ts` plants done quests and territories and reads the inbox; `delivery-view.spec.ts`,
`run/bell.spec.ts` and `digest/digest.spec.ts` word a delivery's outcome; `run/forges.spec.ts` finds git or none.
No spec shows a real toast (P2-03): `src/bell/platform.spec.ts` passes fake notifiers for Windows and macOS,
`src/bell/desktop.spec.ts` a fake spawn (and runs `show-toast` only with an argument that is not a toast), and
`src/bell/run-bell.spec.ts` stands Linux in for a machine with the desktop bell.
`src/bell/install.spec.ts` uses a fake process runner for registry commands and checks the durable PNG copy.
`fixtures/lantern-adapter.mjs` is an owner adapter file that imports nothing, for `fixtures/fake-lantern.mjs`, a
fake CLI with no tool gate: `src/tribe/tribe.spec.ts` adds, pins, checks and disables it; `src/tribe/round.spec.ts`
runs the Steward (`elvaria run`) with it until a rank D quest is done, while a rank C quest stays open (P1-19);
`src/tribe/list.spec.ts` lists it beside the built-in tribes, one with no runner and a broken file, and has
`doctor --enable` refuse it (P1-34). `fixtures/flint-adapter.mjs` and `fixtures/fake-flint.mjs` are the fourth tribe of
PS-23: a CLI with hooks of its own, described to Elvaria's hook by a neutral dialect in `policy.json`, and models of
several makers under its own names; `src/tribe/flint.spec.ts` (with `src/__fixtures__/flint.ts`) passes it through every check of the conformance suite, summons its characters at the
levels its models give, takes a rank C quest round, and finds its name in no source of `packages/` or `apps/`. `src/__fixtures__/builds.ts` (PS-04b) has a stub build CLI that answers the trial's
commands as its `behavior.json` says and records each call, a stub pnpm that leaves a link into the build (a
junction on Windows, a symlink elsewhere), and a fixture repo builds are made from: `src/upgrade/upgrade.spec.ts`
upgrades, refuses and rolls back on real git worktrees, `src/upgrade/trial.spec.ts` runs the real trial (child
processes, a throwaway kingdom, a kill tree), `src/upgrade/entry.spec.ts` and `cli.spec.ts` run commands on a
pinned build. `src/digest/digest.spec.ts` (PS-03) plants a draft, a quest nobody can take, an open memo and a
sleeping pool and reads the digest in both languages, and has the port write a judge wait into `digest/<day>.md`.
`src/doctor/check-shell.spec.ts` puts a fake `powershell` on PATH that prints a
policy (`Restricted`, `RemoteSigned`); the doctor runs with it are Windows-only, the reading itself runs everywhere.
