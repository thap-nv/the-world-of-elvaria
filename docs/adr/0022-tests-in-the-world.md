# ADR 0022 · Tests in the world: tag-chosen ritual for tests as a product, a scratch plot for the judge, heavy checks once per party

- Status: accepted · 2026-11-06
- Amends: [ADR 0008](0008-separation-of-duties.md) (verifier tools), [ADR 0011](0011-one-judge-class-per-tribe.md) (ritual chosen by kind)
- Related: [implementation-plan.md](../implementation-plan.md) §3.15, §9.1 item 29; [product plan 0.7](../ke-hoach-dung-elvaria-0.7.md) §5 "Test trong thế giới"

## Context

Product plan 0.7 separates three things. Running tests is not a quest: it is a machine check (mana 0), and integration and e2e run once in a party's merge quest. Tests that come with a change are written by the assignee and judged with it. Tests as a product ("write e2e for flow X") are build or refactor quests tagged `e2e` or `integration`, judged by the Thử tường ritual: rerun in a clean plot and clean DB, deliberately break what the tests guard and expect red, run three times (flaky fails and opens a fix quest), coverage does not drop. An optional Khảo hạch mù has another character write acceptance tests from the description and contract alone.

Two accepted decisions stand in the way: the ritual follows the kind alone (`kinds[kind].ritual`, ADR 0011), and a verifier never gets Edit or Write (ADR 0008), yet breaking code on purpose needs edits.

## Decision

- A kind may carry `ritual_overrides: [{tags_any, ritual}]`; the first override whose tags meet the quest's tags wins, otherwise `kinds[kind].ritual`. `ritualOf(quest, registry)` is a pure domain function; still data, no switch in the core (ADR 0016). Defaults: `build` and `refactor` → `mutation_check` for tags `e2e` or `integration`; tag `integration` joins `tags.json`. The ritual the product plan calls Thử tường is displayed as "Thả quái thử thành" (owner's choice; names are theme and i18n data).
- A ritual may declare `scratch_plot: true`. Its verifier then works in a disposable worktree `<quest-id>-verify` made from the quest branch, after `commands.setup` and the optional `commands.reset` (clean DB, containers). Only there does `ToolPolicy` grant Edit/Write; hooks deny commit and push, and the plot is removed after the verdict. The quest branch never changes, so "the doer does not judge, the judge does not produce" still holds.
- New ritual steps `rerun_clean`, `break_and_expect_red`, `flake_check`, `coverage_not_lower`; new `fail_kind: flaky`, on which the Steward opens a `fix` quest.
- `territory.checks[].defer_to_merge` (default false): skipped in a party part, run by the merge quest.
- Khảo hạch mù is `territory.blind_trial: {enabled: false, min_rank: 'B'}`, built on parties: an acceptance-test part, written by another character (other model family first) from a worktree of the base branch, merged with the work and run together. (Amended 2026-11-09, P1-21, confirmed by the owner: the part is `party_role: acceptance`, which only the Steward makes; the base branch is the party's, the contract's branch, so the writer has the contract and none of the parts' work; it runs no territory check of its own, its tests waiting for the merge quest; its writer and the parts' assignees are kept apart both ways. Implementation-plan §3.15.)
- No `tester` class: writing tests is writing code, taken by the knight with the best `e2e` reputation.

## Consequences

- Schema additions (kind, ritual, territory, verdict enum) are compatible with v1 files: version stays 1.
- None of the 10 phase-1 quests has tests as its product, so this lands after the phase-1 milestone (P1-20, P1-21).
- The judge's scratch edits are a second fence to test: the conformance suite must prove commit and push are blocked there.
