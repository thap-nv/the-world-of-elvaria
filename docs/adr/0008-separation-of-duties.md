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
  5. never the assignee's own model slug. With no free judge of another family, `dispatch.verifier_same_family` decides: `different_model` takes a free judge of the same family on another model (or waits for one); `machine_only` never takes a same-family judge, waits while the roster still has a judge of another family (busy or asleep), and lets the machine judge once it has none. (Amended 2026-11-07, P1-04: read as the kingdom schema describes the setting; the earlier wording allowed a same-family judge under `machine_only` too.)
  6. (Amended 2026-11-10, P1-38) not a judge a breaker stopped in this run's review (since the owner's last retry) while another judge the policy allows may take it, free now or later; with no other, it may judge again, and `REVIEW_BREAKS_MAX` bounds the review. Neither the machine nor a waiting quest stands in for it.
- Machine checks run before the verifier session (`runChecks` picks territory checks by touched paths). Ritual `pass_rule` defaults to `all_checks_and_agent`: any failing check ⇒ fail, whatever the agent says. (Amended 2026-11-10, P1-38: the run's next judge reuses them while the quest's branch head is the commit they ran on; a moved head, a plot without git and a judge in a scratch plot get a run of their own.) (Amended 2026-11-10, P1-42: the run's next judge in a scratch plot reuses the last judge's trial too while the head stays, in a fresh scratch plot of its own.)
- A `machine_only` verdict has `verifier_id: "machine"` and never passes with a failing check.
- The verifier is a fresh top-level session spawned by the Steward: never `--resume`, never a sub-agent. Its prompt holds the quest, `handover.md`, the diff, check results, the ritual and the verifier's scripture; no transcript, no doer journal.
- `vow_no_production`: verifier settings allow Read/Grep/Glob and the territory's check commands only; Edit and Write are denied in settings, not just in the prompt. (Amended 2026-11-10, P1-44: a check's command may still write in the plot, a generator or a formatter; outside a scratch plot the Steward puts the quest's plot back to its commit once the judge's session is over, and a `plot.restored` line says what went.)
- `validateVerdict` rejects a verdict whose `verifier_id` worked on the quest, whose `session_id` is not a verifier attempt in `attempt_log`, or that passes with a failing check. Characters cannot write `verdicts/`. (Amended 2026-11-10, P1-40: the Steward also refuses a judge's pass without notes, and the owner may return a quest for a new judgement, `verdict.rejudge`, which counts in neither the assignee's reputation nor its fail streak.)

## Consequences

- Royal-seal verdicts weigh ×3 in reputation.
- The product plan's "tribe opposite to the doer" (§6) reads as "model family opposite to the doer".
