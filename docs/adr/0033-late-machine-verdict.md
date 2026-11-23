# ADR 0033 · A late machine verdict: a done quest may leave `done`, and the judge who passed it shares the fail

- Status: accepted · 2026-11-23 (CM-05: the verdict, the rows, reputation and metrics in the domain; the Steward's wiring is CM-06)
- Amends: [ADR 0008](0008-separation-of-duties.md) (machine checks as the primary judge; the judge's reputation), [ADR 0023](0023-steward-delivers-push-pr-merge.md) ("red CI returns the quest with the log")
- Related: [plans/check-modes.md](../plans/check-modes.md); [ADR 0032](0032-check-modes-of-a-territory.md); implementation-plan §2.5, PS-08f; owner's decisions (425)(d), (431) and C1, C2 in §11 (2026-11-23)

## Context

ADR 0008 makes the machine checks the primary judge by running them before the judge. With narrow and deferred check modes (ADR 0032) some checks first run after the verdict: in the delivery queue, on a train, or in the patrol of the base branch. A red check found there is still a judgement of one quest's work, and principle 14 asks that it be measured. Today nothing leaves `done` but `deliver` and `archive`, and a judge's reputation never changes, whatever becomes of the work it passed. PS-08f (not built) had planned two `done` + `return` rows for red forge checks, with no verdict and no attempt cap.

## Decision

- When the Steward attributes a red check to a quest's own change (`check.attributed`, cause `own_change`), it writes a machine verdict (`lateVerdictOf`): `verifier_id: "machine"`, `result: fail`, `late: true`, the red checks with their first error line, file `<quest>-<n>-late.json` beside the pass it overturns. `late` is valid on no other verdict, and only that file takes it.
- A quest still `done` and not yet on the base branch takes one of three new rows, actor Steward, mirroring the rows of `review`: `done` + `verdict_fail` goes to `returned` (`can_retry`), to `open` (`machine_retry`, the machine's merge) or to `infirmary` (`session_out_of_retries`: `out_of_retries` without the script tier). The effect drops the verifier, the seal (a sealed quest is done or archived) and `deliverable.delivered_at`; the branch and the plot stay, and the next session reads the red checks and the log tail. A pass after that goes through the seal again when the quest needs one. A script-tier quest matches no row.
- A quest already on the base branch stays `archived`; no row leaves `archived`. The Steward writes the late verdict and opens a fix quest: child of the quest, `created_by: patrol`, assigned to the same character when it can take it, judged like any quest, exempt from the red-base hold of PS-09d. Its id is derived from the quest and the first red commit.
- Reputation: the assignee takes the verdict as any fail (`withVerdict`, weight 1, fail streak). The judge whose pass it overturns takes one `fail` entry of weight 1 in its reputation window and the quest's tag windows (`withOverturnedPass`, `overturnedJudgeOf`), with no fail streak and no level change on it; the same late verdict twice is one entry. The machine and the owner take none. A red check that is a `combination`, `flaky`, `outside` or `unknown` counts against nobody.
- The metrics count a late verdict as an escaped defect of that review. On a quest merged without the seal it is an escape signal for the delegation breaker (PS-08g).
- PS-08f reuses the three rows for red forge checks instead of its two `return` rows.
- ADR 0008 and ADR 0023 carry the amendments (2026-11-23, CM-05).

## Alternatives

- Two `done` + `return` rows (PS-08f as planned): no verdict file, so reputation needs a second path and the late fail never reaches `max_attempts` or the infirmary.
- Revert the merge and reopen the archived quest: the Steward would author commits on the base branch, and a row out of `archived` reopens every invariant that reads it as final.
- Count the fail against the assignee alone: the owner asked that the judge who passed it share it (425)(d).

## Consequences

- `done` is no longer final before the merge. Reviewed in CM-05, none needed a change: a dependent not yet started waits again (`questFinished`), one that already branched from the quest keeps its work and takes the fix by merge; scope stays held (`returned` holds as `done` did); the delivery items of the attention list and the digest show done quests only; a memo closed while the quest was done stays closed.
- A judge's reputation becomes data for the first time; where it is read (level, the strong judge of rank B) is checked before it is written.
- Verdict schema gains an optional field and the transition table three rows: `version` stays 1, the §2.5 table is regenerated.
