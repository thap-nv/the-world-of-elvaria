# @elvaria/hooks

## Does

- Ships `elvaria-hook`, the hook every agent CLI runs on its hook events (implementation-plan §3.6), built to
  `dist/elvaria-hook.js` and run as `node --conditions=elvaria-dist dist/elvaria-hook.js [--policy <file>]`.
  `hookCommand(policyFile?)` gives the composition root that `command` + `args` (exec form, cli-facts §1.5).
- Reads the session from env `ELVARIA_KINGDOM, ELVARIA_QUEST, ELVARIA_ATTEMPT, ELVARIA_CHARACTER, ELVARIA_ROLE,
ELVARIA_TZ`, or from the run's `policy.json` (`--policy`, v1: the same fields plus `laws`) for a CLI that does
  not hand its env to hooks; env wins. Malformed ids are left out and reported on stderr.
- Turns the 12 Claude Code events Elvaria registers into lines (§3.10): `SessionStart` → `agent.session.start`,
  `PostToolUse`/`PostToolUseFailure` → `agent.tool` (kind, path relative to the plot with `/`, command, url,
  exit, duration), `StopFailure` → `mana.signal`, `SubagentStart`/`SubagentStop` → `agent.subagent.start`/`end`
  (duration measured between the two), `PreCompact`/`PostCompact` → `agent.compact`, `Notification` →
  `agent.notification`. `SessionEnd` writes nothing: `agent.session.end` comes from the stream's `result`
  (P1-09), the only place with outcome and usage.
- Guards the territory laws in `PreToolUse` (second fence after the deny rules, ADR 0013): `forbidden_paths`
  match at any depth, case-insensitively, with backslashes, `..`, NTFS streams and trailing dots resolved;
  `forbidden_commands` match the raw and the de-quoted line, case-insensitively; a shell line that names a
  forbidden file (`cat .env`, `Get-Content .env`) is blocked too. A block logs `agent.tool.blocked` and exits 2
  with the reason on stderr. Laws asked for (`--policy`) but unreadable block every file and shell tool.
- Asks for the handover letter in `Stop` (ADR 0010): an assignee whose `quests/<id>/handover.md` is missing or
  unchanged since the attempt started is blocked (exit 2) at most twice per session, then let through with an
  `agent.notification` for the verifier.
- Writes each line in the order §3.6 fixes: stamp (`createStamper` of the event log; the process sets `TZ` to
  the kingdom's zone) → `redactDeep` → long strings cut with `…[truncated]` until the line fits 64 KiB → append to
  `events/<day>.jsonl` and `quests/<id>/journal.jsonl`.
- Keeps what it must remember between calls in `.runs/<quest>-<n>/hook/` (handover fingerprint at start, Stop
  reminders per session, sub-agent start times), one small versioned JSON file per concern.

## Does not

- Load anything but `node:fs`, `node:path`, `node:process` and `@elvaria/eventlog` (§1.4): no domain, no zod, no
  `.ts` at run time. `hook-process.spec.ts` traces every module the built hook loads.
- Block on a failed write: event log and journal errors go to stderr and the call exits as the laws decided.
- Read `kingdom.json`, transcripts, or the user's `~/.claude/` (ADR 0010, CLAUDE.md).
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

`translate.spec.ts` feeds a fake stdin payload per event (`src/__fixtures__/claude-payloads.ts`, shaped after the
hooks reference until P1-02 records real ones); `run-hook.spec.ts` runs whole calls in-process on temp kingdoms
(paths with a space) and reads every line back through the domain's `EventSchema`; `hook-process.spec.ts` spawns
the build: every event, a backslash path to `.env` blocked with exit 2, stamps in the kingdom's zone, the load
trace, and the start time next to `node -e 0` on the same machine.
