# ADR 0028 · Plans pass a readiness review; quests declare scope paths and overlapping scopes never run at once

- Status: accepted · 2026-11-10
- Related: [implementation-plan.md](../implementation-plan.md) §3.16.5, §3.16.6, §9.1 items 10, 31 and 35; [product plan 0.8](../ke-hoach-dung-elvaria-0.8.md) §14; [ADR 0012](0012-worktree-for-every-git-quest.md), [ADR 0020](0020-class-skill-scripture-tags-and-parties.md)

## Context

Stage 1 was planned as task rows with a predicted file list. The lists were wrong for most tasks, 29 of 56 tasks were added after the first milestone run, and parallel branches met on a handful of hot files. What a plan can fix beforehand is the contract, the boundaries and a runnable definition of done; what it cannot know has to be found by running. `max_concurrent = 1` per code territory avoided collisions by forbidding parallel work.

## Decision

- Larger work (several tags in several areas, or rank B and above; the threshold is kingdom data) goes through a council before it is split: a brief from the Chancellor with assumptions and all questions to the owner asked once, each with a recommended answer; a survey by a scout, with time-boxed probe quests for what only a real run can tell; a contract by the mage with the shared decisions, each part's `scope_paths` and a definition of done written as checks. (Amended 2026-11-11, decided by the owner: the survey is part of the mage's plan quest, which saves two sessions per piece of work; only what a real run alone can tell becomes a separate probe quest.)
- The plan is then reviewed before any part starts. A script (`plan-lint`) checks what a machine can: every part has a rank, a class, a mana estimate and `scope_paths`, and parallel parts do not overlap. A judge of another model family checks the rest through added steps of `council_review`: one quest fits one context, done is machine-checkable, hot files have a merge rule, unknowns have probes, no recorded decision is contradicted. (Amended 2026-11-11, phase 1.5 plan: the machine part extends the Steward's own `subquests` deliverable check instead of a catalog script, which is copied into the kingdom and cannot import the domain. As with every check today, a red one does not stop the judge's session; the pass rule fails the verdict afterwards.)
- The owner seals the plan once, on a one-page summary. After that the world runs within the kingdom's `delegation`.
- No new quest kind: the brief is a `quest-draft`, survey and probes are `research` quests, the contract is a `plan` quest.
- `quest.scope_paths` is optional. Within a territory the Steward never runs two quests whose scopes meet; a quest without a scope counts as the whole territory. Files changed outside the scope are a signal for the judge and a number in the metrics, not an automatic fail. (Amended 2026-11-11, phase 1.5 plan: a scoped quest holds its scope from its first run until it is archived or cancelled, so a quest that waits for the owner's merge still holds it; a quest whose plot is built on the holder's branch is exempt. A session-tier quest without a scope runs alone among working quests and holds nothing once it stops; script-tier quests are outside both rules. The out-of-scope files go into the judge's prompt and the `quest.submitted` line, since a check can only pass or fail.)
- `territory.shared_paths` lists hot files with a merge rule (`regenerate` by the territory's generate command, or `union`); they do not count as an overlap.
- Work found on the way is a `proposal` letter ([ADR 0024](0024-typed-letters-through-the-steward.md)), not an edit outside the scope.

## Alternatives

- More detailed task rows: the detail that failed was detail a plan cannot have.
- Lock by the files a session actually touches: known only after the collision.

## Consequences

- Planning costs sessions before work starts; small quests skip the council, and the metrics show what a council costs.
- A code territory can raise `max_concurrent` once its quests declare scopes.
