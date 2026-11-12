# @elvaria/runner-codex

## Does

- Implements `AgentRunner` for Codex CLI, adapter id `codex_cli`, the third tribe (implementation-plan §3.7, §3.14,
  ADR 0006, 0021; [spike Codex 2026-11-12](../../docs/spikes/codex-2026-11-12.md)): `createCodexRunner({tribe,
launch, hook, env, timeout_ms?, platform?})`. `hook` is `hookCommand()` of `@elvaria/hooks`, handed over by
  `apps/cli`. Capabilities for Codex 0.167.0-alpha.4.1: everything but `compact` and `subagent`; `auth: ['login']`
  (the owner's ChatGPT sign-in); `shell: {win32: 'Windows PowerShell (powershell.exe)'}`; `search: false`, since
  Codex has no tool that reads or searches files, so runner-core gives a class with Glob or Grep `git grep` and
  `git ls-files`.
- Per session writes `policy.json` (runner-core's `writePolicyFile`: laws, context, secret names, the class's
  `tools`, `search_commands`) and, for a structured answer, `schema.json` in the run folder; and
  `AGENTS.override.md` at the root of the plot, which Codex reads in place of `AGENTS.md`: the system part of the
  prompt, the territory's `AGENTS.md`, `CLAUDE.md` and `territory.context_files` copied in (runner-core's
  `readContextFiles`, each cut at 24 000 characters), then what Codex's tools are for this class (the shell reads
  and searches; `apply_patch` writes; git's folder is read-only, the Steward commits; no sub-agents, no
  `request_user_input`). The file goes when the session ends, or never started; a territory's own
  `AGENTS.override.md` refuses the session and stays.
- Spawns `codex exec --json --ignore-user-config --skip-git-repo-check --disable plugins --disable apps --disable
image_generation -m <model> -c … --dangerously-bypass-hook-trust [--output-schema <run_dir>/schema.json] -` (or
  `codex exec resume … <thread_id> -`), without a shell, the prompt's user part on stdin, with the request's env
  minus `GIT_*` and the session context as `ELVARIA_*`. Everything else goes through `-c`, the same for a new and a
  resumed session (`exec resume` takes neither `-s`, `-C` nor `--add-dir`): `approval_policy="never"`,
  `sandbox_mode` (`workspace-write` for a session with a write tool, `read-only` otherwise),
  `windows.sandbox="unelevated"`, the temp folders out of the writable roots and the quest's folder in (the
  handover letter), the network on, `history.persistence="none"`, `project_doc_max_bytes`, `web_search` (`live`
  for a class with WebFetch or WebSearch), `model_reasoning_effort` from the slug's end (`gpt-6-luna-low`), and the
  four hooks (`SessionStart`, `PreToolUse`, `PostToolUse`, `Stop`) as session flags, each with a POSIX `command`
  and a PowerShell `command_windows` (`& '<node>' '<arg>' …`), `--policy <run_dir>/policy.json --dialect codex`.
- Runs Codex's hook-trust bypass only after `codex app-server`'s `hooks/list` (0 mana, the same flags) shows that
  every hook Codex would run for the plot is one of Elvaria's four, enabled, with its command as given (the
  owner's choice of 2026-11-12, ADR 0021 amended): a hook of the owner's, a plugin's or a project's refuses the
  session, since the bypass would run it unreviewed.
- Reads the stream: `thread.started` names the session; `agent_message` items give text; tool items and messages
  count as the model's actions, and a session stops when one past `budget.max_turns` begins (Codex has no turn
  cap); `turn.completed.usage` gives the tokens (input past the cache in full, cache reads at a tenth through
  runner-core's `countedTokens`). The hook's refusals have no stream line: they are read from stderr (`Command
blocked by PreToolUse hook: <reason>. Command: <command>`) into `tool_blocked` signals and `permission_denials`.
  Outcome: a kill → `killed`, the action cap → `max_turns`, a completed turn with exit 0 → `completed`, anything
  else → `error`; a usage-limit message (`You've hit your usage limit`, `usage_limit_reached`…) adds
  `rate_limited` and a `rate_limit` signal. A structured answer is the JSON object of the last message.
- Writes `agent.session.end` (outcome and usage, a killed run included) with `openRunLog`, and stdout and stderr
  redacted into `<run_dir>/stdout.jsonl` and `stderr.log` with `openRunOutput`.
- `probe()` reads `account/rateLimits/read` of `codex app-server` (0 mana; the client keeps stdin open until every
  answer came, since the server leaves when it closes): the 5-hour and weekly windows, and a limit of one model
  named; rate limited while a window of the account is spent or the account allows no usage. `doctor()` runs
  `--version` and `login status`, and checks the built hook. `locateCodex` finds the CLI on PATH, in npm's folder
  or in the VS Code extension `openai.chatgpt` (`bin/<os-arch>/codex(.exe)`).

## Does not

- Read or write `~/.codex`, change `CODEX_HOME` (the sign-in lives there), or load the owner's `config.toml`
  (`--ignore-user-config`); Codex itself keeps its session rollouts there, which Elvaria never parses.
- Pass `--dangerously-bypass-approvals-and-sandbox`, `--worktree` or `--ephemeral` (a resumed session needs its
  rollout); pass the hook-trust bypass without the `hooks/list` check.
- Enforce a class's Bash rules command by command: Codex has no per-command allow rules. The sandbox fences the
  writes, the hook the laws, `git push`, the scratch plot's history and the class's tools (spike §5).
- Spawn or kill a session itself: runner-core's `startChild` (with the prompt on stdin) and `killTree` do. Only the
  app-server client spawns its own child, because it talks both ways.

## Depends on

- `@elvaria/runner-core` (types, `readContextFiles`, `writePolicyFile`, `runContextOf`, `contextEnv`, `openRunLog`,
  `openRunOutput`, `startChild`, `runToEnd`, `killTree`, `jsonOfText`, `readQuestion`, the signal channel, the
  conformance suite). No third-party package. The specs run the hook from `packages/hooks/src` by path, never by
  import.

## How to test

```bash
pnpm --filter @elvaria/runner-codex test
pnpm --filter @elvaria/hooks build && ELVARIA_LIVE=1 pnpm --filter @elvaria/runner-codex test   # real Codex, a little usage
```

`fixtures/fake-codex.mjs` stands in for Codex: it answers `--version`, `login status` and `app-server`
(`fake-codex-server.mjs`: `hooks/list` from its own `-c` hooks, `account/rateLimits/read` from `rate-limits.json`),
replays a recorded stream (`ELVARIA_FAKE_CODEX_REPLAY`), or plays a conformance scenario as Codex does: the prompt
read on stdin, the `-c` hooks run through PowerShell's `command_windows` on Windows or `sh -c` elsewhere, and
skipped unless the trust bypass is given. Fixtures are the spike's runs, redacted (`stream-*.jsonl` and their
`.stderr.txt`, `hook-payloads.jsonl`, `hooks-list.json`, `rate-limits.json`), and `constructed-usage-limit.jsonl`,
built from the binary's own words. `ELVARIA_CODEX` points the live specs at another Codex; they use `gpt-6-luna-low`.
