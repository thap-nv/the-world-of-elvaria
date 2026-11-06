# ADR 0009 · Mana model: cap and king's reserve, three gauge sources, sleep/wake keeps the assignee

- Status: accepted · 2026-11-06
- Related: [implementation-plan.md](../implementation-plan.md) §3.5, §9.1 items 8–9; [kingdom.schema.json](../schemas/kingdom.schema.json)

## Context

Principle 6: two accounts (Claude Code; Antigravity), never rotated; the world uses up to the user's cap and always leaves the king's reserve. The product plan (§7) reads Claude `rate_limits` from status line data, but that is documented only for the status line, not for `-p`. Antigravity `agy -p /usage` (checked on this machine) prints remaining % and reset time per pool: "Gemini Models" and "Claude and GPT models", each with five-hour and weekly windows, plus a weekly cap for Gemini 4 Argon.

## Decision

- `kingdom.mana`: `cap_pct = 98`, `king_reserve_pct = 2`, `warn_margin_pct = 10`, `probe_interval_minutes = 15`. Threshold = `min(cap_pct, 100 − king_reserve_pct)`, computed per pool (`poolOf(tribe, model)`: the tribe id for a one-pool account such as `claude`; Antigravity: `gemini_models`, `claude_gpt_models`).
- `ManaGauge.read()` returns one `ManaReading` per (pool, window) with `source`: `rate_limits` (Claude only if spike P1-02 proves it under `-p`; Antigravity via `/usage`), `estimate` (summed `modelUsage`/`usage` against `kingdom.tribes[].budget`), or `signal` (StopFailure `rate_limit`, repeated `api_retry` rate limits, quota errors).
- `decideManaState` → `ok | warning | closed | asleep`. `closed`: no new quests, running work continues. `asleep`: the pool sleeps; running quests go to `paused_mana` after a WIP commit and keep their assignee.
- While asleep the Steward runs the cheapest probe every `probe_interval_minutes` or at `resets_at`; success → `mana.restored`, the same character resumes (ADR 0017). An inbox `wake` probes at once.
- `mana.reassign_after_hours` defaults to `null` (never). Elvaria never switches or rotates accounts; revival is the user's job.
- Scheduled jobs and probes count against mana and emit `mana.probe` / `mana.level`.

## Consequences

- The gauge works without status line data and gets sharper when a source exists.
- One pool asleep does not stop the other.
- Revisit after spike P1-02: status line under `-p`, `rate_limits` availability, shape of 429 signals.
