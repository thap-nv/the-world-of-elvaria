# ADR 0036 · Operational disruptions are a second source of learning, read from the event log

- Status: proposed · 2026-11-25
- Related: [plans/learning-loop.md](../plans/learning-loop.md); [ADR 0027](0027-measured-learning.md), [ADR 0016](0016-registry-data-not-code.md), [ADR 0017](0017-one-quest-one-context-three-tiers.md), [ADR 0003](0003-zod-schema-source-generated-json-schema.md), [ADR 0026](0026-guarded-self-change.md), [ADR 0034](0034-one-heal-per-run.md)

## Context

ADR 0027 grounds every lesson in a verdict, so the Monk only sees work that was judged wrong. The kingdom's own machinery fails in other ways: a merge queue that stands still, a setup that did not run, a session redone because a command timed out under load. Those reached the kingdom only through the coordinator's hand-kept lesson files. Scored against the event log of 19 days, 7 of 30 such incidents could be recognised with their cause, 17 showed a symptom whose cause sat in free text, and 6 left no trace.

## Decision

- A disruption is a derived reading: `disruptionsOf(events, kinds, window)` is a pure function in the domain, and each disruption names the ids of the events that prove it. Nothing is stored.
- Disruption kinds are registry data (`disruptions.json`) in one of two shapes, `event` and `sequence`, with conditions on coded fields only (`in`, `gte`, `exists`). The core never switches on a kind and never matches free text. The file is a protected path.
- Where the log cannot tell, the log is extended, not the rules: new event types (`wait.started`, `wait.ended`, `steward.started`, `steward.stopped`, `plot.setup`, `disruption.reported`) and optional fields on existing ones (a `cause` code from the territory's `failure_marks`, `timed_out`, `fields` on `quest.edited`, the quest on command lines). All are additive, so `v` stays 2.
- The Monk gains a second run, weekly and off by default, whose evidence is disruption groups. It writes letters only; each letter names evidence events from its pack, and the Steward refuses one that names none. A scripture or gazetteer line proposed this way is added when the letter is accepted, with the events as its `origin`. The rule that a Monk's own line needs a source verdict is unchanged.
- A letter is measured by the rate of its disruption kind before and after it was handled. The owner's hand-made reports (`disruption.reported`) that no kind matched count as misses of the detection.

## Alternatives

- Let the Monk read logs or transcripts: free text, secrets, and no stable evidence to cite.
- Hard-code the kinds as functions: each new kind would need a release, and the Monk could not propose one.
- Let the operations run add scripture lines directly: such a line has no fail kind, so `helped` and `missed` cannot be counted for it.

## Consequences

- Detection costs no mana and runs wherever the metrics ledger is read; only the weekly run spends a short Monk session.
- An older pinned build cannot read lines with the new optional fields (strict schemas): a rollback across these tasks needs the usual note.
- The scored lesson files become a fixture, so coverage of the detection is a spec result that later tasks must raise.
- When the plan's last task lands, ADR 0027 receives its `(Amended …)` notes: metrics name a second source, and a line may carry evidence events as its origin.
