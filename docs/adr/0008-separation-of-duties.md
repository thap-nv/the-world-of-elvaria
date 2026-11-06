# ADR 0008 · Separation of duties: verifier ≠ assignee, fresh session, other model family first, machine checks are the primary judge

- Status: accepted · 2026-11-06
- Related: [implementation-plan.md](../implementation-plan.md) §3.2, §3.12, §9.1 item 17; [verdict.schema.json](../schemas/verdict.schema.json)
- Amended by: [ADR 0020](0020-class-skill-scripture-tags-and-parties.md) (nobody who worked on a party verifies a quest of that party)
- Amended by: [ADR 0022](0022-tests-in-the-world.md) (a judge may edit a disposable scratch plot to break code for the Thử tường ritual)

## Context

Principle 4: the doer never judges. Agents tend to pass their own work and their own family's work. Antigravity also serves Claude and GPT models, so "another CLI" no longer means "another model".

## Decision

- `selectVerifier(quest, candidates, policy)` in domain; the first rule that matches wins:
  1. not the assignee, and not anyone in `attempt_log` with role `assignee` on this quest;
  2. class has `is_verifier` and covers `quest.kind`;
  3. status `idle`, and the character's pool has mana;
  4. prefer another model family (`familyOf(model)`: `claude | gemini | gpt`), then another tribe (account);
  5. same family ⇒ a different model slug is required; if none, `dispatch.verifier_same_family` decides: `machine_only` or wait.
- Machine checks run before the verifier session (`runChecks` picks territory checks by touched paths). Ritual `pass_rule` defaults to `all_checks_and_agent`: any failing check ⇒ fail, whatever the agent says.
- A `machine_only` verdict has `verifier_id: "machine"` and never passes with a failing check.
- The verifier is a fresh top-level session spawned by the Steward: never `--resume`, never a sub-agent. Its prompt holds the quest, `handover.md`, the diff, check results, the ritual and the verifier's scripture; no transcript, no doer journal.
- `vow_no_production`: verifier settings allow Read/Grep/Glob and the territory's check commands only; Edit and Write are denied in settings, not just in the prompt.
- `validateVerdict` rejects a verdict whose `verifier_id` worked on the quest, whose `session_id` is not a verifier attempt in `attempt_log`, or that passes with a failing check. Characters cannot write `verdicts/`.

## Consequences

- Royal-seal verdicts weigh ×3 in reputation.
- The product plan's "tribe opposite to the doer" (§6) reads as "model family opposite to the doer".
