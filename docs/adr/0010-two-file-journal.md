# ADR 0010 · Journal is two files: machine journal from hooks, handover letter from the agent

- Status: accepted · 2026-11-06
- Related: [implementation-plan.md](../implementation-plan.md) §2.4, §3.6, §9.1 item 4

## Context

The product plan (§3, §4) has the agent write `journal.md` at milestones. Agents forget to write or write it wrong. Revival and verification need two different things: what actually happened, and what the agent meant to do next.

## Decision

- `quests/<id>/journal.jsonl` is the machine journal. The Elvaria hook appends every event of the quest (the same redacted line it writes to `events/<day>.jsonl`). It is the source of truth for what was done and costs the agent nothing.
- `quests/<id>/handover.md` is the handover letter, written by the agent from a fixed template: *Where I am / Done / Not done / Decisions taken / Next step*. It is the source of truth for intent. It is written in `kingdom.owner.locale` (default Vietnamese) with identifiers, commands, paths and error text verbatim.
- The prompt asks for an update before submitting and before compaction. The Stop hook blocks finishing in the assignee role while `handover.md` is unchanged since the attempt started, at most 2 times; then it lets the session end and logs `agent.notification` so the verifier knows.
- Verifiers read the diff and `handover.md`, never transcripts. Revival reads both files.
- The quest schema has no `journal` path field: the path is the convention `quests/<id>/`.

## Consequences

- Revival does not depend on chat memory (principles 3 and 13).
- Handover quality becomes something a verifier can fail.
