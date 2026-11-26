# ADR 0032 · Check modes of a territory: narrow per quest, the full run on the base branch, the suite deferred to a delivery train

- Status: proposed · 2026-11-23
- Amends (once accepted): [ADR 0008](0008-separation-of-duties.md) (which checks run before the judge), [ADR 0022](0022-tests-in-the-world.md) (`defer_to_merge`), [ADR 0023](0023-steward-delivers-push-pr-merge.md) (the branches the Steward pushes)
- Related: [plans/check-modes.md](../plans/check-modes.md); [ADR 0033](0033-late-machine-verdict.md); owner's decisions (425), (431) in implementation-plan §11 (2026-11-22, 2026-11-23)

## Context

On 2026-11-22 a full check run of one quest on the Elvaria territory took 9 to 17 minutes, about as long as the session that did the work, and 1 run in 15 was red. All machine work of the kingdom shares `dispatch.max_background`, so the checks, not the tribes' session caps, bound how many characters work at once. Selecting checks by `when` globs narrows nothing in a monorepo: nearly every quest touches `packages/**` and runs the whole test suite. The delivery queue then reruns every check for each quest. The part of the tree a quest does not touch is identical to its base, which a patrol can vouch for once for all quests.

## Decision

- A territory declares `check_policy.mode`: `full` (the default, today's behaviour), `narrow` or `deferred`. Modes are territory data; the core never names a package manager.
- A check may carry a `narrow` command. In `narrow` and `deferred` the run after a session, and in `narrow` the queue's rerun after merging the base branch, take the checks whose `when` meets the touched paths and run `narrow` where declared, `run` otherwise. The Steward passes the diff base as `ELVARIA_CHECK_BASE` in the command's explicit env.
- A quest that touches a path of `check_policy.full_when`, or a path no check covers, is checked as in `full`, in every mode. So is a quest whose ritual has a scratch plot, and every merge quest.
- The full run belongs to the base branch. In `narrow` and `deferred` the patrol also runs whenever the head of the base branch moves (trigger `merged`), coalesced to the latest head, one heavy job at a time in the kingdom. The queue does not wait for it. This reverses K16 of the merge queue plan.
- A red full run is attributed by the Steward at no mana cost, running only the red checks: a binary search over the first-parent steps since the last green head, then the red checks on the quest's own head as judged. The outcome (`own_change`, `combination`, `outside`, `flaky`, `unknown`) is the event `check.attributed`. `own_change` is a late machine verdict (ADR 0033); `combination` is a merge quest or a fix quest and counts against nobody.
- In `deferred`, checks marked `defer_to_merge` do not run per quest. Sealed quests board a train: the Steward merges each into a scratch plot cut from the green base branch, one merge commit per quest, runs every check once, and on green pushes `train/<territory>/<id>`, opens one pull request and merges it. A red train is attributed over its merge commits; the quests before the first red step leave as a new train. The train departs on a count, on a wait, when a quest in the open waits for a boarded quest's scope, or when the territory is idle.
- A branch that is no quest's (a person's task branch) enters the same lane as a guest by the owner's `enqueue_branch` command: dry merge, the mode's check on the merged tree, then the merge of its pull request. The Steward never writes to that branch.
- Proposed amendments. ADR 0008: "(Amended, CM-01/CM-08: the checks that run before the judge are those of the territory's check mode; in `deferred` the checks marked `defer_to_merge` run after the verdict, on the train, and a red one is a late machine verdict; the judge's settings allow only the commands of the run it reads.)" ADR 0022: "(Amended, CM-08: `defer_to_merge` waits for the merging step, a party's merge quest or, in a `deferred` territory, the delivery train.)" ADR 0023: "(Amended, CM-08: the Steward also pushes the `train/<territory>/<id>` branches it builds, and deletes them after the merge; a train needs `merge_method: merge`. CM-07: it merges a guest's pull request it did not open, on the owner's command.)"
- (Amended 2026-11-26, RC-04/RC-05, [ADR 0035](0035-checks-once-per-tree.md): a check green on the same tree with the same command is carried, in the queue, a guest's try, a train and every patrol but the owner's; the queue runs red checks once more before it blames.)

## Alternatives

- Batch quests before the verdict: rejected by the owner (425)(a); a verdict must name one quest.
- Keep the full run per quest and raise `max_background`: two full runs at once already take the whole CPU.
- One pull request per quest for a train, chained: no new branch kind, but N forge round trips and quest branches rewritten when a quest leaves.

## Consequences

- A defect outside the narrow run reaches the base branch before it is seen; PS-09d already stops new work while the base is red, and the metrics count such escapes per merge so the owner can go back to `full`.
- Schema additions are optional fields and new enum values: `version` 1 and event `v` 2 stay, no migration.
- `deferred` is turned on only after `narrow` has been measured on the base branch (owner's order in (431)).
