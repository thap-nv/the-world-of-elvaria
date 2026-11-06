# @elvaria/cli

## Does

- Ships the `elvaria` command, the only composition root (implementation-plan §1.1): `init`, `doctor`,
  `territory add|list`, `character add|list`, `quest add|list|show|confirm|cancel|edit`, `sandbox generate|replay`,
  `migrate`. The command table (`src/commands.ts`) drives parsing (`util.parseArgs`) and help.
- Prints everything through `t()` of `@elvaria/i18n`, in `kingdom.owner.locale` unless `--locale vi|en` is given;
  `i18next/no-literal-string` (`packages/config/eslint-i18n.mjs`) guards it. Store and registry issues are
  translated by their `code`.
- Sends every quest change as an inbox command (`create_quest`, `confirm`, `cancel`, `archive`, `edit_quest`;
  ADR 0005), after checking ids against the registry and the quest against the transition table.
- Writes new files the Steward does not own: `kingdom.json` (`init`, then `tribes[].tool` from `doctor`), a
  territory, a newly summoned character (create only, never overwrite). Those two are also logged
  (`territory.attached`, `character.created`, with the view after the change, P0-09), so the world sees them.
- `sandbox generate` writes a fake day of `@elvaria/sandbox` to `events/sandbox/<date>.jsonl` (nothing else of the
  kingdom changes); `sandbox replay <file> --speed 20` plays it back as a timeline, one sentence per line in the
  owner's language (`src/sandbox/timeline.ts`), paced by `CliIo.sleep`. Closing the pipe (`| head`) ends it quietly.
- `doctor`: finds each tribe's CLI (`--tool <tribe>=<path>`, the pinned path, then PATH; npm `.cmd` shims run as
  `node <script>`), pins path and version, refuses Antigravity without `--acknowledge-terms` (ADR 0018), checks
  git, the registry (`missingRegistryFiles`) and each territory.

## Does not

- Write or change a quest, or change an existing character: the Steward does (P1-03).
- Run sessions, worktrees or `.git/info/exclude` (runner-core, P1-07); `doctor` only asks `--version`.
- Inherit `process.env` into child processes: they get `minimalEnv` (ADR 0013), and never a shell (ADR 0015).

## Depends on

- `@elvaria/domain` (schemas, ids, transition table, views), `@elvaria/store` (kingdom folder, inbox, migrate),
  `@elvaria/eventlog` (append, redact), `@elvaria/sandbox` (fake days and their replay),
  `@elvaria/registry-default` (`REGISTRY_ROOT`, `registryFiles()` for `init`), `@elvaria/i18n`.

## How to test

```bash
pnpm --filter @elvaria/cli test   # builds dist/, then vitest: commands in-process + node dist/cli.js end to end
pnpm elvaria --help               # runs src/cli.ts directly (Node type stripping), no build
```

Specs run `runCli` on a fake machine (`test/cli.ts`: fixed clock, captured output) and throwaway kingdoms in
paths with a space and a Vietnamese letter. Fake CLIs are npm-style `.cmd` shims on Windows and shebang scripts
elsewhere; `cli.spec.ts` spawns the built bin as the owner would.
