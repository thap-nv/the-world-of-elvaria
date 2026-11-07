# @elvaria/cli

## Does

- Ships the `elvaria` command, the only composition root (implementation-plan §1.1): `init`, `doctor`,
  `territory add|list`, `character add|list`, `quest add|list|show|confirm|cancel|archive|edit`, `seal`, `return`,
  `answer`, `run`,
  `sandbox generate|replay`, `migrate`. The command table (`src/commands.ts`) drives parsing (`util.parseArgs`), help, and the reference
  `docs/cli.md` that `pnpm docs:gen` renders from it (`scripts/docs-cli.mjs`).
- Prints everything through `t()` of `@elvaria/i18n`, in `kingdom.owner.locale` unless `--locale vi|en` is given;
  `i18next/no-literal-string` (`packages/config/eslint-i18n.mjs`) guards it. Store and registry issues are
  translated by their `code`.
- Sends every quest change as an inbox command (`create_quest`, `confirm`, `cancel`, `archive`, `edit_quest`,
  `seal`, `return`, `answer`; ADR 0005), after checking ids against the registry and the quest against the
  transition table. `return` asks for a note of at least 20 characters (`--note`) and a `--fail-kind` (`other` by
  default), since the Steward writes it as the owner's fail verdict. `answer <quest> "<answer>"` takes a non-empty
  answer for a `blocked` quest; the Steward then goes on with the same attempt, in the asking session when the
  answer comes within `dispatch.resume_after_answer_minutes` (ADR 0017). The bell of `run` prints that command
  with each question.
- Writes new files the Steward does not own: `kingdom.json` (`init`, then `tribes[].tool` from `doctor`), a
  territory, a newly summoned character (create only, never overwrite). Those two are also logged
  (`territory.attached`, `character.created`, with the view after the change, P0-09), so the world sees them.
- `sandbox generate` writes a fake day of `@elvaria/sandbox` to `events/sandbox/<date>.jsonl` (nothing else of the
  kingdom changes); `sandbox replay <file> --speed 20` plays it back as a timeline, one sentence per line in the
  owner's language (`src/sandbox/timeline.ts`), paced by `CliIo.sleep`. Closing the pipe (`| head`) ends it quietly.
- `doctor`: finds each tribe's CLI (`--tool <tribe>=<path>`, the pinned path, PATH, then the adapter's own search:
  Claude Code inside the VS Code extension; npm `.cmd` shims run as `node <script>`), pins path and version, asks
  the tribe's adapter about its login, how soon it ends and the built hook, refuses Antigravity without
  `--acknowledge-terms` (ADR 0018), checks git, the registry (`missingRegistryFiles`) and each territory, the
  treasury file (`inspectTreasury`: present, mode 0600 outside Windows, `{ "name": "value" }`, every name a
  territory allows; names only, never a value) and, while no Steward holds its lock, the sessions a stopped one
  left running (`sessionsLeftBehind`), which the next `run` kills (P1-11, `src/doctor/check-state.ts`).
- `run`: puts the work engine together and runs the Steward until Ctrl+C (`CliIo.untilStopped`): a runner per
  enabled tribe from `kingdom.tribes[].adapter` (`src/run/crew.ts`: `claude_code` today, with `hookCommand` and
  `HOOK_SCRIPT` of `@elvaria/hooks`; a tribe without a runner takes no quest), plots over runner-core's
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
  `@elvaria/registry-default` (`REGISTRY_ROOT`, `registryFiles()` for `init`), `@elvaria/i18n`, `@elvaria/steward`
  (the Steward, unclaimable notices), `@elvaria/runner-core` (`PlotManager`), `@elvaria/runner-claude` (the
  `claude_code` adapter), `@elvaria/hooks` (the hook's command).

## How to test

```bash
pnpm --filter @elvaria/cli test   # builds dist/, then vitest: commands in-process + node dist/cli.js end to end
pnpm elvaria --help               # runs src/cli.ts directly (Node type stripping), no build
```

Specs run `runCli` on a fake machine (`test/cli.ts`: fixed clock, captured output) and throwaway kingdoms in
paths with a space and a Vietnamese letter. Fake CLIs are npm-style `.cmd` shims on Windows and shebang scripts
elsewhere; `cli.spec.ts` spawns the built bin as the owner would.
