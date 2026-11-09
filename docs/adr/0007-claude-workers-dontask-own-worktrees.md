# ADR 0007 · Claude Code workers run with dontAsk + explicit allow/deny; Elvaria manages worktrees itself

- Status: accepted · 2026-11-06 · updated 2026-11-06 with spike P1-02 (Claude Code 2.1.318)
- Related: [implementation-plan.md](../implementation-plan.md) §3.0, §3.3, §3.6, §3.7; [cli-facts-2026-11-06.md](../reference/cli-facts-2026-11-06.md); [spike P1-02](../spikes/claude-2026-11.md)

## Context

- Since Claude Code 2.1.302, `-p` starts in Manual permission mode: anything that would prompt is denied unless a `PermissionRequest` hook or `--permission-prompt-tool` exists. An agent can "finish" without changing anything.
- `--bare` skips CLAUDE.md, hooks and OAuth; the user signs in with a claude.ai subscription and has no API key.
- `--worktree/-w` creates `<repo>/.claude/worktrees/<name>` on branch `worktree-<name>`, and a `-p` session leaves it behind with a lock.
- Windows native has no sandbox.
- Spike P1-02: dontAsk still runs Bash commands that Claude Code classifies as read-only (`git log`, `ls`, `cat`) without an allow rule; a bare `Read` allow reads outside the worktree; an invalid part of `--settings` is dropped without an error; by default a worker has ~29 tools (`SendMessage`, `Workflow`, `RemoteTrigger`, …) and the user's claude.ai MCP connectors; auto memory is one directory shared by the main checkout and every worktree.

## Decision

- Workers run `claude -p … --output-format stream-json --verbose --include-hook-events --permission-mode dontAsk --settings <run_dir>/settings.json`. The settings file is generated per attempt: `permissions.allow/deny` from class + territory laws + role, Elvaria hooks, and `env` (`ELVARIA_*`, `CLAUDE_CODE_MAX_RETRIES=2`).
- Never `--bare`, never `--dangerously-skip-permissions`.
- Elvaria manages worktrees itself: `git worktree add <repo>/<worktree_dir>/<quest-id> -b quest/<quest-id>`, default `worktree_dir = .elvaria/worktrees`, shared by both tribes.
- Deny rules and the PreToolUse hook are a fence, not a sandbox, and the repo's CLAUDE.md says so. A string rule like `Bash(git push:*)` misses `git -C . push`, so the hook matches normalized regexes. (Amended 2026-11-09, P1-36, decided by the owner: the PreToolUse hook fails closed. A call whose payload it cannot read, empty, cut short or not a JSON object, is denied as a forbidden one is, instead of let through unchecked; the settings give that handler `--event PreToolUse`, since Claude names the event only in the payload. Other events still ignore such a payload. The hook reads stdin with a loop that keeps what it read across EAGAIN.)
- Territory hooks (for example dc1's `guard-bash.mjs`) keep running; Elvaria adds to them and never overrides.
- File rules are scoped to the worktree: `Read(./**)`, `Edit(./**)`, `Write(./**)`, never a bare tool name. `--tools <class tools>` decides which tools exist and `--strict-mcp-config` drops MCP servers. Settings carry `autoMemoryEnabled: false`: long memory lives in the journal (principle 13), not in a memory every quest of the repo shares. The runner validates the settings it generates and treats a session whose Elvaria `SessionStart` hook did not record it as broken (killed, `infirmary`). (Amended 2026-11-06, P1-02, confirmed by the owner; implementation-plan §11.) (Amended 2026-11-07, P1-09, confirmed by the owner: an assignee also gets `Read`/`Edit`/`Write` on its own handover letter by absolute path (`//d/…`, the POSIX form 2.1.318 compares rules in), since the letter lives in the kingdom, outside `./**`; `Glob` and `Grep` get no allow rule at all, because a bare one searched any folder while dontAsk alone keeps them inside the worktree; settings are checked by a hand-written structural check.)
- `--setting-sources project,local`: user-level settings, skills and CLAUDE.md stay out, so only Elvaria and the territory grant a character anything; the territory's CLAUDE.md, rules and hooks still load. The PreToolUse hook blocks by answering `permissionDecision: "deny"` (exit 0), whose reason reaches the model without the hook's command line. The owner's general instructions reach characters of every tribe through the kingdom's royal decree, `<kingdom>/decree.md`, which the owner writes and Elvaria only reads into the system part of the prompt; Elvaria never reads `~/.claude/CLAUDE.md`. Generated settings turn off the attribution Claude Code adds to commits and PRs. (Amended 2026-11-06, P1-02 follow-up runs, confirmed by the owner; implementation-plan §3.7, §11.)

## Consequences

- Adapter tests assert `permission_denials` is empty for a normal run; a build quest with an empty diff fails verification.
- Spike P1-02 answered the revisit: an in-repo worktree loads its own CLAUDE.md, `.claude/rules/` and `.claude/settings.json`, never the main checkout's, so `worktree_dir` stays `.elvaria/worktrees`. The main checkout's untracked `CLAUDE.local.md` does load (it sits in a parent directory); `territory add` warns when a territory has one.
- `--tools` also keeps `SendMessage` away from a character, which closes the apprentice revival seen in the spike (ADR 0017).
