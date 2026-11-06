// Reviews in a fake day: who judges a submitted quest, and the verdict the scenario's table draws for it.
// The choice follows the separation of duties (ADR 0008) in its simplest form, until selectVerifier (P1-04):
// a free character of a verifier class for the kind, who never worked on the quest and runs another model;
// another tribe first (the cast gives each tribe a judge, ADR 0011), then the one idle the longest.
import { FAIL_KINDS, currentRun } from '@elvaria/domain';
import type { Character, Quest } from '@elvaria/domain';

import { holds, isFree, noteWaits, schedule, sessionId } from './day.ts';
import { holderOf, step } from './ledger.ts';
import { judged, levelAfterVerdict, verdictIdOf } from './reputation.ts';
import { endSession } from './work.ts';
import type { Day, Happening } from './day.ts';

/** The fail kinds a fake verifier gives (verdict.fail_kind); `other`, `unsafe` and `style` are left to real ones. */
const FAILS = FAIL_KINDS.filter((kind) =>
  ['tests_fail', 'incomplete', 'scope_creep', 'missing_i18n'].includes(kind),
);

const byIdleSince = (a: Character, b: Character): number =>
  Date.parse(a.status_since) - Date.parse(b.status_since) || a.id.localeCompare(b.id);

export function verifierFor(day: Day, quest: Quest): Character | undefined {
  const assignee = day.ledger.character(holderOf(quest, 'assignee'));
  const worked = new Set(
    quest.attempt_log.filter(({ role }) => role === 'assignee').map(({ character }) => character),
  );
  const classes = new Set(
    day.registry.classes
      .filter(({ is_verifier, kinds }) => is_verifier && kinds.includes(quest.kind))
      .map(({ id }) => id),
  );
  const fit = day.ledger
    .characters()
    .filter((c) => classes.has(c.class) && isFree(day, c) && !worked.has(c.id) && c.model !== assignee.model)
    .toSorted(byIdleSince);
  return fit.find(({ tribe }) => tribe !== assignee.tribe) ?? fit[0];
}

/** A submitted session-tier quest with no verifier gets one, whose fresh session opens at once (§3.2). */
export function beginReview(day: Day, quest: Quest): void {
  const verifier = verifierFor(day, quest);
  if (verifier === undefined) return;
  const session = sessionId(day);
  const after = day.ledger.move(
    quest.id,
    { type: 'assign_verifier', verifier: verifier.id, session_id: session },
    'steward',
    {
      [verifier.id]: step('assign_verify', quest.id),
    },
  );
  day.ledger.note({
    type: 'agent.session.start',
    actor: { kind: 'character', id: verifier.id },
    data: { session, model: verifier.model },
    quest: after,
    session,
  });
  const result = day.dice.weighted(day.scenario.verdict);
  schedule(day, day.dice.int(day.scenario.minutes.review), {
    kind: 'verdict',
    quest: quest.id,
    session,
    result,
  });
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
  const why = result === 'fail' ? { fail_kind: day.dice.pick(FAILS) } : {};
  day.ledger.note({
    type: `verdict.${result}`,
    actor: { kind: 'character', id: verifier },
    data: { verdict, ...why },
    quest,
    session,
  });
  const after = day.ledger.move(
    quest.id,
    { type: result === 'pass' ? 'verdict_pass' : 'verdict_fail', session_id: session },
    'verifier',
    {
      [verifier]: step('verdict'),
      [assignee]: judged(quest, verdict, result),
    },
  );
  levelAfterVerdict(day, assignee);
  noteWaits(day, after);
}
