# ADR 0034 · One heal per run: a commit the hooks refuse goes back once, to its doer or to a healer

- Status: proposed · 2026-11-25
- Amends (once accepted): [ADR 0030](0030-cut-session-with-progress-goes-on.md) (the `commit` trip no longer always stops), [ADR 0016](0016-registry-data-not-code.md) (class flag `is_healer`)
- Related: [plans/healer.md](../plans/healer.md); [ADR 0008](0008-separation-of-duties.md), [ADR 0017](0017-one-quest-one-context-three-tiers.md); rule (F) of [plans/phase-2-plan.md](../plans/phase-2-plan.md); owner's (513) and (515), implementation-plan §11 (2026-11-25)

## Context

A finished session whose submit commit the territory's hooks refuse sends its quest to the infirmary, and the owner fixes a few lines by hand: 5 of the kingdom's 42 infirmary lines (2026-11-07 to 11-25), all of one Codex knight on a first run; the three with a log are lint errors, 28 to 43 lines that name file, line and rule. ADR 0030 let a ceiling's cut go on and kept every other trip for the owner. The owner asked for both a way back to the doer and a new class, the healer, that mends such work in a short, cheap session.

## Decision

- **One heal per run.** `healCallOf` (domain, pure) lets a refusal go back when its reason is in `HEALABLE_REASONS` (`breaker:commit`, `breaker:commit_errors`), the quest is a character's, `kingdom.heal.enabled` holds and the run `n` has had no heal. The quest moves `working.breaker.heal_due` to `returned` with no bell; the doer's entry keeps `heal: "due"`. A second refusal in the run goes to the infirmary.
- **Who heals** is `selectHealer`'s call from the roster: an idle character of a class with `is_healer` whose model family is already among the quest's doers; one that is busy is waited for; with none, the doer heals its own work in a fresh session of the same run (`returned.redispatch`, `attempts` unchanged).
- **A heal session has ceilings of its own** (`kingdom.heal.tokens`, `minutes`), never the quest's, and no continuation: cut, crashed or refused again, the quest goes to the infirmary with the bell.
- **The healer works in a new status, `healing`**, in the quest's plot, as a session of role `assignee` of the same run, marked `heal: "session"`; `quest.assignee` does not change. So it is a doer of the quest by the letter of ADR 0008: rule 1 keeps it from judging the quest and its party, with no change in `verify/`.
- **What the healer changed is measured, not trusted**: the difference between the staged tree as its session opens and the tree as it ends, kept as `heal.patch` and shown to the judge. Past `kingdom.heal.max_files` or `max_lines`, or outside the files the doer's work staged, the plot is put back and the quest goes to the infirmary.
- The Steward's commit through the territory's hooks stays the machine judge of a heal (ADR 0017): no model decides that a heal worked.
- `secrets`, `forbidden_paths`, `no_session`, a refused patch and a failed setup are never healed and open no session.

## Alternatives

- The doer only ((513) alone): no cheap model for work an Opus character left, and nobody to write a diagnosis later.
- The healer for every quest: a Sonnet healer on a GPT doer's quest moves the preferred judge from the Claude family to Gemini (rule 4 of ADR 0008) and spends the Claude window on quests that cost it nothing today.
- A third role `healer`: some 76 places branch on `assignee` against `verifier`, and an unlisted third role would take the judge's side of each.

## Consequences

- The infirmary keeps its meaning: stopped, the owner decides. A quest being healed is `returned` or `healing`.
- Data added, all optional (versions stay 1): `classes[].is_healer`, `kingdom.heal`, quest status `healing`, `attempt_log[].heal`, event types `quest.heal_due` and `quest.healing`, reason codes `heal:*`.
- A kingdom without a healer still heals through the doer; summoning one turns the healer on.
