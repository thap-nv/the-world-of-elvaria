# @elvaria/hooks

## Does

- Ships `elvaria-hook`, the hook every agent CLI runs on its hook events (implementation-plan §3.6), built to
  `dist/elvaria-hook.js` and run as `node --conditions=elvaria-dist dist/elvaria-hook.js [--policy <file>]`.
  `hookCommand(policyFile?)` gives the composition root that `command` + `args` (exec form, cli-facts §1.5).
- Reads the session from env `ELVARIA_KINGDOM, ELVARIA_QUEST, ELVARIA_ATTEMPT, ELVARIA_CHARACTER, ELVARIA_ROLE,
ELVARIA_MODEL, ELVARIA_TZ`, or from the run's `policy.json` (`--policy`, v1: the same fields plus `laws` and the optional `secrets`, `tools`,
  `apprentice_models`, `cli_protected_paths`, `patch_file`, `search_commands`) for a
  CLI that does not hand its env to hooks; env wins. Malformed ids are left out and reported on stderr.
- Turns the 12 Claude Code events Elvaria registers into lines (§3.10): `SessionStart` → `agent.session.start`
  (the model from the context when the payload has none, as under `-p`), `PostToolUse`/`PostToolUseFailure` →
  `agent.tool` (kind, path relative to the plot with `/`, command, url, exit, duration, and `agent_type` when a
  sub-agent made the call, so a revival tells the apprentice's work from the character's, §3.12), `StopFailure` →
  `mana.signal`, `PreCompact`/`PostCompact` → `agent.compact`, `Notification` → `agent.notification`. The
  runner writes what only the stream knows: `agent.session.end` (outcome, usage, kills) and
  `agent.subagent.start`/`end` (`SubagentStop` does not run when an apprentice stops at `maxTurns`).
- Reads its payload whole from fd 0 with a `readSync` loop that keeps every chunk and, when a pipe left
  non-blocking answers EAGAIN before its writer closed it, waits a millisecond and reads on (`src/stdin.ts`,
  P1-36). `readFileSync(0)` threw away what it had read at that point, so a payload could arrive cut or empty.
- Stops a call with a JSON decision on stdout and exit 0, never exit 2, whose reason reaches the model prefixed
  with the hook's command line (spike P1-02): `PreToolUse` → `permissionDecision: "deny"`, `Stop` →
  `decision: "block"`.
- Fails closed in `PreToolUse` (ADR 0007, P1-36): a payload it cannot read (empty, cut short, not a JSON object)
  denies the call, with `agent.tool.blocked` (`tool: "other"`) and a reason that asks the model to make the call
  again. Claude names its event only in the payload, so the runner gives that handler `--event PreToolUse`; agy's
  event is in argv anyway. Every other event ignores such a payload, as before, with a note on stderr.
- Guards the territory laws in `PreToolUse` (second fence after the deny rules, ADR 0013): `forbidden_paths`
  match at any depth, case-insensitively, with backslashes, `..`, NTFS streams and trailing dots resolved;
  `forbidden_commands` match the raw and the de-quoted line, case-insensitively; a shell line that names a
  forbidden file (`cat .env`, `Get-Content .env`) is denied too. `read_only_paths` (P1-24, generated files) match
  the same way but stop only writes: a write tool, a shell redirection (`> f`, `>> f`) or a shell writer (`tee`,
  `Set-Content`, `Add-Content`, `Out-File`); reading, `git add` and the territory's generators go through. Laws
  asked for (`--policy`) but unreadable deny every file and shell tool.
- Refuses first, as an Elvaria rule, in the Claude and the agy branch, a write to the policy's
  `cli_protected_paths`: the paths the adapter says its CLI refuses whatever its rules say (P1-24: Claude Code's
  `.husky/`, `.git/`, `.claude/`…) and, for every tribe, git's own folder `.git/**` (runner-core's `GIT_PATHS`,
  P1-49), with a reason that
  sends the exact change to the owner through the letter's Question section, instead of the CLI's bare denial.
  When the path is one of `laws.patch_paths` and the policy names a `patch_file` (P1-28), the reason says to write
  the change as a git patch to that file at the root of the plot, which the Steward applies when the session
  completes, with no "do not try another way" after it.
- Denies every sub-agent but the apprentice in `PreToolUse` on the `Agent` tool (§3.12, ADR 0017), laws or not,
  and an apprentice asked to run on a `model` outside the policy's `apprentice_models` (the models up to the
  character's own, which the adapter writes; P1-17). Every denial logs `agent.tool.blocked`, with `agent_type`
  when a sub-agent made the call.
- Asks for the handover letter in `Stop` (ADR 0010): an assignee whose `quests/<id>/handover.md` is missing or
  unchanged since the attempt started is blocked at most twice per session, then let through with an
  `agent.notification` for the verifier.
- Writes each line in the order §3.6 fixes: stamp (`createStamper` of the event log; the process sets `TZ` to
  the kingdom's zone) → `redactDeep` → long strings cut with `…[truncated]` until the line fits 64 KiB → append to
  `events/<day>.jsonl` and `quests/<id>/journal.jsonl`. The redactor masks the session's secret values first
  (the env values of the names in the policy's `secrets`, P1-10, §3.9), then the patterns.
- Answers Antigravity CLI (`agy`) too, whose payload names no event: its hook command carries the event in argv
  (`node elvaria-hook.mjs PreToolUse`, a shim the runner writes in `.agents/` adds `--policy`; spike P1-12a §4).
  PreToolUse always answers, since agy reads no answer as a block: `{"decision": "deny", "reason"}` for a law,
  a sub-agent tool, an `ask_*` tool (nobody answers under `-p`) or a tool the class lacks (the policy's
  `tools`, agy has no `--tools`: `search_web` for a class without `WebSearch`, a write tool for a judge), else `{"decision":
"deny_unless_prior_grant"}`, so the run's `--settings` allow rules decide; never `allow` or `auto_approve`.
  Search (P1-53, `src/search.ts`): a class without a shell may still run the policy's `search_commands` (`git grep`,
  `git ls-files`), one plain call per line (nothing PowerShell or bash reads outside single quotes as more than
  words: `;`, `|`, `$`, `(`, unquoted globs…); and every class is refused the `git grep` options that run a program
  or reach past the tracked files (`-O` even among other short options, `--open-files-in-pager`, `--no-index`,
  `--untracked`, `--textconv`, under any abbreviation git takes), which agy's prefix rule `command(git grep)` lets by.
  SessionStart and PostToolUse write `agent.session.start` and `agent.tool` (path relative to
  `workspacePaths[0]`); Stop answers `{"decision": "continue", "reason"}` while the letter is unchanged. A
  sub-agent's own session (empty `lastUserInput`) starts no line and meets no gate.
- Keeps what it must remember between calls in `.runs/<quest>-<n>/hook/` (handover fingerprint at start, Stop
  reminders per session), one small versioned JSON file per concern.

## Does not

- Load anything but `node:fs`, `node:path`, `node:process` and `@elvaria/eventlog` (§1.4): no domain, no zod, no
  `.ts` at run time. `hook-process.spec.ts` traces every module the built hook loads.
- Stop the CLI on a failed write: event log and journal errors go to stderr and the decision stands.
- Read `kingdom.json`, transcripts, or the user's `~/.claude/`, or write its env anywhere (it holds
  `CLAUDE_CODE_MESSAGING_TOKEN`; ADR 0010, 0013, CLAUDE.md).
- Learn a secret value from a file: `policy.json` names the session's secrets (`secrets`, env names), and the
  values come from the hook's own env, which the CLI inherited from the runner. A name without a value is said
  on stderr and only the patterns of `redact-patterns.json` mask it.
- Check the class's tools for Claude: `--tools` does that; the policy's `tools` is read by the agy branch only.
- Handle Gemini CLI or Codex payloads: their branches come with their adapters (P1-12c, P1-12d).

## Depends on

- `@elvaria/eventlog` (append, journal, redact, stamps, `QUEST_ID_SHAPE`), loaded from its build through the
  `elvaria-dist` export condition. No third-party package.

## How to test

```bash
pnpm --filter @elvaria/hooks build   # tsc: the event log's dist/, then this package's dist/
pnpm --filter @elvaria/hooks test    # builds, then vitest with coverage
```

`claude/translate.spec.ts` feeds a stdin payload per event with every field (`src/__fixtures__/claude-payloads.ts`);
`real-payloads.spec.ts` runs the 18 payloads Claude Code 2.1.318 really sent in spike P1-02
(`packages/runner-claude/fixtures/hook-payloads.jsonl`); `antigravity/translate.spec.ts` runs the 50 calls agy
1.5.2 really made in spike P1-12a (`packages/runner-antigravity/fixtures/hook-stdin-full-run.jsonl`) and
constructed ones; `run-hook.spec.ts` runs whole calls in-process on temp
kingdoms (paths with a space) and reads every line back through the domain's `EventSchema`;
`hook-process.spec.ts` spawns the build: every event, a backslash path to `.env` denied on stdout, a payload
written in two halves on a stdin made non-blocking (a `process.stdin` preload: EAGAIN between the halves on
POSIX) read whole, an empty `PreToolUse` denied, stamps in the kingdom's zone, the load trace, and the start time
next to `node -e 0` on the same machine. `stdin.spec.ts` feeds the reader a part, EAGAIN, then the rest.
