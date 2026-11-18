# ADR 0030 · A character's session cut by a ceiling with progress goes on in a fresh session

- Status: accepted · 2026-11-15
- Related: [implementation-plan §3.4](../implementation-plan/3.4-breakers.md); rule (F) of [docs/plans/phase-2-plan.md](../plans/phase-2-plan.md); [ADR 0009](0009-mana-model.md), [ADR 0017](0017-one-quest-one-context-three-tiers.md)

## Context

§3.4 sent every breaker trip of a working session straight to the infirmary. A long job that a ceiling (time, tokens, turns) cuts after it committed real work still stopped and waited for the owner, though a fresh session reading `handover.md` and git would finish it (principle 13, ADR 0017). The owner's rule (F): a cut that made progress goes on; only a quest that makes none is stopped.

## Decision

- Only the trips `time`, `tokens`, `turns` (`CAP_TRIPS`) of a character's session (`tier = session`, with an `assignee`) read the rule. `commit`, `secrets`, `forbidden_paths` and `no_session` ignore `progress` and go to the infirmary as before; a script's `time` does too.
- The `breaker` event carries `progress` (a new commit, or a WIP commit with changes). The attempt entry keeps it as an optional `progress`, added after v1 (`version` stays 1).
- `cutCallOf(attempt_log, progress)` decides. A cut with progress always goes on, however many went on before: no ceiling on continuations. A cut without it goes on too, unless the session right before it in the same run was also cut without progress: then `working.breaker.cut_stops`, reason `breaker:no_progress`. A cut with progress clears the chain.
- Going on reuses a path that exists: `working.breaker.cut_goes_on` leads to `returned`, and the `redispatch` that follows opens a fresh session of the same run `n` (as after an answer or mana), the same assignee, `attempts` unchanged; its prompt continuation is `revive`. No new status or event.
- The judge is unchanged: a verifier's cut still takes `review.breaker`.
- A breaker event without `progress` keeps today's way, so a Steward that does not report it yet changes nothing.

## Consequences

- The chain is counted in the entries of one run `n`: `retry` and `reassign` open run n + 1, so a cut after them starts again; `attempts = 0` alone says nothing.
- The Steward measures progress, opens the revival and writes the reason in a later quest.
- Mana still bounds the loop: every revival spends it.
