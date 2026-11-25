# @elvaria/hooks

## Does

- Ships `elvaria-hook`, the hook every agent CLI runs on its hook events (implementation-plan §3.6), built to
  `dist/elvaria-hook.js` and run as `node --conditions=elvaria-dist dist/elvaria-hook.js [--policy <file>]`.
  `hookCommand(policyFile?)` gives the composition root that `command` + `args` (exec form, cli-facts §1.5).
- Reads the session from env `ELVARIA_KINGDOM, ELVARIA_QUEST, ELVARIA_ATTEMPT, ELVARIA_CHARACTER, ELVARIA_ROLE,
ELVARIA_MODEL, ELVARIA_TZ`, or from the run's `policy.json` (`--policy`, v1: the same fields plus `laws` and the optional `secrets`, `tools`,
  `apprentice_models`, `cli_protected_paths`, `elvaria_protected_paths`, `patch_file`, `search_commands`) for a
  CLI that does not hand its env to hooks; env wins. Malformed ids are left out and reported on stderr.
- Turns the 12 Claude Code events Elvaria registers into lines (§3.10): `SessionStart` → `agent.session.start`
  (the model from the context when the payload has none, as under `-p`), `PostToolUse`/`PostToolUseFailure` →
  `agent.tool` (kind, path relative to the plot with `/`, command, url, exit, duration, and `agent_type` when a
  sub-agent made the call, so a revival tells the apprentice's work from the character's, §3.12; Glob, Grep, LS
  and agy's `grep_search`, `find_by_name`, `list_dir` are kind `search`, not `read`, since PS-21, so the metrics'
  reads by file count only files read), `StopFailure` →
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
  (for a CLI that locks the path itself) sends the exact change to the owner through the letter's Question section, instead of the CLI's bare denial.
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
- Passes the soft-ceiling reminder of (F) (`src/wrap-up.ts`): when the Steward has written `<run_dir>/wrap-up.json`
  (v1: `measure`, `used`, `limit`, `pct`), an assignee hears "start no new work, commit, write the handover letter,
  end the session" once per session (a marker in `hook/wrap-up-reminded/`), never through an apprentice's call. A
  class without a shell is told to write the letter and that the Steward commits. Claude Code gets it as
  `hookSpecificOutput.additionalContext` of the next `PostToolUse` no other decision answered, the route
  `docs/plans/phase-2-probes/hook-reminder.md` concluded `có` for. Codex and agy get it as the reason of one denied
  `PreToolUse` (`permissionDecision: "deny"`; agy `{"decision": "deny"}` in place of its settings answer), the next
  call no rule already denied and that neither names `handover.md` nor runs `git commit`; both show that reason to
  the model, which goes on (fix/wrap-up-agy-codex). The neutral dialect gets nothing, and the hard cut does the
  work. A missing or damaged file is silent.
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
- Answers Codex CLI too (P1-12d, spike Codex 2026-11-12 §3): its payload has Claude Code's shape, so the runner's
  hook command says `--dialect codex` (and `--event PreToolUse` on that handler). The Codex branch (`src/codex/`)
  reads its own tools: the shell is `Bash`, files change only through `apply_patch`, whose patch headers
  (`*** Add/Update/Delete File:`, `*** Move to:`) are the paths the laws and `cli_protected_paths` guard, the
  `collaboration…` tools (sub-agents) and `request_user_input…` are refused, as are tools no class grants
  (`image_gen…`, `request_plugin_install`, `mcp__…`). Codex has no `--tools` and no read or search tool, so the
  policy's `tools` decide: `Bash` for a class with a shell, else only a plain search line of `search_commands`;
  `apply_patch` for a class with Edit or Write. It answers as Claude does (`permissionDecision: "deny"`, Stop's
  `decision: "block"`), and writes `agent.session.start`, `agent.tool` (the patched path relative to the plot,
  `exit` from apply_patch's `Exit code: N`) and `agent.tool.blocked`.
- Answers any other CLI with hooks through the neutral dialect (PS-23, `src/neutral/`): the adapter puts a
  `dialect` into `policy.json` (dot paths to the event, or `argv`, the session, model, folder, tool name and input
  of the CLI's payload; the CLI's names of the four events; each of its tools with its kind, the class tools that
  grant it, the input keys of its command, paths, URL or patch, or a refusal; its `deny`, `stop` and `pass`
  answers as JSON with `{reason}`), and the hook reads it as data, loading no code of the owner's. `runHook`
  reads the policy first and takes this branch when a dialect is there; a tool the dialect does not name is refused
  unless `unknown_tools` is `allow`; `--event <pre_tool>` keeps an unreadable call refused. The rules are agy's and
  Codex's: territory laws, CLI-protected paths, the class's tools, `git grep` options, graphify, the letter's Stop
  gate. One class gate (`src/class-gate.ts`) serves agy, Codex and the dialect alike, so a class without a shell asks
  the code graph on Codex too. docs/guides/adding-a-tribe.md §2.3 has the fields.
- Keeps what it must remember between calls in `.runs/<quest>-<n>/hook/` (handover fingerprint at start, Stop
  reminders per session, wrap-up reminders per session), one small versioned JSON file per concern.
- Code graph (PS-21, `src/graph.ts`): in both branches and for every class, refuses every graphify call but the
  policy's `graph_commands` (`query`, `path`, `explain`, `affected`) with the options that only shape the answer
  (`--graph`, `--backend` and any other refused), and any graphify call when the policy grants none; a class without
  a shell runs them one plain call per line (Claude: a `Bash` call of a class whose policy `tools` lack it, the shell
  runner-claude gives for these alone; agy: as `search_commands`).
- Refuses a read tool of any tribe (Claude `Read`, agy `read_file`/`view_file`, Codex `view_image`, a neutral dialect's `read`) outside the session's plot unless it names one of policy `images`, the screens of a judge's review, or the quest's handover letter (PS-11b, `src/outside.ts`), after the territory's laws: the second fence of Claude Code and agy, the only one of Codex, whose `view_image` reads any file whatever its sandbox.
- Refuses, as an Elvaria rule for every tribe and dialect (SEC-01, threat model V1, `src/secret-place.ts`), a tool
  path or a word of a shell line that names a place holding the owner's secrets, at any depth: policy
  `secret_paths` (runner-core's `SECRET_PATHS`: `.ssh/`, `.git-credentials`, git's credential file, the treasury and
  the tribes' accounts, the CLIs' folders `.claude/`, `.codex/`, `.gemini/` and `.claude.json`), after the
  territory's laws and before the read fence. A word that stays inside the plot is the territory's own (a repo's
  `.claude/`), unless the line changes folder (`cd`, `pushd`, `Set-Location`…) or names the home folder (`~`,
  `$HOME`, `%USERPROFILE%`, `$env:USERPROFILE`, `os.homedir()`…). `git credential` is a law like `git push`
  (`forbidden_commands`). SEC-01b also fences `gh auth token`, `.config/gh/`, `.npmrc`, `.netrc`, `.aws/` and
  `.docker/config.json`. Configured absolute treasury and tribe account paths remain fenced even inside the plot;
  `.npmrc` and `.netrc` match whole filenames, including inside the plot.
  A fence on the command line, **not a sandbox**: a program the line starts reads what it
  likes, and a name built at run time (`'.s' + 'sh'`) gets through (ADR 0007); Codex's sandbox reads the whole disk
  (cli-facts 2026-11-21 §2).

## Does not

- Load anything but `node:fs`, `node:path`, `node:process` and `@elvaria/eventlog` (§1.4): no domain, no zod, no
  `.ts` at run time. `hook-process.spec.ts` traces every module the built hook loads.
- Stop the CLI on a failed write: event log and journal errors go to stderr and the decision stands.
- Read `kingdom.json`, transcripts, or the user's `~/.claude/`, or write its env anywhere (it holds
  `CLAUDE_CODE_MESSAGING_TOKEN`; ADR 0010, 0013, CLAUDE.md).
- Learn a secret value from a file: `policy.json` names the session's secrets (`secrets`, env names), and the
  values come from the hook's own env, which the CLI inherited from the runner. A name without a value is said
  on stderr and only the patterns of `redact-patterns.json` mask it.
- Check the class's tools for Claude: `--tools` does that; the policy's `tools` is read by the agy and Codex branches.
- Handle Gemini CLI payloads: that branch comes with its adapter (P1-12c).

## Depends on

- `@elvaria/eventlog` (append, journal, redact, stamps, `QUEST_ID_SHAPE`), loaded from its build through the
  `elvaria-dist` export condition. No third-party package.
- `@elvaria/config` (dev only: `tsconfig.json` extends its `tsconfig/node.json`).
- `@elvaria/testkit` (dev only: temporary folders for specs).

## How to test

```bash
pnpm --filter @elvaria/hooks build   # tsc: the event log's dist/, then this package's dist/
pnpm --filter @elvaria/hooks test    # builds, then vitest with coverage
```

`claude/translate.spec.ts` feeds a stdin payload per event with every field (`src/__fixtures__/claude-payloads.ts`);
`real-payloads.spec.ts` runs the 18 payloads Claude Code 2.1.318 really sent in spike P1-02
(`packages/runner-claude/fixtures/hook-payloads.jsonl`); `antigravity/translate.spec.ts` runs the 50 calls agy
1.5.2 really made in spike P1-12a (`packages/runner-antigravity/fixtures/hook-stdin-full-run.jsonl`) and
constructed ones; `codex/translate.spec.ts` runs the 18 calls Codex 0.167.0-alpha.4.1 really made in spike
P1-12d (`packages/runner-codex/fixtures/hook-payloads.jsonl`) and constructed ones; `neutral/translate.spec.ts`
runs the payload of flint, the made-up CLI of apps/cli's fixtures, through its dialect, and every malformed dialect;
`run-hook.spec.ts` runs whole calls in-process on temp
kingdoms (paths with a space) and reads every line back through the domain's `EventSchema`;
`hook-process.spec.ts` spawns the build: every event, a backslash path to `.env` denied on stdout, a payload
written in two halves on a stdin made non-blocking (a `process.stdin` preload: EAGAIN between the halves on
POSIX) read whole, an empty `PreToolUse` denied, stamps in the kingdom's zone, the load trace, and the start time
next to `node -e 0` on the same machine (with each process's CPU time, which a busy machine does not stretch;
`startup-gate.spec.ts` holds the rule). `stdin.spec.ts` feeds the reader a part, EAGAIN, then the rest.
