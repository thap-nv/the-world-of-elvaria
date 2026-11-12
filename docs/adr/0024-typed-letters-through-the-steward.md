# ADR 0024 · Characters exchange typed letters through the Steward; no direct conversation

- Status: accepted · 2026-11-10
- Related: [implementation-plan.md](../implementation-plan.md) §3.16.2, §9.1 item 30; [product plan 0.8](../ke-hoach-dung-elvaria-0.8.md) principle 15, §14; [ADR 0005](0005-single-writer-steward-inbox.md), [ADR 0010](0010-two-file-journal.md), [ADR 0016](0016-registry-data-not-code.md)

## Context

Parallel task sessions in stage 1 collided on shared files, and a coordinating session relayed "this merge touched your files" by hand. A character that found work outside its quest either fixed it in place or left a note nobody owned. Free conversation between agents is the usual answer and a poor one: a multi-agent system spends many times the tokens of a single session, and conflicts come from decisions each session makes silently on its own.

## Decision

- There is no character-to-character channel. A character writes letters in a `Letters` section of its handover letter; `runner-core` parses them; only the Steward files `letters/<id>.json` and routes them, so the single-writer rule holds. (Amended 2026-11-11, phase 1.5 plan: the entity's id is `memo`, because `letter` already names the handover letter throughout the code: section `Memos`, files `memos/<id>.json`, events `memo.*`, command `decide_memo`; display strings still say letter. The Steward reads the section itself when the doer's run settles, with a pure parser from `runner-core`; `RunResult` and the adapters do not change. An id made from the quest, the kind and the normalized text keeps a second reading from filing it twice.)
- Letter kinds are registry data, each with its route: `proposal` (work outside the quest) to the Chancellor; `advisory` (I changed something another area uses) to the open quests whose `scope_paths` meet the letter's refs, read at the start of their next session; `request` (I need something from another area) to the Chancellor, where it becomes a quest draft; `objection` (I contest a verdict) to a second judge other than the first, once per verdict. (Amended 2026-11-12, as the owner decided: a fifth kind, `amendment` (I contest the quest's description: it is wrong, or there is a better way), goes to the quest's author: the Chancellor for a quest drafted from the owner's words, the mage of the plan quest for a child quest, the owner for a quest the owner wrote. The quest waits as it does on a question. The author decides in a fresh session: accept and rewrite the description, reject, or pass it to the owner when it changes the owner's intent, each with a reason; the Steward applies the decision through inbox commands and the reason enters the doer's next prompt. One per run. `objection` moves forward to stage 1.5, and the second judge reads the first verdict and the letter.)
- Routing is a pure function in `domain` that reads the registry; the Steward has no `switch` on the letter kind.
- A question to the owner stays what it is: the Questions section of the handover and a `blocked` quest (ADR 0017).
- One letter, one matter. Letters are not answered. (Amended 2026-11-12: the author's decision on an `amendment` is that letter's outcome, recorded on its own quest; it is not a letter back.) A letter never changes another quest's state. Nobody writes into another quest's plot, and nobody messages a running session except the owner through summon.
- Decisions several quests share live in the party contract, the one document every part reads.

## Alternatives

- A shared chat or blackboard: cheap to build, costly to run, and it hides who decided what.
- Let the Steward infer effects from diffs alone: it still does (the `advisory` after a merge), but only the author knows an interface changed in meaning.

## Consequences

- Every exchange is a file and an event, so the chronicle and the metrics can count them.
- A letter delivered to a quest enters that quest's next prompt under a token cap and its machine journal.
- The owner sees letters only through the digest, when the kingdom's `delegation` says the matter is theirs.
