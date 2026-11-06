# ADR 0017 · One quest, one context: three execution tiers (script, apprentice, session); revival starts a fresh session from the handover letter

- Status: accepted · 2026-11-06
- Related: [implementation-plan.md](../implementation-plan.md) §3.5, §3.11, §3.12, §9.1 items 14–16

## Context

Principle 13 ([product plan 0.7](../ke-hoach-dung-elvaria-0.7.md)): every character is a new top-level session that loads only what it needs from the journal, scripture and gazetteer; long memory lives on disk; the Chancellor splits work so one quest fits one context; what a machine can do does not call a model. The product plan (§7, "Script, sub-agent hay phiên mới") defines three tiers.

## Decision

- **Script** (`quest.tier = script`): only from `registry/scripts.json`. The Steward runs `node registry/scripts/<id>.mjs` in the plot; no model, no secret, mana 0; verdict by `machine`. A script error goes to `infirmary`.
- **Apprentice** (sub-agent inside a session): Claude gets `--agents <run_dir>/agents.json` defining exactly one `apprentice` (`maxTurns = breakers.subagent_max_turns`, default 30; tools a subset of the class; cheap model; no `Agent` tool). `permissions.deny` holds `Agent(*)` except `Agent(apprentice)`, and the `SubagentStart` hook blocks any other `agent_type`.
- `subagent_max_minutes` (default 5) is measured from SubagentStart/Stop; overrun → `agent.subagent.overrun`, charged to the parent's breakers. It is not a kill switch: a sub-agent cannot be killed from outside.
- Antigravity sub-agents are denied until spike P1-12a shows how to bound them.
- **Session**: a new top-level session per quest or child quest, spawned by the Steward.
- Invariants: a verifier is never a sub-agent of the doer; sub-agents do not spawn sub-agents; over-threshold work stops and becomes a child quest.
- Revival after mana or a crash is a **fresh session** whose prompt is the quest + `handover.md` + the last 20 lines of `journal.jsonl` + the branch's `git log` and diff. `--resume <session_id>` only when `dispatch.resume_after_mana = true` (default false; `--settings` is passed again).
- The Chancellor sets `tier`, batches tiny tasks into one quest (often `batch` with `units[]`), and splits work whose `estimate.tokens` exceeds `breakers.context_budget_tokens` (default 120 000) into a parent `plan` quest and children.

## Consequences

- `docs/tier-report.md`, generated from the event log, shows tokens per quest and per tier for tuning `kingdom.json`.
- Revisit after spike P1-02: does `-p` honour `tools` and `maxTurns` of an agent defined through `--agents`.
