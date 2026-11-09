# @elvaria/cli

## Does

- Ships the `elvaria` command, the only composition root (implementation-plan §1.1): `init`, `doctor`,
  `tribe list|add|check|disable`, `territory add|list`, `character add|list|suspend|release|level|model`,
  `quest add|list|show|confirm|cancel|archive|edit|retry|reassign`,
  `seal`, `return`, `answer`, `run`,
  `sandbox generate|replay`, `migrate`. The command table (`src/commands.ts`) drives parsing (`util.parseArgs`), help, and the reference
  `docs/cli.md` that `pnpm docs:gen` renders from it (`scripts/docs-cli.mjs`).
- Prints everything through `t()` of `@elvaria/i18n`, in `kingdom.owner.locale` unless `--locale vi|en` is given;
  `i18next/no-literal-string` (`packages/config/eslint-i18n.mjs`) guards it. Store and registry issues are
  translated by their `code`.
- Sends every quest change as an inbox command (`create_quest`, `confirm`, `cancel`, `archive`, `edit_quest`,
  `retry`, `reassign`, `seal`, `return`, `answer`; ADR 0005), after checking ids against the registry and the quest
  against the transition table. `return` asks for a note of at least 20 characters (`--note`) and a `--fail-kind`
  (`other` by default), since the Steward writes it as the owner's fail verdict. `answer <quest> "<answer>"` takes
  a non-empty answer for a `blocked` quest; the Steward then goes on with the same attempt, in the asking session
  when the answer comes within `dispatch.resume_after_answer_minutes` (ADR 0017). The bell of `run` prints that
  command with each question. `quest retry` opens a quest of the infirmary again; `quest reassign [--to <id>]`
  gives a quest to the character named (checked as the Steward checks it, `src/quest/assignee.ts` on the domain's
  `namedAssignee`: known, of the quest's class, not suspended, of an enabled tribe; a level below the rank is said,
  since the quest then waits for the seal) or, without `--to`, to the Steward's choice (P1-26). `quest add --to
<id>` names the new quest's assignee the same way (`create_quest.assignee`): only that character takes it
  (P1-29; refused on a script-tier quest). `quest show` of a quest nobody can take prints the `reassign` to its
  best candidate; of a quest in the infirmary, why it went there, from the last `quest.infirmary` line of its
  journal (`src/quest/infirmary.ts`, P1-32): the trip and the attempt, then each part of the detail, in the
  owner's language (a line written before P1-32 shows its English reason). `quest list` has a column for a party's member, its role and where the party stands, and
  `quest show` prints the party, the role, the contract and the merge quest (`src/quest/party.ts`, the domain's
  `partyStatusOf`; P1-21 (c)): the merge quest and the acceptance part share the contract's title. `character suspend <id> [--reason]` and `character release <id>` send `suspend` and `release` (a
  character the Steward would refuse, unknown, suspended already or not suspended, is refused here), and `suspend`
  says what becomes of the quest the character holds (the owner's decision after P1-26). `character level <id>
<level>` sends `set_level` (a level outside 1–10 or the one the character has is refused here) and says the rank
  ceiling of the new level (P1-29). `character model <id> <model>` sends `set_model` (checked as the Steward checks
  it, the domain's `setModelLine`: a model of the character's own tribe, not the one it runs) and says when the new
  model's pool is turned off (P1-22).
- Writes new files the Steward does not own: `kingdom.json` (`init`, then `tribes[].tool` and, with `--enable`,
  `tribes[].enabled` from `doctor` once it finds nothing wrong, and `tribes[]` from `tribe add|check|disable`,
  P1-19), a
  territory, a newly summoned character (create only, never overwrite). Those two are also logged
  (`territory.attached`, `character.created`, with the view after the change, P0-09), so the world sees them.
  Without `--level`, a character starts at its model's level (`src/character/starting-level.ts`: Opus 5, Sonnet
  or Pro 4, Argon 3, Haiku or Flash 2), else at 1 with a word on `--level` (P1-26).
- `sandbox generate` writes a fake day of `@elvaria/sandbox` to `events/sandbox/<date>.jsonl` (nothing else of the
  kingdom changes); `sandbox replay <file> --speed 20` plays it back as a timeline, one sentence per line in the
  owner's language (`src/sandbox/timeline.ts`), paced by `CliIo.sleep`. Closing the pipe (`| head`) ends it quietly.
- `tribe add <id> --adapter <adapter>` (P1-19, implementation-plan §3.14, ADR 0021): a new tribe in
  `kingdom.tribes[]`, disabled, its adapter a built-in one or an owner file `adapters/<name>.mjs` that must be there;
  no character changes. `tribe check <id>` builds the tribe's runner as `run` does, prints what its adapter declares
  and how far `tribeLimitsOf` lets it go, holds its pinned sign-in to the ones it declares (`checkTribeAuth`), and
  runs runner-core's conformance suite against it (with the real CLI only the checks that burn no or almost no mana;
  `--scenarios` runs all of them against a fake CLI): a tribe that passes is enabled once doctor has pinned its CLI.
  `tribe disable <id>` stops a tribe taking new work. An owner adapter file is imported only here
  (`src/tribe/adapter-file.ts`): runner-core's `adapterKitOf` builds its kit (minimal env, the pinned or given CLI,
  `launchOf`, `hookCommand`) and `adapterOfModule` checks what `createAdapter(kit)` returns, so a broken file is a
  list of reasons for `run`, `doctor` and `tribe check`, never a crash. `tribe list` (P1-34, `src/tribe/list.ts`)
  prints one line per tribe: adapter, enabled or not, pinned CLI version, path and sign-in, and from its runner the
  highest rank `tribeLimitsOf` lets it take (none without `headless`), whether it takes guarded territories, and the
  capabilities it declares; a tribe with no runner yet or an adapter file that does not load says so instead.
- `doctor`: finds each tribe's CLI (`--tool <tribe>=<path>`, the pinned path, PATH, then the adapter's own search:
  Claude Code inside the VS Code extension; npm `.cmd` shims run as `node <script>`; an adapter file is asked
  through its runner's `doctor()`, `src/doctor/adapter-tool.ts`, P1-19), pins path and version with the sign-in the
  adapter declares first (`defaultAuthOf`: the owner's login when it runs with one), refuses a pinned sign-in the
  adapter does not declare (`checkTribeAuth`, P1-19), asks
  the tribe's adapter about its login, how soon it ends and the built hook, refuses Antigravity without
  `--acknowledge-terms` (ADR 0018), turns a disabled tribe on with `--enable <tribe>` (P1-15) only when that run
  has no error for it (P1-34: a CLI not logged in, a sign-in the adapter does not declare or terms not acknowledged
  keep it off, its CLI still pinned), refuses (exit 2, nothing written) a tribe option naming a tribe
  kingdom.json has not, `--acknowledge-terms` for a disabled tribe it would skip, or `--enable` of a tribe whose
  adapter is an owner file, which only `tribe check` enables (P1-34), checks git, the registry
  (a class prompt it lacks: `elvaria migrate` copies the default ones; catalog scripts: `missingRegistryFiles`)
  and each territory, the
  treasury file (`inspectTreasury`: present, mode 0600 outside Windows, `{ "name": "value" }`, every name a
  territory allows; names only, never a value) and, while no Steward holds its lock, the sessions a stopped one
  left running (`sessionsLeftBehind`), which the next `run` kills (P1-11, `src/doctor/check-state.ts`), and the
  mana gauges (P1-32, `src/doctor/check-mana.ts`): a sleeping one as a warning, with the reset its sleep named,
  an awake one with its readings,
  "not measured" when the Steward has logged none.
- Mana gauges for `character list` and `doctor` (`src/gauges.ts`, P1-32), folded from the Steward's `mana.*`
  lines in the event log, since the Steward keeps no file of them: which gauges sleep (`mana.exhausted` /
  `mana.restored`) and the reset a sleep named, the latest reading of each window still in force (`mana.level`, a
  pool's or a model's own cap; `mana.warning`, the only line of a model's cap before P1-32) with its reset. `character list` marks each character the Steward put to sleep for mana
  (`sleeping_mana`) with the gauge it waits for, a model's own cap before its pool, and lists the sleeping gauges
  under the table. Only those: the log does not keep the models an account lists in a group, so the prefix table
  alone would call an Argon character bound by "Gemini Models", which the Steward, reading agy's `/usage`, does not.
- `run`: puts the work engine together and runs the Steward until Ctrl+C (`CliIo.untilStopped`): a runner per
  enabled tribe from `kingdom.tribes[].adapter` (`src/run/crew.ts`: `claude_code`, with `hookCommand` and
  `HOOK_SCRIPT` of `@elvaria/hooks`, since P1-15 `antigravity` from the pinned agy, built on first use in
  `src/run/antigravity.ts`, and since P1-19 an owner adapter file; a tribe without a runner takes no quest, and one
  whose adapter file is broken says why), plots over runner-core's
  `PlotManager` and `runChecks` (`src/run/plots.ts`: prepare, its `commands.setup` given the quest's secrets
  (P1-30), commit, the checks on what the quest touched, given them too (P1-10b), release) with a `ProcessHost` from PATH and each CLI's `forget` (`claude purge`), the console bell saying
  the Steward's notices in the owner's language (from P1-22 also a mana gauge that warns, sleeps or wakes; from
  P1-32 a quest gone to the infirmary by its trip, then each part of the detail on a line of its own, as `quest show`
  says them), and `.state/steward.lock` (a second `run` is refused).

## Does not

- Write or change a quest, or change an existing character: the Steward does (P1-03).
- Decide anything about quests or sessions, or talk to a CLI itself: the Steward and the adapters do; `doctor`
  asks only `--version` and, through the adapter, the login (no model call).
- Inherit `process.env` into child processes: they get `minimalEnv` (ADR 0013), and never a shell (ADR 0015).

## Depends on

- `@elvaria/domain` (schemas, ids, transition table, views), `@elvaria/store` (kingdom folder, inbox, migrate),
  `@elvaria/eventlog` (append, redact; reads the log for the mana gauges and a quest's journal for its infirmary
  reason), `@elvaria/sandbox` (fake days and their replay),
  `@elvaria/registry-default` (`REGISTRY_ROOT`, `registryFiles()` for `init` and `migrate`), `@elvaria/i18n`, `@elvaria/steward`
  (the Steward, unclaimable notices), `@elvaria/runner-core` (`PlotManager`, the adapter kit, the conformance
  suite), `@elvaria/runner-claude` (the
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
old lines included), `src/gauges.spec.ts` (the gauges, and `character list` and `doctor` showing them).
`fixtures/lantern-adapter.mjs` is an owner adapter file that imports nothing, for `fixtures/fake-lantern.mjs`, a
fake CLI with no tool gate: `src/tribe/tribe.spec.ts` adds, pins, checks and disables it; `src/tribe/round.spec.ts`
runs the Steward (`elvaria run`) with it until a rank D quest is done, while a rank C quest stays open (P1-19);
`src/tribe/list.spec.ts` lists it beside the built-in tribes, one with no runner and a broken file, and has
`doctor --enable` refuse it (P1-34).
