# @elvaria/steward

## Does

- Runs the Steward (implementation-plan §3.1): `createSteward(deps)` takes `.state/steward.lock` (one Steward per
  kingdom), rebuilds from the event log what it already answered, and ticks every `dispatch.tick_seconds`.
  Ticks never overlap.
- One tick, in the order of §3.1: the inbox in id order (the owner first); the ends of the sessions it runs;
  sessions the files say run but it does not hold (a Steward that stopped or crashed) end as a crash, so no
  quest ever runs two sessions; the inbox commands that waited, once more; then the domain's `planTick` decides
  and the Steward carries it out: claimed quests start, submitted quests get a verifier, returned quests go back
  to their assignee, open quests are claimed.
- Is the only writer of quests and characters (ADR 0005): every change goes through `transition()` or
  `transitionCharacter()`, is written to its file, then told in one event line carrying the view after it
  (P0-09), in the log and the quest's journal. Replaying the log over the morning gives back the files.
- Applies the owner's commands: `create_quest` (an id derived from the command id, so a command applied twice
  never makes two quests), `confirm`, `cancel` (kills the session), `archive`, `retry`, `seal` (a human verdict,
  weighed three times), `answer` (waits in the inbox until the asker is free), `reassign` (the owner's character,
  the level aside; or the Steward's own choice), `set_rank`, `edit_quest` (refused when the quest moved since
  the owner read it). Other kinds are refused with `unsupported` until their task. A `create_quest` that asks for
  a secret its territory does not allow is refused with `secret_not_allowed` (ADR 0013).
- Opens sessions through `AgentRunner` only (ADR 0006, 0021): the plot, the prompt and tool policy of
  `runner-core`, the budget, `.runs/<quest>-<n>`, and the env (§3.9): the minimal env it was given, the
  `ELVARIA_*` context of the hook and exactly the quest's `secrets_required` from the treasury (`sessionEnv`); a
  name the territory no longer allows or the treasury lacks opens no session. A runner's `capabilities` narrow
  its tribe through `tribeLimitsOf`; a tribe without a runner takes no work.
- Masks what a session leaves behind with that session's secret values and the patterns, before the kingdom
  keeps it: the handover letter (`redactHandover`), the question, and the verifier's output, so the verdict notes
  the next prompt reads hold none (ADR 0013).
- Turns a session's end into the quest's move: submit, a question (`ask`), mana out, a crash, the CLI's turn or
  budget limit (breaker); for a verifier the verdict file, `verdict.*`, the move, and the assignee's reputation
  and tag windows, then `levelChange` (`character.level_up` / `level_down`).
- Tells once when an open quest nobody can take (`quest.unclaimable`, the bell), withdraws it with
  `reason: null`, and keeps the notices in `.state/unclaimable.json` (`readUnclaimable`) for `elvaria quest list`
  and `show`.

## Does not

- Decide: who takes what, who verifies, when a quest may move are pure functions of the domain (`planTick`,
  `transition`, ADR 0002). Choose a verifier the full way (`selectVerifier`, P1-04), validate verdicts, or write
  the owner's return (P1-04).
- Read mana or wake a tribe (P1-05), trip time or token breakers or kill process trees (P1-06), prepare git
  worktrees, commit them or run the territory's checks (P1-07; `folderPlots` gives each quest a folder until
  then), deliver (P1-14) or run catalog scripts (P1-17).
- Read `process.env` or a treasury file itself: the composition root hands it the minimal env and a `Treasury`.
- Import a concrete runner, the registry package or anything of the world layer (§1.3).

## Depends on

- `@elvaria/domain` (state machines, `planTick`, schemas), `@elvaria/store` (files, inbox, lock),
  `@elvaria/eventlog` (log, journals, redaction), `@elvaria/runner-core` (`AgentRunner`, prompts, tool policy).

## How to test

```bash
pnpm --filter @elvaria/steward test
```

Specs build a throwaway kingdom in the OS temp folder (a space in the name) with the default registry read by
path, and run `FakeRunner` for both tribes; a fake verifier hands in its verdict as structured output.
`integration.spec.ts` takes ten quests all the way round (a crash, a failed review, a question, a seal, a
dependency, a hang) and stops the Steward in the middle: the new one loses no quest, every `attempt_log`
entry matches exactly one session, and the replayed log equals the files.
