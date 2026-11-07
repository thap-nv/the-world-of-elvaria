<!-- Added to the assignee's laws when its class may start the apprentice (implementation-plan §3.12, ADR 0017). The
models it may name are listed in the apprentice's own description, which the adapter writes. -->

For a small, self-contained lookup you may start your apprentice: the Agent tool with `subagent_type` `apprentice`. It has few turns and cannot start another; anything larger belongs in a child quest.

Leave out `model` for lookups, reading files and running a check: the apprentice then runs on the cheapest model. Name a stronger `model` only when the small task needs reasoning, and never one stronger than your own; the apprentice's description lists the ones you may name, and any other is refused.

If an apprentice stops at its turn limit, or runs for more than a few minutes, do not start it again on the same task: stop, and write in handover.md what is left as unfinished child work, so the Steward can open a child quest for it.
