// Reviews in a fake day: the judge planTick chose (selectVerifier, ADR 0008) opens its fresh session, and the
// verdict the scenario's table draws for it moves the quest. When the machine judges alone (machine_only and no
// judge of another family), its verdict is a pass: a fake day runs no checks.
import { FAIL_KINDS, currentRun, verdictIdOf } from '@elvaria/domain';
import type { CharacterId, QuestId } from '@elvaria/domain';

import { holds, noteWaits, schedule, sessionId } from './day.ts';
import { holderOf, step } from './ledger.ts';
import { judged, levelAfterVerdict } from './reputation.ts';
import { endSession } from './work.ts';
import type { Day, Happening } from './day.ts';

/** The fail kinds a fake verifier gives (verdict.fail_kind); `other`, `unsafe` and `style` are left to real ones. */
const FAILS = FAIL_KINDS.filter((kind) =>
  ['tests_fail', 'incomplete', 'scope_creep', 'missing_i18n'].includes(kind),
);

/** A submitted session-tier quest gets the judge planTick chose, whose fresh session opens at once (§3.2). */
export function beginReview(day: Day, id: QuestId, verifier: CharacterId): void {
  const session = sessionId(day);
  const after = day.ledger.move(id, { type: 'assign_verifier', verifier, session_id: session }, 'steward', {
    [verifier]: step('assign_verify', id),
  });
  day.ledger.note({
    type: 'agent.session.start',
    actor: { kind: 'character', id: verifier },
    data: { session, model: day.ledger.character(verifier).model },
    quest: after,
    session,
  });
  const result = day.dice.weighted(day.scenario.verdict);
  schedule(day, day.dice.int(day.scenario.minutes.review), { kind: 'verdict', quest: id, session, result });
}

/** The verifier's verdict: its line, then the quest's move, the assignee's reputation and maybe its level. */
export function finishReview(day: Day, happening: Extract<Happening, { kind: 'verdict' }>): void {
  const quest = day.ledger.quest(happening.quest);
  if (quest.status !== 'review' || !holds(quest, 'verifier', happening.session)) return;
  const { session, result } = happening;
  const verifier = holderOf(quest, 'verifier');
  const assignee = holderOf(quest, 'assignee');
  const verdict = verdictIdOf(quest, currentRun(quest));
  endSession(day, quest, 'verifier', { session, outcome: 'completed' });
  const outcome = result === 'fail' ? { result, fail_kind: day.dice.pick(FAILS) } : { result };
  day.ledger.note({
    type: `verdict.${result}`,
    actor: { kind: 'character', id: verifier },
    data: { verdict, ...(outcome.result === 'fail' ? { fail_kind: outcome.fail_kind } : {}) },
    quest,
    session,
  });
  const after = day.ledger.move(
    quest.id,
    { type: result === 'pass' ? 'verdict_pass' : 'verdict_fail', session_id: session },
    'verifier',
    {
      [verifier]: step('verdict'),
      [assignee]: judged(quest, verdict, outcome),
    },
  );
  levelAfterVerdict(day, assignee);
  noteWaits(day, after);
}

/** The machine's verdict on a submitted quest nobody of another family can judge (§3.2 machine_only). */
export function machineJudges(day: Day, id: QuestId): void {
  const quest = day.ledger.quest(id);
  const assignee = holderOf(quest, 'assignee');
  const verdict = verdictIdOf(quest, currentRun(quest));
  day.ledger.note({ type: 'verdict.pass', actor: { kind: 'steward' }, data: { verdict }, quest });
  const after = day.ledger.move(id, { type: 'verdict_pass' }, 'steward', {
    [assignee]: judged(quest, verdict, { result: 'pass' }),
  });
  levelAfterVerdict(day, assignee);
  noteWaits(day, after);
}
