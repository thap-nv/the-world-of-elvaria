# ADR 0027 · Learning is measured: metrics from the event log, a fix ladder, line-level scripture edits with scope and counters

- Status: accepted · 2026-11-10
- Related: [implementation-plan.md](../implementation-plan.md) §3.16.1, §3.16.8, §9.1 item 32; [product plan 0.8](../ke-hoach-dung-elvaria-0.8.md) principle 14, §6, §14; [ADR 0017](0017-one-quest-one-context-three-tiers.md), [ADR 0020](0020-class-skill-scripture-tags-and-parties.md)

## Context

A model's weights are frozen at release; a session starts blank, and fine-tuning is out of reach for subscription CLIs and pointless on one kingdom's data. What can improve is everything around the model. In the stage-1 milestone run 12 of 19 rework sessions were fixed in permissions, checks and tools, none by a prompt line. A context that an LLM rewrites wholesale each round grows shorter and loses detail; lessons written as universal ("the shell is PowerShell") were true only where they were measured.

## Decision

- Metrics are a pure function of the event log, quests and verdicts: first-pass rate by class, tag, model and kind; owner interventions per quest; tokens and time per sealed quest; rework by cause; escaped defects; plan accuracy. Each run records which scripture lines and skills it loaded.
- A repeated failure is fixed at the highest rung that works: (1) make it impossible (permission, tool, territory command), (2) a machine check, (3) a script, (4) a skill or gazetteer entry, (5) a scripture line, (6) a stronger model. The Monk turns rungs 1–3 into `proposal` letters and rung 6 into a digest entry for the owner; only rungs 4–5 are text in a prompt.
- Scripture changes one line at a time: `add`, `retire`, `merge`. The Steward refuses an operation that replaces the file. Each line has a source verdict, a scope (tribe, OS, CLI version, territory, tags) and counters `helped` and `missed` computed from the load traces; out of scope, a line is not loaded.
- Scripture stays a Markdown file the owner can edit; line metadata lives beside it. A line without metadata is the owner's.
- Retrieval goes by tags first, then by keywords over the kingdom's own files; embeddings wait for a measured miss.

## Alternatives

- Fine-tuning or a local model: no access to weights, too little data, redone at every model release.
- Let the Monk rewrite the scripture: simpler, and the known way to lose what it held.

## Consequences

- A lesson that does not move its failure rate is retired on evidence, not on age alone.
- Most "lessons" end as a check or a script, which cost no tokens afterwards.
- The metrics code is a guard and sits in the protected paths ([ADR 0026](0026-guarded-self-change.md)).
