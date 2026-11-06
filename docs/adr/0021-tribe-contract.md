# ADR 0021 · Tribe contract: a tribe is an adapter with declared capabilities, a theme entry and the owner's own account

- Status: accepted · 2026-11-06
- Amends: [ADR 0006](0006-runner-adapter-behind-agentrunner.md) (adapters may also be owner files), [ADR 0018](0018-gemini-tribe-on-antigravity-cli.md) (the Gemini runner is chosen by `tribes[].adapter`)
- Related: [implementation-plan.md](../implementation-plan.md) §3.7, §3.14, §9.1 items 24–28; [product plan 0.6](../ke-hoach-dung-elvaria-0.6.md) §8; [kingdom.schema.json](../schemas/kingdom.schema.json)

## Context

Product plan 0.6 loosens principle 6 to "one account of the owner per tribe" and asks that a new provider (Codex, a raw API later) be added by the owner with an adapter, a theme entry and their own login, without touching the core. Until now the schemas hard-coded two tribes (`provider: claude | gemini`, `kingdom.tools.{claude,gemini}`, `mana.tribes.{claude,gemini}`).

## Decision

- `kingdom.tribes[]` replaces `tools` and `mana.tribes`: `{id, adapter, enabled, max_concurrent, tool?, pools?, budget?}`. `tribe` is an open id everywhere (`character.tribe`, `class.default_tribe`, `wake`, `mana.level`); `provider` is retired as an identifier.
- An adapter is either a package in this repo (`claude_code`, `antigravity`, `gemini_cli`, `codex_cli`) or an owner file `<kingdom>/adapters/<name>.mjs` exporting `createAdapter(kit)`. `kit` is injected by runner-core (prompt, tool policy, plot, normalisation, redaction, spawn and kill), so the file imports nothing. Only `apps/cli` loads adapters.
- Every adapter declares `capabilities`: `headless` and `context_file` (required; context falls back to the prompt), `events`, `tool_gate`, `usage`, `structured_output` (should have), `resume`/`compact`, `subagent` (optional). The pure function `tribeLimitsOf(caps)` narrows a tribe that lacks one, as the product plan's table says: no `tool_gate` ⇒ ranks F–D only and no `read_before_write` zones; no `usage` ⇒ time-based mana and time breakers only; no `events` ⇒ working/done only and no apprentices.
- Every adapter must pass the conformance suite in runner-core (`elvaria tribe check`) before it can be enabled.
- A character's tribe is fixed for life, like its class: reputation and scripture belong to that tribe's models. Adding a tribe means summoning new characters; existing characters, quests and data do not change.
- Codex: a full-tier candidate (`codex exec --json`, AGENTS.md, lifecycle hooks trusted by hash, `--output-schema`, `exec resume`). Its adapter is optional task P1-12d and starts with a spike; generated hook files must be byte-stable so the owner trusts them once.

## Consequences

- Separation of duties gains pairs as tribes are added (Codex is model family `gpt`), and one sleeping tribe stalls less work.
- A tribe without a theme entry shows a neutral crest until the theme has one.
- An owner adapter file runs with the owner's rights; it still goes through the core's tool policy, minimal env and redaction.
