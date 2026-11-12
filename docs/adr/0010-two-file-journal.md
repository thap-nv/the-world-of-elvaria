# ADR 0010 · Journal is two files: machine journal from hooks, handover letter from the agent

- Status: accepted · 2026-11-06
- Related: [implementation-plan.md](../implementation-plan.md) §2.4, §3.6, §9.1 item 4

## Context

The product plan (§3, §4) has the agent write `journal.md` at milestones. Agents forget to write or write it wrong. Revival and verification need two different things: what actually happened, and what the agent meant to do next.

## Decision

- `quests/<id>/journal.jsonl` is the machine journal. The Elvaria hook appends every event of the quest (the same redacted line it writes to `events/<day>.jsonl`). It is the source of truth for what was done and costs the agent nothing. (P1-08: lines only the CLI's stream knows, `agent.session.end` and `agent.subagent.*`, are the runner's to write, not the hook's.)
- `quests/<id>/handover.md` is the handover letter, written by the agent from a fixed template: *Where I am / Done / Not done / Decisions taken / Next step*. It is the source of truth for intent. It is written in `kingdom.owner.locale` (default Vietnamese) with identifiers, commands, paths and error text verbatim. (Amended 2026-11-07, owner, before P1-01: the template adds *Tried and failed*, so a fresh session does not repeat a dead end, and *Question*: a character asks the owner by writing it there and ending the session; the runner reads it as `RunResult.question`; implementation-plan §2.4, ADR 0017.)
- The prompt asks for an update before submitting and before compaction. The Stop hook blocks finishing in the assignee role while `handover.md` is unchanged since the attempt started, at most 2 times; then it lets the session end and logs `agent.notification` so the verifier knows. (P1-08: at most twice per session; the baseline is a fingerprint taken at the attempt's first `SessionStart`; a block is a JSON `decision: "block"` on stdout, and every block and the let-through log `agent.notification`.) (Amended 2026-11-09, P1-33, as the owner decided: a tribe without a tool gate has no Stop hook, ADR 0021; the Steward notes the letter when the attempt starts and, after a session that ends with it unchanged, opens a reminder session at most twice, resumed when the tribe can; then the session's end stands and the Steward logs `handover_unchanged`.) (Amended 2026-11-12, P1-55: when the territory's commit hook refuses the work of a session that was cut (or finished), the Steward copies what was staged to `.runs/<quest>-<n>/wip.patch` and, if the quest has no `handover.md` with text in it, writes a minimal one from the template's headings: the files, the hook's last words, the patch's path; in English, Question empty. A letter the character wrote is never overwritten.)
- Verifiers read the diff and `handover.md`, never transcripts. Revival reads both files.
- The quest schema has no `journal` path field: the path is the convention `quests/<id>/`.

## Consequences

- Revival does not depend on chat memory (principles 3 and 13).
- Handover quality becomes something a verifier can fail.
