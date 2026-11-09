# ADR 0020 · Class, skill and scripture are separate; expertise is reputation per tag; work that needs several areas is a party

- Status: accepted · 2026-11-06
- Amends: [ADR 0008](0008-separation-of-duties.md) (party members never judge the party), [ADR 0016](0016-registry-data-not-code.md) (adds `registry/tags.json`)
- Related: [implementation-plan.md](../implementation-plan.md) §2.3, §3.13, §9.1 items 20–23; [product plan 0.7](../ke-hoach-dung-elvaria-0.7.md) §4, §6

## Context

The product plan separates what a character does (class), what it knows about a domain (skill), and what it learned from its own verdicts (scripture). It asks for expertise without sub-classes, and for one rule when a job spans backend and frontend while "one quest, one character, one context" (ADR 0017) still holds.

## Decision

- **Class** is fixed for life and decides tools, default model and default tribe, and kinds. A quest names one `class_required`.
- **Expertise is reputation per tag.** Quests carry `tags` from a closed vocabulary (`registry/tags.json`, 7 defaults: frontend, backend, db, infra, i18n, e2e, docs). Each pass/fail verdict also enters `character.skill_affinity[tag].window` (≤ 20, royal seal ×3). The Steward filters by class, then ranks by `affinityOf` on the quest's tags. Counts and the title (`titleOf`) are derived; the owner can only set `pinned_tag` (command `pin_tag`).
- **Skills** live in `temple/skills/<id>/SKILL.md`, attached to no one. `selectSkills` loads at most 3 per quest whose tags match and whose scope is `global` or the quest's territory. The Monk writes one only from a lesson repeated across ≥ 2 characters that is a technique, not a habit; the owner may write them too. Stage 1 has none: a territory's CLAUDE.md is its skill. How each CLI receives a skill is settled by a spike in stage 5.
- **Party**: a plan quest with `party_role: contract`; its lead (a mage) writes the contract (OpenAPI for dc1-se-team) on the contract branch and emits the parts. The Steward then creates the parts and a merge quest (kind `build`, depends on every part). Parts and the merge quest branch from the contract branch. The merge quest merges locally and runs every territory check. No party file: `party_id` is the contract quest's id, and the party is done when its merge quest is done. (Amended 2026-11-09, P1-18, confirmed by the owner: the knight's allowlist has no `git merge`, so the Steward merges the parts into the merge quest's branch before each session of its knight and leaves a conflict in progress for the knight to resolve; a `party` check before its judge sends it back while a part is not merged. A quest waiting for another one done but not merged yet starts on that one's branch. Implementation-plan §3.3, §3.13. Then, the owner's proposal (h): the merge quest's first run is the Steward's own, with no knight's session when every part merges cleanly; a knight is called when a merge stops or a judge fails it, §2.5.)
- Whoever worked on any quest of a party never verifies a quest of that party.

## Alternatives

- Sub-classes ("frontend knight"): the roster and registry multiply and a character cannot grow into a speciality.
- One long session for a cross-area job: breaks principle 13 and makes one verdict cover unrelated areas.

## Consequences

- Choosing an assignee becomes ranking, not just filtering; the tier report shows whether affinity helps.
- Parties run sequentially while `territory.max_concurrent` is 1 (stage 1 default). The full flow is task P1-18, after the phase-1 milestone.
