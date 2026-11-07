# ADR 0006 · Runner is an adapter behind AgentRunner; CLIs are pinned and observed via hooks + stream

- Status: accepted · 2026-11-06
- Related: [implementation-plan.md](../implementation-plan.md) §3.7, §3.10; [cli-facts-2026-11-06.md](../reference/cli-facts-2026-11-06.md)

## Context

Two CLIs (Claude Code; Antigravity CLI, with Gemini CLI as fallback) change flags and hooks every few days: Claude Code went from 2.1.316 to 2.1.318 in four days. The world must see tribes, never CLI names.

## Decision

- `interface AgentRunner { tribe; adapter; capabilities; spawn(req); probe(); doctor() }` lives in `runner-core`. `RunningSession` exposes `signals` (usage, rate_limit, text), `wait(): RunResult` and `kill(reason)`. (Amended 2026-11-07, P1-01: signals also carry `tool_blocked`; `RunResult` adds `rate_limited` and `question`, the Question section of the handover letter; `AdapterCapabilities` lives in the domain beside `tribeLimitsOf`, which the domain may not import from runner-core.)
- `runner-core` owns everything shared: `buildPrompt` (templates, snapshot-tested), `ToolPolicy` from class + territory laws + role, `PlotManager`, `runChecks`, `normalize` (CLI output → `RunnerSignal` and events), `redact`, the treasury, kill-tree. (Amended 2026-11-07, P0-11: `redact` lives in `@elvaria/eventlog` (P0-05), because the hook may load nothing else; runner-core uses it. The hook's command comes from `hookCommand()` of `@elvaria/hooks`, which `apps/cli` hands to the runners, since adapters may not import `hooks` (P1-08).)
- Adapters (`runner-claude`, `runner-antigravity`, `runner-gemini`) only translate `SpawnRequest` into argv/env/settings and CLI output into signals. Each stays under 300 lines. (Amended 2026-11-07, P1-09: each file of an adapter stays under 300 lines, and what does not depend on the CLI lives in `runner-core`; the Claude adapter's argv, settings, stream, `/usage` probe and binary search are ~1 460 lines over 16 files.)
- CLIs are pinned: `elvaria doctor` writes the absolute path and version into `kingdom.tribes[].tool`; a different version at spawn time raises a warning. Adapter fixtures are kept per CLI version. (P0-08: `doctor` only warns on a changed version or path until `--pin`; a pinned file that is gone is an error.)
- Observation is Elvaria hooks plus `stream-json` only. Transcripts (`~/.claude/projects/…`, Antigravity and Gemini session files) have undocumented formats and are never parsed.
- Tests use fake CLIs (`fake-claude.mjs`, `fake-agy.mjs`, `fake-gemini.mjs`) replaying redacted real streams; `ELVARIA_LIVE=1` adds a real `probe()` smoke test.

## Consequences

- A CLI update is a fixture refresh plus a small adapter diff.
- The Steward depends only on the interface; `FakeRunner` drives every integration test.
- `apps/cli` loads each tribe's adapter from `kingdom.tribes[].adapter` (ADR 0018, ADR 0021).
