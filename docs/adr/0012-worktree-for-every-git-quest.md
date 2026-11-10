# ADR 0012 · Every quest on a git territory gets a worktree, regardless of kind

- Status: accepted · 2026-11-06
- Related: [implementation-plan.md](../implementation-plan.md) §3.3, §9.1 items 3 and 11; [ADR 0007](0007-claude-workers-dontask-own-worktrees.md)

## Context

The product plan (§7, "Đất riêng") gives code quests a git worktree and document quests a folder `quests/<id>/work/` with a deliberate copy at delivery. On dc1-se-team, `docs/testing.md` must go through a branch and a PR like any other file; copying it into the main checkout is writing outside the plot.

## Decision

- On a territory with `vcs.type = git`, every quest gets a worktree, whatever its kind: `git worktree add <repo>/<worktree_dir>/<quest-id> -b quest/<quest-id> <default_branch>`. Fetch first when there is a remote; never pull the main checkout.
- `quests/<id>/work/` is only for territories without git; delivery copies into `territory.path`.
- On attach, Elvaria appends `.elvaria/`, `GEMINI.md`, `.agents/hooks.json`, `.agents/elvaria-hook.mjs` and `.gemini/settings.json` to the repo's `.git/info/exclude` (shared by worktrees). (Amended 2026-11-06, P1-12a: the Antigravity hook needs a generated shim next to `hooks.json`, ADR 0015.) It never edits `.gitignore`. On Windows it sets `core.longpaths true`. (Amended 2026-11-07, P1-07, confirmed by the owner: every `PlotManager.prepare` ensures both, idempotently, instead of `territory add`; the exclude lines are anchored at the plot root, `/GEMINI.md` and so on, so a `GEMINI.md` a quest writes deeper in the repo is still committed.)
- `PlotManager.prepare` is idempotent; `commitAll` runs before any kill or pause; `release` (remove the worktree, keep the branch) runs only when the quest is archived.
- Stage 1 has no automatic merge and no `git push`. The user merges by hand after the royal seal; `delivery.md` suggests the commands. (Amended 2026-11-10, product plan 0.8, decided by the owner: from PS-08 the Steward pushes the quest branch, opens a pull request and merges, per territory, [ADR 0023](0023-steward-delivers-push-pr-merge.md); characters still never push.)

## Consequences

- Each worktree has its own `node_modules`; `commands.setup` runs once and archive cleans it.
- Tools of the main repo that scan recursively (ESLint, tsc, Playwright) may pick up `.elvaria/`; `territory add` checks their ignores and warns.
- Until file-scope locks exist, `max_concurrent` per territory (default 1 for code) prevents two quests touching the same files.
