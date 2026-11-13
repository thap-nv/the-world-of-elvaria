# ADR 0005 · Single writer: only the Steward mutates quest state; UI and CLI write commands to inbox/

- Status: accepted · 2026-11-06
- Related: [implementation-plan.md](../implementation-plan.md) §1.3, §3.1, §9.1 item 1; [inbox-command.schema.json](../schemas/inbox-command.schema.json)

## Context

The product plan's architecture diagram (§3) lets the Herald write `quests/` (SG → QB), and §8 has the Herald write user actions into `quests/`. With the Steward writing the same files, two processes would rewrite one JSON file: a race that is hard to debug on Windows (rename over an open file, antivirus and indexer locks).

## Decision

- Only the Steward changes quest state and writes `quests/*.json` and `characters/*.json` (on disk `quests/<id>.json`, `characters/<id>/character.json`).
- Every user action from the CLI, the herald (desktop world) or the lite client (phone) is a command file `inbox/<ulid>.json`. (Amended 2026-11-07, P0-11, recording what the owner confirmed after P0-08: `elvaria init` and `doctor` write `kingdom.json` and `territory add` writes the territory file directly; the `attach_territory` command stays for the herald and the phone. Every quest change goes through the inbox.) (Amended 2026-11-09, P1-19, as implementation-plan §3.14 decided: `elvaria tribe add|check|disable` write `kingdom.tribes[]` too, under the kingdom file's lock.)
- At the start of each tick the Steward applies commands in id order through `transition`, appends `command.applied` or `command.rejected`, and moves the file to `inbox/done/`. A command id that is already applied is skipped (idempotent).
- Chancellor drafts arrive the same way: a `create_quest` command with `draft: true`; confirming a draft is a command too (`confirm`). (Amended 2026-11-13, PS-03b: the Chancellor's triage of memos writes its commands the same way, with `source: chancellor`; within the kingdom's `delegation` they are applied without the owner, and the Steward tells them as the Chancellor's.)
- A hand edit of `quests/<id>.json` while the Steward runs is detected through `updated_at`, rejected with a warning, never overwritten; `elvaria quest edit` writes a command instead.
- A new character is the one exception: no command creates one (`summon` opens a running session's terminal), so `elvaria character add` creates `characters/<id>/character.json` itself, create only, never over an existing file. Every later change to a character is the Steward's. (Amended 2026-11-06, P0-08, confirmed by the owner; implementation-plan §2.3, §11.)
- Permissions do not change: remote actions still only write files, and nothing runs directly from outside.

## Consequences

- Every user decision is one file and one event: easy to audit and to show in the chronicle.
- A user action takes effect within one tick (default 5 s), not instantly.
- The herald depends on neither the Steward nor any runner (ADR 0001).
