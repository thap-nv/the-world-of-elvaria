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

## Does not

- Talk to a real CLI: adapters do (`runner-claude` P1-09, `runner-antigravity` P1-12b, `runner-gemini` P1-12c).
- Write settings.json, policy.json or agents.json, nor build the minimal env: the adapters (P1-09) and the
  treasury (P1-10) do, from `ToolPolicy` and `SpawnRequest`.
- Prepare plots, run checks, kill process trees or normalise streams yet (P1-06, P1-07, §3.10).
- Decide anything: the Steward chooses who, when and with which continuation; `tribeLimitsOf` lives in the
  domain.

## Depends on

- `@elvaria/domain` (schemas, registry, capabilities, `RITUAL_STEPS`, `FAIL_KINDS`), `@elvaria/store`
  (`readTextFile`, `writeFileAtomic`). No third-party package.

## How to test

```bash
pnpm --filter @elvaria/runner-core test
```

`src/prompt/__snapshots__/*.txt` hold the prompts of the four roles, with and without a decree;
`src/policy/__snapshots__/class-policies.txt` holds the policy of every default class. Review a change there as
you would a change of prose. `src/conformance/conformance.spec.ts` runs the suite against FakeRunner, and against
runners that lie about their capabilities.
