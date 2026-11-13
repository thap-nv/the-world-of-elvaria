# ADR 0026 · Guarded self-change: protected paths need the royal seal; the Steward runs a pinned build and upgrades with a trial and a way back

- Status: accepted · 2026-11-10
- Related: [implementation-plan.md](../implementation-plan.md) §3.16.4, §3.16.10; [product plan 0.8](../ke-hoach-dung-elvaria-0.8.md) principle 17, §14; [ADR 0007](0007-claude-workers-dontask-own-worktrees.md), [ADR 0008](0008-separation-of-duties.md), [ADR 0023](0023-steward-delivers-push-pr-merge.md)

## Context

From stage 2 Elvaria builds Elvaria: its own repo is a territory, its characters change the code that dispatches, judges and measures them, and the Steward may merge what they deliver. Self-improving agents have been seen to raise their score by weakening the check instead of doing the work. The stage-1 habit of switching the Steward's build by hand between runs has no trial and no way back.

## Decision

- A territory declares `laws.protected_paths`. A quest whose changes touch them always needs the royal seal, whatever its kind's `seal_default`, and gets the strongest judge the separation rules allow. The Steward reads a plot's changes before each commit, as it does for `forbidden_paths`; here it marks the quest instead of refusing the commit. (Amended 2026-11-11, phase 1.5 plan: the mark is set through the Steward's `Move.before` at submit, since `seal_required` is read only when a verdict passes; the state machine does not change.) (Amended 2026-11-13, PS-04: "the strongest judge" is the order of P1-48 for rank B and above: another model family, then another tribe, then the higher level. A glob matches at any depth, as for `forbidden_paths`; the mark is `seal_required` with `quest.protected_changes`, gathered over the submits and never lowered, and the machine's merge of a party reads its own changes too.)
- For the Elvaria territory the default list is the "read before you write" list of `CLAUDE.md` plus the repo's own rules and guards: `.claude/**`, `CLAUDE.md`, `docs/adr/**`, `.github/**`, `packages/hooks/**`, the metrics code, and the rituals, classes and kinds of the default registry.
- The Steward runs a pinned build. `elvaria upgrade` builds the new one beside it, runs `doctor`, the tribe conformance suites and a trial (a script-tier quest, later the training-ground cases), and only then moves the pointer; `--rollback` moves it back. No upgrade while a session runs. (Amended 2026-11-11, phase 1.5 plan: a build is a detached worktree of the repo at one commit under `<kingdom>/.builds/<sha>/`, with the pointer in `.state/build.json`, because the built CLI loads the workspace packages from source. The pin covers every CLI command on that kingdom, not only `run`: inbox payloads are strict objects, and `say`, `migrate` and `quest add` use the prompts and schemas of the build they run from.)
- A larger change to prompts, skills or models is tried on the training ground first: replayed past quests with known outcomes, in scratch plots, under its own mana cap.

## Alternatives

- Forbid Elvaria from changing its own guards: safe, but then the owner writes every such change by hand.
- Trust the judge alone: the judge's prompt and ritual are among the things a quest could change.

## Consequences

- The measure stays out of reach of the measured: a quest can propose a change to a guard, only the owner can let it in.
- An upgrade that breaks the world is one command to undo.
- Protected paths make some quests wait for the owner; the list is data, so the owner can narrow it.
