# @elvaria/hooks

## Does

- Ships `elvaria-hook`, the hook every agent CLI runs on its hook events (implementation-plan §3.6), built to
  `dist/elvaria-hook.js` and run as `node --conditions=elvaria-dist dist/elvaria-hook.js [--policy <file>]`.
  `hookCommand(policyFile?)` gives the composition root that `command` + `args` (exec form, cli-facts §1.5).
- Reads the session from env `ELVARIA_KINGDOM, ELVARIA_QUEST, ELVARIA_ATTEMPT, ELVARIA_CHARACTER, ELVARIA_ROLE,
ELVARIA_MODEL, ELVARIA_TZ`, or from the run's `policy.json` (`--policy`, v1: the same fields plus `laws`) for a
  CLI that does not hand its env to hooks; env wins. Malformed ids are left out and reported on stderr.
- Turns the 12 Claude Code events Elvaria registers into lines (§3.10): `SessionStart` → `agent.session.start`
  (the model from the context when the payload has none, as under `-p`), `PostToolUse`/`PostToolUseFailure` →
  `agent.tool` (kind, path relative to the plot with `/`, command, url, exit, duration), `StopFailure` →
  `mana.signal`, `PreCompact`/`PostCompact` → `agent.compact`, `Notification` → `agent.notification`. The
  runner writes what only the stream knows: `agent.session.end` (outcome, usage, kills) and
  `agent.subagent.start`/`end` (`SubagentStop` does not run when an apprentice stops at `maxTurns`).
- Stops a call with a JSON decision on stdout and exit 0, never exit 2, whose reason reaches the model prefixed
  with the hook's command line (spike P1-02): `PreToolUse` → `permissionDecision: "deny"`, `Stop` →
  `decision: "block"`.
- Guards the territory laws in `PreToolUse` (second fence after the deny rules, ADR 0013): `forbidden_paths`
  match at any depth, case-insensitively, with backslashes, `..`, NTFS streams and trailing dots resolved;
  `forbidden_commands` match the raw and the de-quoted line, case-insensitively; a shell line that names a
  forbidden file (`cat .env`, `Get-Content .env`) is denied too. Laws asked for (`--policy`) but unreadable deny
  every file and shell tool.
- Denies every sub-agent but the apprentice in `PreToolUse` on the `Agent` tool (§3.12, ADR 0017), laws or not.
  Every denial logs `agent.tool.blocked`.
- Asks for the handover letter in `Stop` (ADR 0010): an assignee whose `quests/<id>/handover.md` is missing or
  unchanged since the attempt started is blocked at most twice per session, then let through with an
  `agent.notification` for the verifier.
- Writes each line in the order §3.6 fixes: stamp (`createStamper` of the event log; the process sets `TZ` to
  the kingdom's zone) → `redactDeep` → long strings cut with `…[truncated]` until the line fits 64 KiB → append to
  `events/<day>.jsonl` and `quests/<id>/journal.jsonl`.
- Keeps what it must remember between calls in `.runs/<quest>-<n>/hook/` (handover fingerprint at start, Stop
  reminders per session), one small versioned JSON file per concern.

## Does not

- Load anything but `node:fs`, `node:path`, `node:process` and `@elvaria/eventlog` (§1.4): no domain, no zod, no
  `.ts` at run time. `hook-process.spec.ts` traces every module the built hook loads.
- Stop the CLI on a failed write: event log and journal errors go to stderr and the decision stands.
- Read `kingdom.json`, transcripts, or the user's `~/.claude/`, or write its env anywhere (it holds
  `CLAUDE_CODE_MESSAGING_TOKEN`; ADR 0010, 0013, CLAUDE.md).
- Mask known secret values yet: P1-10 settles how the runner passes their names; until then only the patterns
  of `redact-patterns.json` apply.
- Handle Antigravity, Gemini CLI or Codex payloads: their branches come with their adapters (P1-12b, P1-12c,
  P1-12d).

## Depends on

- `@elvaria/eventlog` (append, journal, redact, stamps, `QUEST_ID_SHAPE`), loaded from its build through the
  `elvaria-dist` export condition. No third-party package.

## How to test

```bash
pnpm --filter @elvaria/hooks build   # tsc: the event log's dist/, then this package's dist/
pnpm --filter @elvaria/hooks test    # builds, then vitest with coverage
```

`translate.spec.ts` feeds a stdin payload per event with every field (`src/__fixtures__/claude-payloads.ts`);
`real-payloads.spec.ts` runs the 18 payloads Claude Code 2.1.318 really sent in spike P1-02
(`packages/runner-claude/fixtures/hook-payloads.jsonl`); `run-hook.spec.ts` runs whole calls in-process on temp
kingdoms (paths with a space) and reads every line back through the domain's `EventSchema`;
`hook-process.spec.ts` spawns the build: every event, a backslash path to `.env` denied on stdout, stamps in the
kingdom's zone, the load trace, and the start time next to `node -e 0` on the same machine.
