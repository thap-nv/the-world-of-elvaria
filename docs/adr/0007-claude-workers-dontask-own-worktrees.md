# ADR 0007 · Claude Code workers run with dontAsk + explicit allow/deny; Elvaria manages worktrees itself

- Status: accepted · 2026-11-06
- Related: [implementation-plan.md](../implementation-plan.md) §3.0, §3.3, §3.6; [cli-facts-2026-11-06.md](../reference/cli-facts-2026-11-06.md)

## Context

- Since Claude Code 2.1.302, `-p` starts in Manual permission mode: anything that would prompt is denied unless a `PermissionRequest` hook or `--permission-prompt-tool` exists. An agent can "finish" without changing anything.
- `--bare` skips CLAUDE.md, hooks and OAuth; the user signs in with a claude.ai subscription and has no API key.
- `--worktree/-w` creates `<repo>/.claude/worktrees/<name>` on branch `worktree-<name>`, and a `-p` session leaves it behind with a lock.
- Windows native has no sandbox.

## Decision

- Workers run `claude -p … --output-format stream-json --verbose --include-hook-events --permission-mode dontAsk --settings <run_dir>/settings.json`. The settings file is generated per attempt: `permissions.allow/deny` from class + territory laws + role, Elvaria hooks, and `env` (`ELVARIA_*`, `CLAUDE_CODE_MAX_RETRIES=2`).
- Never `--bare`, never `--dangerously-skip-permissions`.
- Elvaria manages worktrees itself: `git worktree add <repo>/<worktree_dir>/<quest-id> -b quest/<quest-id>`, default `worktree_dir = .elvaria/worktrees`, shared by both tribes.
- Deny rules and the PreToolUse hook are a fence, not a sandbox, and the repo's CLAUDE.md says so. A string rule like `Bash(git push:*)` misses `git -C . push`, so the hook matches normalized regexes.
- Territory hooks (for example dc1's `guard-bash.mjs`) keep running; Elvaria adds to them and never overrides.

## Consequences

- Adapter tests assert `permission_denials` is empty for a normal run; a build quest with an empty diff fails verification.
- Revisit after spike P1-02: Claude Code loads CLAUDE.md from every parent directory, so an in-repo worktree may load the main checkout's CLAUDE.md twice. If `/context` shows that, the default `worktree_dir` becomes the sibling `../<repo>.elvaria/worktrees`.
