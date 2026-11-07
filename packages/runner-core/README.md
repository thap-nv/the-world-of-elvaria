# @elvaria/runner-core

## Does

- Defines the one interface between the Steward and an agent CLI (implementation-plan §3.7, ADR 0006, 0021):
  `AgentRunner` (`tribe`, `adapter`, `capabilities`, `spawn`, `probe`, `doctor`), `SpawnRequest`, `RunningSession`
  (`session_id`, `pid`, `signals`, `wait`, `kill`), `RunnerSignal` and `RunResult`. `RunResult.rate_limited` tells
  a session that ran out of mana from a crash; `RunResult.question` is the Question section of the handover
  letter (§2.4), read by `readQuestion` after every session.
- Ships `createFakeRunner()`: characters that play a scenario in process (`submit`, `crash`, `hang`,
  `rate_limit`, `forbidden_command`, `ask`), chosen per spawn by `scenarioOf` or by env `ELVARIA_FAKE_SCENARIO`.
  It writes the letter, blocks the forbidden push through the policy when it declares `tool_gate`, keeps a
  resumed session id, and records every request for the Steward's tests.
- Builds `ToolPolicy` from class + territory laws + role (`toolPolicyOf`): `tools` (Claude `--tools`), `allow` and
  `deny` rules in Claude Code syntax, the apprentice (`Agent(apprentice)` in a class is a flag), and the laws the
  hook enforces. A verifier never has Edit, Write or NotebookEdit; a character with a shell may run the
  territory's non-exclusive checks; every session is fenced (no `git push`, no `.env`, no built-in agent).
- Builds prompts from the Markdown templates in `prompts/` (`loadPromptTemplates`): `buildPrompt` for an
  assignee (new, or continuing after `returned` / `revive` with the letter, the last 20 journal lines, the
  branch's log and the owner's answer) and a verifier (the ritual's steps from `prompts/ritual-steps.md`, the
  checks, the letter, the diff); `buildChancellorPrompt` for the Chancellor. The system part opens with the
  royal decree when `<kingdom>/decree.md` exists.
- Runs the conformance suite (`conformanceChecks`, `runConformance`): plain checks with `node:assert`, so a spec
  wraps them in `it` and `elvaria tribe check` (P1-19) runs them too. With a real CLI (`live`) only the checks
  that burn no mana run.
- Gives every quest its own ground (`createPlotManager`, implementation-plan §3.3, ADR 0012). On a git territory,
  `prepare` adds `<repo>/<worktree_dir>/<quest-id>` on branch `quest/<quest-id>` (`--no-track`), forked from the
  default branch: origin's after a fetch when it only adds to the local one, else the local one; the main
  checkout is never pulled. It is idempotent: a worktree already there is reused, a branch that outlived its
  worktree is checked out again. Each prepare also makes sure of the repo's `.git/info/exclude` lines
  (`PLOT_EXCLUDES`) and, on Windows, `core.longpaths`, and runs `commands.setup` until it succeeds once (log in
  `.runs/<quest>-setup.log`). The fork point and the setup state live in `elvaria-plot.json` in the worktree's
  private git folder. `status`, `touched` (paths changed since the fork, committed or not, plus untracked files),
  `commitAll` (everything, through the territory's own hooks; `refused` when a hook says no; the Steward's messages
  are `plotCommitMessage`, Conventional Commits so commitlint accepts them) and `release`
  (removes a clean worktree, keeps the branch, then calls each `forget` callback, such as a tribe CLI dropping its
  transcripts). A territory without git gets `quests/<id>/work/` in the kingdom.
- Runs the machine checks before a judge (`runChecks`, §3.2): the territory's `checks` whose `when` globs match
  what the quest touched (`selectChecks`, `globToRegExp`: dot names match, case-insensitive, like the laws' globs
  in the hook), one at a time in the plot, each logged to `<run_dir>/checks/<id>.log`. An `exclusive` check holds
  the territory's lock (`.state/checks/<territory>-exclusive`) so two quests never run one at once; a timed-out
  check runs its `cleanup`. A check that cannot run (shell syntax, program not found, lock never freed) fails.
- Starts territory programs without a shell (`runProgram`, `argvOf`, `splitCommandLine`): quoted words, shell
  syntax refused, the program resolved by the `ProcessHost` the composition root passes in (it owns PATH and turns
  an npm `.cmd` shim into `node <script>`), and an env with no `GIT_*` (`childEnvOf`).

## Does not

- Talk to a real CLI: adapters do (`runner-claude` P1-09, `runner-antigravity` P1-12b, `runner-gemini` P1-12c).
- Write settings.json, policy.json or agents.json, nor build the minimal env: the adapters (P1-09) and the
  treasury (P1-10) do, from `ToolPolicy` and `SpawnRequest`.
- Kill process trees or normalise streams yet (P1-06, §3.10): a check or setup past its timeout loses only its
  own process.
- Search PATH, push, merge, or force anything: a dirty worktree is not released, a refused commit stays refused.
- Name a tribe CLI: `claude purge --yes <worktree>` reaches `release` as a `forget` callback (ADR 0021).
- Decide anything: the Steward chooses who, when and with which continuation; `tribeLimitsOf` lives in the
  domain.

## Depends on

- `@elvaria/domain` (schemas, registry, capabilities, `RITUAL_STEPS`, `FAIL_KINDS`, `Result`), `@elvaria/store`
  (`readTextFile`, `writeFileAtomic`, `acquireLock`, kingdom paths). No third-party package; git is the
  territory's own, found by the host.

## How to test

```bash
pnpm --filter @elvaria/runner-core test
```

`src/prompt/__snapshots__/*.txt` hold the prompts of the four roles, with and without a decree;
`src/policy/__snapshots__/class-policies.txt` holds the policy of every default class. Review a change there as
you would a change of prose. `src/conformance/conformance.spec.ts` runs the suite against FakeRunner, and against
runners that lie about their capabilities. The plot and check specs build real git repos (a bare origin, a clone,
worktrees, a refusing pre-commit hook) and plots in temp folders with spaces in their names; git runs without the
caller's `GIT_*` (`src/__fixtures__/git-repo.ts`), and one spec proves a `GIT_DIR` in the host env is ignored.
