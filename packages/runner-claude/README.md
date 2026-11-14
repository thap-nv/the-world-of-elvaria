# @elvaria/runner-claude

## Does

- Runs Claude Code 2.1.318 headless behind `AgentRunner` (adapter `claude_code`, implementation-plan §3.7, ADR 0006,
  0007): `createClaudeRunner({ tribe, executable, hookCommand, hookScript, env })`. apps/cli hands it what this
  package may not import: `hookCommand` and `HOOK_SCRIPT` of `@elvaria/hooks`, and the minimal env (§3.9).
- Writes the run folder of every session (`<kingdom>/.runs/<quest>-<n>/`): `policy.json` for the hook (laws and
  context, through runner-core, and `CLAUDE_PROTECTED_PATHS` as `cli_protected_paths`: the folders and files
  Claude Code 2.1.319 refuses to write whatever `--settings` allows, read from its build in P1-24, so the hook
  says so first), `settings.json` (dontAsk, the allow/deny of the `ToolPolicy` with file tools
  scoped to the plot as `Read(./**)`, the assignee's own handover letter by absolute path, Elvaria's hook on the
  twelve events in the exec form, its `PreToolUse` handler with `onFailure: "block"` and `--event PreToolUse` so
  the hook denies a call whose payload it cannot read (P1-36, ADR 0007), `ELVARIA_*` and `CLAUDE_CODE_*` env and
  the Bash timeouts (`bashTimeoutEnv`, P1-48: `BASH_DEFAULT_TIMEOUT_MS` and `BASH_MAX_TIMEOUT_MS` as long as the
  territory's longest check, never under Claude Code's own 2 and 10 minutes, so a judge running dc1's 30-minute
  e2e itself is not cut), no auto memory, no attribution line),
  `agents.json` (the one apprentice: the character's tools minus `Agent`, a hard `maxTurns`, the cheapest model,
  and a description naming the models the character may ask for), `system.md` for
  `--append-system-prompt-file` and the prompt as sent, redacted. Generated settings are checked before spawn,
  because Claude Code drops a malformed part without a word. What the runner writes of the session's
  text (`prompt.md`, `stdout.jsonl`, `stderr.log`, its event lines) masks the session's secret values
  (`secretValuesOf`) before the patterns (§3.9).
- Spawns `claude -p` with stream-json, hook events, dontAsk, `--tools`, `--strict-mcp-config` and
  `--setting-sources project,local`, without a shell, the prompt on stdin, a chosen `--session-id` (or
  `--resume`). Reads the stream: signals (`text`, `usage` so far, `tool_blocked`, `rate_limit`, `mana` with the
  windows of each `rate_limit_event`), the lines only
  the stream knows (`agent.session.end` from the last `result`, `agent.subagent.start/end` from
  `system/task_*`, with `stopped: max_turns` when the notification says the CLI cut the apprentice at its
  `maxTurns`, and `agent.subagent.overrun` past `subagent_max_minutes`; `mana.signal` of an API retry), and
  `RunResult` (outcome from `is_error` + `terminal_reason`, tokens of `modelUsage`, denials, structured output, the
  letter's question). Tokens are input, output and cache writes, plus cache reads at a tenth (`countedTokens` of
  the domain through runner-core, P1-23): Claude Code reads its whole cached context on every call, and counted
  in full those reads cut ordinary sessions at the default budget.
- Lets the character pick its apprentice's model per call, never above its own (§3.12, decided after P1-09):
  `APPRENTICE_MODELS` is the adapter's ladder (`haiku` < `sonnet` < `opus` < `fable`, the Agent tool's `model`
  values in 2.1.318); `apprenticeModelsOf(character.model)` cuts it at the character's own model (a slug that
  names no alias gets `haiku` alone) and goes into `policy.json` as `apprentice_models`, which the hook enforces.
- Stops a session that Elvaria's SessionStart hook did not record in the quest's journal: it would run without the
  laws. Its outcome is `error`.
- `probe()`: `claude -p "/usage"` (no model call); when no window of the account is full, one turn of the cheapest
  model with no tool. The windows of `/usage` come back in `windows`; `probe({ping: false})` stops after `/usage`. `doctor()`: the CLI (PATH, `~/.local/bin`, `%APPDATA%\npm`, the VS Code extension's binary,
  newest first), its version, `claude auth status --json` (and a warning a week before `loginExpiresAt`), and
  whether the hook is built (not built: `auth_ok: false`, as every tribe's, `hookProblem` of runner-core); a call
  stopped at its timeout or that never started says so, never "not logged in".
- `createClaudeForget()`: the `forget` of `PlotManager.release`, `claude purge --yes <worktree>` (the CLI drops
  its own transcripts of a removed worktree; "No Claude Code project state found" counts as done).
- Parses the account's limits for the mana gauge (P1-05): `rateLimitWindowsOf` (`rate_limit_event`, sent on as
  the `mana` signal) and `usageWindowsOf` (the text of `/usage`, resets turned into instants, in
  `ProbeResult.windows`; `Current week (Fable)` names its model). (P1-48) A rejected `rate_limit_event` names the
  window it spent (`spentWindowOf`: `rateLimitType` `five_hour`, `seven_day`, or `seven_day_<model>` for one
  model's weekly cap), sent in the same `mana` signal at 100 % until its `resetsAt`, so the Steward sleeps that
  gauge until then; `overage` or a type it does not know names none.
- Turns the policy's `graph_commands` (PS-21) into one `Bash(<command>:*)` allow rule each, and adds `Bash` to
  `--tools` for a class without it (`src/graph-rules.ts`); the hook refuses any other line there.

## Does not

- Kill a process tree itself: `kill()` hands the CLI's pid to runner-core's `killTree` (P1-06), which takes the
  CLI and every process under it (taskkill on Windows; SIGTERM, then SIGKILL after `kill_grace_ms` elsewhere); a
  short call (`--version`, `auth status`, `/usage`, the probe's ping, `purge`) past its timeout goes the same way.
- Build the minimal env or resolve treasury secrets (the Steward does, with runner-core's treasury), nor decide
  anything: the Steward chooses who, when, with which budget and whether to resume. Secrets stay in the
  process env: settings.json carries only `ELVARIA_*`, `CLAUDE_CODE_*` and the Bash timeouts, policy.json only
  the secrets' names.
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
and the Agent SDK's types, since no run has met a real one yet (P1-16 and P1-50 included); its fake-only scenario `leak` (`fixtures/fake-claude-leak.mjs`) prints secrets
everywhere, and `src/secrets.spec.ts` runs it with Elvaria's real hook from source and finds none of them in
any file of the kingdom. `fixtures/fake-hook.mjs` stands in for the built hook elsewhere. Both fakes read stdin
as the real hook does (`fixtures/read-stdin.mjs`, P1-36); `src/fixtures-stdin.spec.ts` sends a prompt larger than
any pipe buffer to a fake CLI whose stdin a preload made non-blocking; `ELVARIA_SESSION_SPEC_REPEATS=<n>` runs it
and the first case of `src/session.spec.ts` n more times (50 runs passed on macOS CI in PR #82). `src/live.spec.ts` runs the
conformance suite's live checks with the real CLI and the real hook, the Stop gate, a commit without
attribution, the apprentice (the cheapest model, a stronger one refused, cut at `maxTurns`) and Grep refused
outside the plot; `ELVARIA_CLAUDE` points them at another `claude`.
