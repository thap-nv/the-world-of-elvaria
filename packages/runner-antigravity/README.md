# @elvaria/runner-antigravity

## Does

- Implements `AgentRunner` for Antigravity CLI (`agy`), adapter id `antigravity`, the Gemini tribe's default
  runner (implementation-plan §3.7, ADR 0006, 0018): `createAntigravityRunner({tribe, launch, hook,
terms_acknowledged_at, env, pools?, timeout_ms?})`. `hook` is `hookCommand()` of `@elvaria/hooks`, handed over
  by `apps/cli`. Capabilities for agy 1.5.2: everything but `compact` and `subagent`; `resume` is
  `--conversation <id>`, checked on a real machine.
- Per session: reads `agy --version` into `<run_dir>/agy-version.txt`; writes `settings.json` (the
  `ToolPolicy` as agy prefix rules: `command(pnpm test)`, `write_file(./)`, deny `read_file(.env)`, plus the
  handover letter outside the plot), `policy.json` (v1: laws and context for the hook), `schema.json` for
  `--json-schema`; writes into the plot `.agents/hooks.json` (`node [flags] elvaria-hook.mjs <Event>` for
  SessionStart, PreToolUse, PostToolUse, Stop), the shim `.agents/elvaria-hook.mjs` that holds the paths, and
  `GEMINI.md` (the system prompt, then `@[Territory law](./CLAUDE.md)` and `@[rule](./<file>)` for
  `territory.context_files`). Then checks with `agy -p /hooks` (0 tokens) that agy loaded exactly that hook.
- Spawns `agy -p <prompt> --output-format stream-json --model <slug> --settings … --print-timeout <n>m
--log-file <run_dir>/agy.log [--json-schema …] [--conversation <id>]`, without a shell, with the request's env,
  `AGY_CLI_DISABLE_AUTO_UPDATE=true` and Elvaria's Node first on `PATH` (the hook calls a bare `node`).
- Reads the stream: `init` names the session; `agent_response` steps give text and usage signals (tokens of this
  run's own steps, since `result.usage` adds up a resumed conversation) and the turn count; refused tool steps
  and `denied_actions` give `tool_blocked` and `permission_denials`. Stops the run when a turn past
  `budget.max_turns` begins (agy has no `--max-turns`). Outcome: SUCCESS with an answer → `completed`; a
  soft-deny or an empty answer → `error`; `print_timeout` → `budget`; a quota in `AGY_ERROR` → `rate_limited`.
- `probe()` reads `agy -p /usage --output-format json` into buckets per pool (`usageBuckets`); `doctor()` checks
  `--version`, `agy --output-format json models` (sign-in) and `terms_acknowledged_at`.

## Does not

- Run without `terms_acknowledged_at` (ADR 0018), on a plot whose `.agents/hooks.json`, shim or `GEMINI.md`
  belongs to the territory, or when agy loads any hook besides Elvaria's (a global `auto_approve` would pass even
  the deny rules): `spawn` rejects with the reason.
- Allow sub-agents or questions to a person: the hook denies `invoke_subagent`, `define_subagent`,
  `browser_subagent` and `ask_*` (ADR 0017; a question goes in the handover letter).
- Write `agent.session.end` (an adapter may not import the event log; implementation-plan §11, P1-12b), redact
  stdout or stderr into the run folder (P1-10), or kill a process tree (P1-06): `src/process/child.ts` is the
  generic spawn and kill that moves to runner-core.
- Touch `~/.gemini`, parse transcripts, or pass `--dangerously-skip-permissions` or `--effort`.

## Depends on

- `@elvaria/runner-core` (types, `toolOf`, `readQuestion`, the signal channel, the conformance suite). No
  third-party package. The specs run the hook from `packages/hooks/src` by path, never by import.

## How to test

```bash
pnpm --filter @elvaria/runner-antigravity test
pnpm --filter @elvaria/hooks build && ELVARIA_LIVE=1 pnpm --filter @elvaria/runner-antigravity test   # real agy, a little mana
```

`fixtures/fake-agy.mjs` stands in for agy: it replays a recorded stream (`ELVARIA_FAKE_AGY_REPLAY`), or plays a
conformance scenario the way agy 1.5.2 does, running the generated hooks through `cmd /c` or `sh -c` and applying
the settings as prefix rules. Fixtures: the redacted runs of spike P1-12a, the `--conversation` pair and the
`/hooks` answer of P1-12b, and `constructed-rate-limit.*`, built from agy's changelog because no quota has run
out on a real machine yet. `ELVARIA_AGY` points the live specs at another agy.
