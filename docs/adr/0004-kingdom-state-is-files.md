# ADR 0004 · Kingdom state is files: JSON per entity, JSONL event log, no database until measured

- Status: accepted · 2026-11-06
- Related: [implementation-plan.md](../implementation-plan.md) §2.2, §6; [ADR 0005](0005-single-writer-steward-inbox.md)

## Context

One user, one machine, local-first (principle 2). State must survive any agent dying (principle 3), stay readable and editable by the user, and behave the same on Windows and macOS. The product plan (§3) mentions "SQLite when queries are needed" without a condition.

## Decision

- The kingdom is a directory the user picks (`elvaria init --kingdom <dir>`), outside the Elvaria repo. Layout in implementation-plan.md §2.2.
- One JSON file per entity (`kingdom.json`, `quests/<id>.json`, `characters/<id>/character.json`, `verdicts/<quest>-<n>.json`, …), written atomically (temp file + rename) under `proper-lockfile`.
- Events: append-only JSONL, one file per local day (`events/YYYY-MM-DD.jsonl`), one `write()` per line; readers skip an unterminated last line.
- World state: a reducer over events plus a versioned snapshot in `.state/`.
- No SQLite or other database in stages 0–2.
- Revisit trigger (measured, not guessed): a benchmark committed in the repo, run on the user's real kingdom, shows a read path the CLI or herald needs (world-state rebuild, quest list with filters, chronicle input) above 1 s at p95, or 30 days of event log above 200 MB. Either result opens an ADR for an index or a database. Both numbers are starting values set on 2026-11-06, not measurements; adjust them in this ADR once phase-1 data exists.

## Alternatives

- SQLite from day one: real queries, but a native dependency on two OSes, a schema to migrate twice, and state the user cannot read with an editor.

## Consequences

- State is greppable, diffable and trivially backed up.
- Aggregations are code over files or the event log; no ad-hoc queries.
- Concurrency rests on a single writer (ADR 0005) plus file locks.
