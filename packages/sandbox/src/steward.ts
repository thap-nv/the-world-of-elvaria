// The scripted Steward of a fake day: one tick per minute, in the order of implementation-plan §3.1. Claims come
// from the domain's planTick, the one the real Steward runs (P1-03 extends it); what characters then do comes
// from the scenario's table. Every move goes through transition(), so the day obeys the same machine.
import { currentRun, planTick } from '@elvaria/domain';
import type { Quest } from '@elvaria/domain';

import { isFree, noteWaits, schedule } from './day.ts';
import { holderOf, step } from './ledger.ts';
import { manaTick } from './mana.ts';
import { ownerActs } from './owner.ts';
import { verdictIdOf } from './reputation.ts';
import { beginReview, finishReview } from './review.ts';
import { finishWork, openSession, useTool } from './work.ts';
import type { Day, Happening } from './day.ts';

const inStatus = (day: Day, status: Quest['status']): Quest[] =>
  day.ledger.quests().filter((quest) => quest.status === status);

/** A script-tier quest runs in its plot and the machine judges it: no model, no mana, no verifier (§3.12). */
function finishScript(day: Day, happening: Extract<Happening, { kind: 'script' }>): void {
  const quest = day.ledger.quest(happening.quest);
  if (quest.status !== 'working' || currentRun(quest) !== happening.run) return;
  if (happening.result === 'crash') {
    noteWaits(day, day.ledger.move(quest.id, { type: 'crash' }, 'steward'));
    return;
  }
  const submitted = day.ledger.move(quest.id, { type: 'submit' }, 'steward');
  const verdict = verdictIdOf(submitted, happening.run);
  day.ledger.note({
    type: 'verdict.pass',
    actor: { kind: 'steward' },
    data: { verdict, verifier: 'machine' },
    quest: submitted,
  });
  noteWaits(day, day.ledger.move(quest.id, { type: 'verdict_pass' }, 'steward'));
}

/** Step 3: what the runners report this minute. */
function happenings(day: Day): void {
  for (const happening of day.agenda.get(day.clock.minute()) ?? []) {
    if (happening.kind === 'end') finishWork(day, happening);
    else if (happening.kind === 'tool') useTool(day, happening);
    else if (happening.kind === 'verdict') finishReview(day, happening);
    else finishScript(day, happening);
  }
  day.agenda.delete(day.clock.minute());
}

/** Step 4: a submitted session-tier quest without a verifier gets one (§3.2). */
function verifications(day: Day): void {
  for (const quest of inStatus(day, 'review').filter(
    (q) => q.tier === 'session' && typeof q.verifier !== 'string',
  )) {
    beginReview(day, quest);
  }
}

/** Step 5: a returned quest goes back to its assignee, in a fresh session, once the assignee is free. */
function redispatches(day: Day): void {
  for (const quest of inStatus(day, 'returned')) {
    const assignee = holderOf(quest, 'assignee');
    if (!isFree(day, day.ledger.character(assignee))) continue;
    openSession(day, (session) =>
      day.ledger.move(quest.id, { type: 'redispatch', session_id: session }, 'steward', {
        [assignee]: step('claim', quest.id),
      }),
    );
  }
}

/** Step 6: planTick's claims; the plot and the session follow in the same tick (§3.1, §3.3). */
function claims(day: Day): void {
  const asleep = day.ledger.pools().filter((pool) => pool.asleep);
  const snapshot = {
    kingdom: day.kingdom,
    quests: day.ledger.quests(),
    characters: day.ledger.characters(),
    asleep,
  };
  const plan = planTick(snapshot, day.clock.now());
  for (const { quest, assignee, level } of plan.claims) {
    day.ledger.move(quest, { type: 'claim', assignee, level }, 'steward', {
      [assignee]: step('claim', quest),
    });
    openSession(day, (session) => day.ledger.move(quest, { type: 'start', session_id: session }, 'steward'));
  }
  for (const quest of plan.scripts) {
    day.ledger.move(quest, { type: 'claim', assignee: null }, 'steward');
    const started = day.ledger.move(quest, { type: 'start' }, 'steward');
    const result = day.dice.weighted(day.scenario.script);
    schedule(day, day.dice.int(day.scenario.minutes.script), {
      kind: 'script',
      quest,
      run: currentRun(started),
      result,
    });
  }
}

/** Step 7: a quest done and not delivered yet is delivered (§3.9). */
function deliveries(day: Day): void {
  for (const quest of inStatus(day, 'done').filter((q) => q.deliverable.delivered_at === undefined)) {
    day.ledger.move(quest.id, { type: 'deliver' }, 'steward');
  }
}

/** One minute of the day, after the quests that arrived in it were written. */
export function tick(day: Day): void {
  ownerActs(day);
  manaTick(day);
  happenings(day);
  verifications(day);
  redispatches(day);
  claims(day);
  deliveries(day);
}
