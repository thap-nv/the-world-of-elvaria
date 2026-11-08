# @elvaria/cli

## Does

- Ships the `elvaria` command, the only composition root (implementation-plan §1.1): `init`, `doctor`,
  `territory add|list`, `character add|list|suspend|release|level`,
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
  best candidate. `character suspend <id> [--reason]` and `character release <id>` send `suspend` and `release` (a
  character the Steward would refuse, unknown, suspended already or not suspended, is refused here), and `suspend`
  says what becomes of the quest the character holds (the owner's decision after P1-26). `character level <id>
<level>` sends `set_level` (a level outside 1–10 or the one the character has is refused here) and says the rank
  ceiling of the new level (P1-29).
- Writes new files the Steward does not own: `kingdom.json` (`init`, then `tribes[].tool` and, with `--enable`,
  `tribes[].enabled` from `doctor`), a
  territory, a newly summoned character (create only, never overwrite). Those two are also logged
  (`territory.attached`, `character.created`, with the view after the change, P0-09), so the world sees them.
  Without `--level`, a character starts at its model's level (`src/character/starting-level.ts`: Opus 5, Sonnet
  or Pro 4, Argon 3, Haiku or Flash 2), else at 1 with a word on `--level` (P1-26).
- `sandbox generate` writes a fake day of `@elvaria/sandbox` to `events/sandbox/<date>.jsonl` (nothing else of the
  kingdom changes); `sandbox replay <file> --speed 20` plays it back as a timeline, one sentence per line in the
  owner's language (`src/sandbox/timeline.ts`), paced by `CliIo.sleep`. Closing the pipe (`| head`) ends it quietly.
- `doctor`: finds each tribe's CLI (`--tool <tribe>=<path>`, the pinned path, PATH, then the adapter's own search:
  Claude Code inside the VS Code extension; npm `.cmd` shims run as `node <script>`), pins path and version, asks
  the tribe's adapter about its login, how soon it ends and the built hook, refuses Antigravity without
  `--acknowledge-terms` (ADR 0018), turns a disabled tribe on with `--enable <tribe>` once its CLI is pinned
  (P1-15; `elvaria tribe` is P1-19), refuses (exit 2, nothing written) a tribe option naming a tribe
  kingdom.json has not, or `--acknowledge-terms` for a disabled tribe it would skip, checks git, the registry
  (a class prompt it lacks: `elvaria migrate` copies the default ones; catalog scripts: `missingRegistryFiles`)
  and each territory, the
  treasury file (`inspectTreasury`: present, mode 0600 outside Windows, `{ "name": "value" }`, every name a
  territory allows; names only, never a value) and, while no Steward holds its lock, the sessions a stopped one
  left running (`sessionsLeftBehind`), which the next `run` kills (P1-11, `src/doctor/check-state.ts`).
- `run`: puts the work engine together and runs the Steward until Ctrl+C (`CliIo.untilStopped`): a runner per
  enabled tribe from `kingdom.tribes[].adapter` (`src/run/crew.ts`: `claude_code`, with `hookCommand` and
  `HOOK_SCRIPT` of `@elvaria/hooks`, and since P1-15 `antigravity` from the pinned agy, built on first use in
  `src/run/antigravity.ts`; a tribe without a runner takes no quest), plots over runner-core's
  `PlotManager` and `runChecks` (`src/run/plots.ts`: prepare, commit, the checks on what the quest touched,
  release) with a `ProcessHost` from PATH and each CLI's `forget` (`claude purge`), the console bell saying
  the Steward's notices in the owner's language, and `.state/steward.lock` (a second `run` is refused).

## Does not

- Write or change a quest, or change an existing character: the Steward does (P1-03).
- Decide anything about quests or sessions, or talk to a CLI itself: the Steward and the adapters do; `doctor`
  asks only `--version` and, through the adapter, the login (no model call).
- Inherit `process.env` into child processes: they get `minimalEnv` (ADR 0013), and never a shell (ADR 0015).

## Depends on

- `@elvaria/domain` (schemas, ids, transition table, views), `@elvaria/store` (kingdom folder, inbox, migrate),
  `@elvaria/eventlog` (append, redact), `@elvaria/sandbox` (fake days and their replay),
  `@elvaria/registry-default` (`REGISTRY_ROOT`, `registryFiles()` for `init` and `migrate`), `@elvaria/i18n`, `@elvaria/steward`
  (the Steward, unclaimable notices), `@elvaria/runner-core` (`PlotManager`), `@elvaria/runner-claude` (the
  `claude_code` adapter), `@elvaria/runner-antigravity` (the `antigravity` adapter, P1-15), `@elvaria/hooks` (the
  hook's command).

## How to test

```bash
pnpm --filter @elvaria/cli test   # builds dist/, then vitest: commands in-process + node dist/cli.js end to end
pnpm elvaria --help               # runs src/cli.ts directly (Node type stripping), no build
```

Specs run `runCli` on a fake machine (`test/cli.ts`: fixed clock, captured output) and throwaway kingdoms in
paths with a space and a Vietnamese letter. Fake CLIs are npm-style `.cmd` shims on Windows and shebang scripts
elsewhere; `cli.spec.ts` spawns the built bin as the owner would.
