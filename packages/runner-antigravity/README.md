# @elvaria/runner-antigravity

## Does

- Implements `AgentRunner` for Antigravity CLI (`agy`), adapter id `antigravity`, the Gemini tribe's default
  runner (implementation-plan §3.7, ADR 0006, 0018): `createAntigravityRunner({tribe, launch, hook,
terms_acknowledged_at, env, pools?, timeout_ms?})`. `hook` is `hookCommand()` of `@elvaria/hooks`, handed over
  by `apps/cli`. Capabilities for agy 1.5.2: everything but `compact` and `subagent`; `resume` is
  `--conversation <id>`, checked on a real machine.
- Per session: reads `agy --version` into `<run_dir>/agy-version.txt`; writes `settings.json` (the
  `ToolPolicy` as agy prefix rules: `command(pnpm test)`, `write_file(./)`, deny `read_file(.env)`, plus the
  handover letter outside the plot), `policy.json` (runner-core's `writePolicyFile`, with the class's `tools`:
  agy has no `--tools`, so the hook refuses a tool the class lacks, such as `search_web` without `WebSearch`,
  and the names of the session's secrets), `schema.json` for
  `--json-schema`; writes into the plot `.agents/hooks.json` (`node [flags] elvaria-hook.mjs <Event>` for
  SessionStart, PreToolUse, PostToolUse, Stop), the shim `.agents/elvaria-hook.mjs` that holds the paths, and
  `GEMINI.md` (the system prompt, then `@[Territory law](./CLAUDE.md)` and `@[rule](./<file>)` for
  `territory.context_files`, found by runner-core's `contextPathsIn`, the globs read as for a `context: prompt`
  tribe, in the patterns' order, only files that are there, P1-46). Then checks with `agy -p /hooks` (0 tokens) that agy loaded exactly that hook.
- Takes those three files out of the plot when the session ends, before `wait()` or `kill()` settles, and when
  `spawn` refuses after writing them (`removeRunFiles`, P1-23; every write settles before the refusal is thrown,
  `settleAll`, so none lands after the clean-up): agy loads hooks only from the workspace's
  `.agents/` (or `~/.gemini/config/`, which Elvaria never touches), and a formatter the territory runs as a check
  would read them. `.agents/` goes too when empty; a file of the territory's stays. A file that will not go is
  noted in `<run_dir>/stderr.log`.
- Spawns `agy -p <prompt> --output-format stream-json --model <slug> --settings … --print-timeout <n>m
--log-file <run_dir>/agy.log [--json-schema …] [--conversation <id>]`, without a shell, with the request's env
  minus `GIT_*`, the session context as `ELVARIA_*` (runner-core's `runContextOf`),
  `AGY_CLI_DISABLE_AUTO_UPDATE=true` and Elvaria's Node first on `PATH` (the hook calls a bare `node`). agy
  takes the prompt on the command line: on Windows a prompt longer than CreateProcess takes (32 767 characters)
  is refused before the session, with the reason (`commandLineProblem`, P1-15).
- Reads the stream: `init` names the session; `agent_response` steps give text and usage signals (tokens of this
  run's own steps, since `result.usage` adds up a resumed conversation; `cache_read_tokens` at a tenth through
  runner-core's `countedTokens`, as for Claude, P1-22) and the turn count; refused tool steps
  and `denied_actions` give `tool_blocked` and `permission_denials`. Stops the run when a turn past
  `budget.max_turns` begins (agy has no `--max-turns`). Outcome: SUCCESS with an answer → `completed`; a
  soft-deny or an empty answer → `error`; `print_timeout` → `budget`; a quota in `AGY_ERROR` → `rate_limited`, its `rate_limit` signal carrying `resets_at` from the error's
  `Resets in 4h53m54s` (`resetsAtOf`, P1-22), so the Steward probes just after the reset.
- Writes what only the stream knows through runner-core, as the Claude adapter does: `agent.session.end`
  (outcome and usage, a killed run included) with `openRunLog`, and stdout and stderr redacted (the session's
  secret values first, `secretValuesOf`) into
  `<run_dir>/stdout.jsonl` and `stderr.log` with `openRunOutput`, plus the runner's own notes there.
- `probe()` reads `agy -p /usage --output-format json` into buckets per pool (`usageBuckets`), and returns them as
  the account's windows for the mana gauge (`windowsOf`; the Argon bucket names its model; a group's buckets list
  the models its description names, `Models within this group: Gemini Flash, Gemini Pro`, so Argon on a Pro plan is
  bound by its own cap only, P1-22; `/usage` costs no mana, so `ping: false` changes nothing); `doctor()` checks
  `--version`, `agy --output-format json models` (sign-in) and `terms_acknowledged_at`.

## Does not

- Run without `terms_acknowledged_at` (ADR 0018), on a plot whose `.agents/hooks.json`, shim or `GEMINI.md`
  belongs to the territory, or when agy loads any hook besides Elvaria's (a global `auto_approve` would pass even
  the deny rules): `spawn` rejects with the reason.
- Allow sub-agents or questions to a person: the hook denies `invoke_subagent`, `define_subagent`,
  `browser_subagent` and `ask_*` (ADR 0017; a question goes in the handover letter).
- Spawn or kill a process itself: `startChild` / `runToEnd` of runner-core start agy and read its lines, and a
  kill (the Steward's, or the turn breaker past `budget.max_turns`) takes agy's whole tree through runner-core's
  `killTree` (P1-06). `src/launch.ts` keeps agy's `{command, args}` (the shape of `hookCommand()`) and turns it
  into runner-core's `{file, args}`. Check the journal for the SessionStart line, as the Claude adapter does: the
  `/hooks` check before the session already proves the hook is loaded.
- Touch `~/.gemini`, parse transcripts, or pass `--dangerously-skip-permissions` or `--effort`.

## Depends on

- `@elvaria/runner-core` (types, `toolOf`, `readQuestion`, the signal channel, `runContextOf`, `contextEnv`,
  `writePolicyFile`, `openRunLog`, `openRunOutput`, `startChild`, `runToEnd`, the conformance suite). No third-party package. The specs run the hook from `packages/hooks/src` by path, never by import.

## How to test

```bash
pnpm --filter @elvaria/runner-antigravity test
pnpm --filter @elvaria/hooks build && ELVARIA_LIVE=1 pnpm --filter @elvaria/runner-antigravity test   # real agy, a little mana
```

`fixtures/fake-agy.mjs` stands in for agy: it replays a recorded stream (`ELVARIA_FAKE_AGY_REPLAY`), or plays a
conformance scenario the way agy 1.5.2 does, running the generated hooks through `cmd /c` or `sh -c` and applying
the settings as prefix rules. Fixtures: the redacted runs of spike P1-12a, the `--conversation` pair and the
`/hooks` answer of P1-12b, and `constructed-rate-limit.*`, built from agy's changelog because no quota has run
out on a real machine yet. `ELVARIA_AGY` points the live specs at another agy. `run-files.spec.ts` checks the
plot after a session that completed, was killed or never started: no `.agents/` and no `GEMINI.md` left of
Elvaria's, the territory's own files untouched.
