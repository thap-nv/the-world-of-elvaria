# @elvaria/runner-claude

## Does

- Runs Claude Code 2.1.318 headless behind `AgentRunner` (adapter `claude_code`, implementation-plan §3.7, ADR 0006,
  0007): `createClaudeRunner({ tribe, executable, hookCommand, hookScript, env })`. apps/cli hands it what this
  package may not import: `hookCommand` and `HOOK_SCRIPT` of `@elvaria/hooks`, and the minimal env (§3.9).
- Writes the run folder of every session (`<kingdom>/.runs/<quest>-<n>/`): `policy.json` for the hook (laws and
  context, through runner-core), `settings.json` (dontAsk, the allow/deny of the `ToolPolicy` with file tools
  scoped to the plot as `Read(./**)`, the assignee's own handover letter by absolute path, Elvaria's hook on the
  twelve events in the exec form, `ELVARIA_*` and `CLAUDE_CODE_*` env, no auto memory, no attribution line),
  `agents.json` (the one apprentice: the character's tools minus `Agent`, a hard `maxTurns`), `system.md` for
  `--append-system-prompt-file` and the prompt as sent, redacted. Generated settings are checked before spawn,
  because Claude Code drops a malformed part without a word. Every file the runner writes masks the session's
  secret values (`secretValuesOf`) before the patterns (§3.9).
- Spawns `claude -p` with stream-json, hook events, dontAsk, `--tools`, `--strict-mcp-config` and
  `--setting-sources project,local`, without a shell, the prompt on stdin, a chosen `--session-id` (or
  `--resume`). Reads the stream: signals (`text`, `usage` so far, `tool_blocked`, `rate_limit`, `mana` with the
  windows of each `rate_limit_event`), the lines only
  the stream knows (`agent.session.end` from the last `result`, `agent.subagent.start/end` from
  `system/task_*`, `mana.signal` of an API retry), and `RunResult` (outcome from `is_error` + `terminal_reason`,
  tokens of `modelUsage`, denials, structured output, the letter's question).
- Stops a session that Elvaria's SessionStart hook did not record in the quest's journal: it would run without the
  laws. Its outcome is `error`.
- `probe()`: `claude -p "/usage"` (no model call); when no window of the account is full, one turn of the cheapest
  model with no tool. The windows of `/usage` come back in `windows`; `probe({ping: false})` stops after `/usage`. `doctor()`: the CLI (PATH, `~/.local/bin`, `%APPDATA%\npm`, the VS Code extension's binary,
  newest first), its version, `claude auth status --json` (and a warning a week before `loginExpiresAt`), and
  whether the hook is built.
- `createClaudeForget()`: the `forget` of `PlotManager.release`, `claude purge --yes <worktree>` (the CLI drops
  its own transcripts of a removed worktree; "No Claude Code project state found" counts as done).
- Parses the account's limits for the mana gauge (P1-05): `rateLimitWindowsOf` (`rate_limit_event`, sent on as
  the `mana` signal) and `usageWindowsOf` (the text of `/usage`, resets turned into instants, in
  `ProbeResult.windows`; `Current week (Fable)` names its model).

## Does not

- Kill a process tree: `kill()` ends the CLI's own process until P1-06 brings `runner-core/src/process/`.
- Build the minimal env or resolve treasury secrets (the Steward does, with runner-core's treasury), nor decide
  anything: the Steward chooses who, when, with which budget and whether to resume. Secrets stay in the
  process env: settings.json carries only `ELVARIA_*`, policy.json only the secrets' names.
- Read or write `~/.claude/`, parse transcripts, or use `--bare`, `--worktree`, `--dangerously-skip-permissions`.

## Depends on

- `@elvaria/runner-core` (the interface, `ToolPolicy`, `policy.json`, the run log and output, the conformance
  suite). No third-party package.

## How to test

```bash
pnpm --filter @elvaria/runner-claude test
pnpm --filter @elvaria/hooks build && ELVARIA_LIVE=1 pnpm --filter @elvaria/runner-claude test   # real CLI, a little mana
```

`fixtures/*.jsonl` are the redacted real runs of spike P1-02 (catalogue in `docs/spikes/claude-2026-11.md`).
`fixtures/fake-claude.mjs` plays the conformance scenarios through the real run files (it runs the hooks the
settings declare) or replays a fixture verbatim (`FAKE_CLAUDE_REPLAY`); its 429 lines are self-built from the docs
until P1-16 records real ones; its fake-only scenario `leak` (`fixtures/fake-claude-leak.mjs`) prints secrets
everywhere, and `src/secrets.spec.ts` runs it with Elvaria's real hook from source and finds none of them in
any file of the kingdom. `fixtures/fake-hook.mjs` stands in for the built hook elsewhere. `src/live.spec.ts` runs the
conformance suite's live checks with the real CLI and the real hook, the Stop gate, and a commit without
attribution.
