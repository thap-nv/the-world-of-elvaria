# ADR 0023 · The Steward delivers: push the quest branch, open a pull request, merge when checks are green

- Status: accepted · 2026-11-10
- Related: [implementation-plan.md](../implementation-plan.md) §3.16.7, §9.1 items 11 and 34; [product plan 0.8](../ke-hoach-dung-elvaria-0.8.md) §7, §14; [ADR 0005](0005-single-writer-steward-inbox.md), [ADR 0013](0013-treasury-and-redaction.md)
- Amends: [ADR 0012](0012-worktree-for-every-git-quest.md) (its "no automatic merge and no `git push`" was a stage-1 rule)

## Context

In stage 1 the owner merged by hand after the royal seal. In practice the owner handed that chore to a control session: push each sealed branch, open a pull request with the delivery letter as its body, wait for CI, merge ([phase-1 report](../guides/phase-1-report.md) §3). It is the largest recurring owner chore that needs no judgement. On 2026-11-10 the owner decided that Elvaria pushes quest branches, opens pull requests with the owner's git credential and merges.

## Decision

- Delivery is the Steward's work, never a character's. Every character session keeps `git push` denied (the fence of ADR 0007 does not change), and so does a judge's scratch plot (ADR 0022).
- `territory.delivery.mode` is `manual` (the default, stage-1 behaviour), `pr` (push and open the pull request) or `pr_merge`. The owner turns it on per territory.
- Order: verdict pass → royal seal when the quest needs one (`seal_default` of its kind, a claim above the character's level, `protected_paths`, the kingdom's `delegation`) → the territory's merge queue → update the quest branch by merging the base branch, never by rebasing → resolve `shared_paths` by their declared rule → rerun the checks → push `quest/<id>` → open the pull request → wait for `required_checks` → merge with the territory's `merge_method` (default: a merge commit) → `delivery.merged`.
- The Steward pushes only `quest/<id>` branches: no force push, no push to the base branch.
- The forge is a port (`Forge`: open, status, merge) with GitHub REST as its first implementation. The token comes from `git credential fill` each time it is needed, lives only in the Steward process, passes `redact`, and never reaches a prompt, a journal, an event or a character's env.
- Failures do not loop. A conflict the declared rules cannot resolve opens a merge quest for a knight, judged like any quest; red CI returns the quest with the log; a forge error or a CI timeout emits `delivery.failed` and goes to the owner's digest.
- (Amended 2026-11-13, owner's decision, PS-08) After `delivery.merged` the Steward deletes the remote `quest/<id>` branch it pushed, and no other. Before a push it scans the branch's diff with the redaction patterns (ADR 0013) and does not push on a hit.
- (Amended 2026-11-13, owner's decision, PS-08b) The owner may delegate the seal. A quest inside the seal part of `kingdom.delegation` (rank, kind, a territory in `pr_merge`) is created without `seal_required`, and the machine only ever raises it again: protected paths, a claim above the level, files outside the scope, a diff above the cap, a judge of a doer's family, an objection. No class seals or merges, and the `seal` command stays the owner's. One escaped defect of such a quest suspends the delegation for its territory until the owner re-arms it.

## Alternatives

- Push and open the pull request only, the owner merges (the session's recommendation): it keeps the owner in every delivery. It stays available as mode `pr`.
- Let the character push: it breaks the fence and puts a credential within a model's reach.

## Consequences

- The Steward gains network access to one host per forge; tests use a fake forge and a real git repository.
- A wrong merge is a merge commit and can be reverted; a quest that touches protected paths always waits for the seal ([ADR 0026](0026-guarded-self-change.md)).
- Pushes and merges are made under the owner's account; the event log records which quest caused each.
