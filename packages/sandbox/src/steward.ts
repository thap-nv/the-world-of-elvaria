// The scripted Steward of a fake day: one tick per minute, in the order of implementation-plan §3.1. Every decision
// comes from the domain's planTick, the one the real Steward runs: suspensions, judges (selectVerifier), returned
// quests sent back, claims; what characters then do comes from the scenario's table. Every move goes through
// transition(), so the day obeys the same machine.
import { FULL_TRIBE_LIMITS, currentRun, planTick, verdictIdOf } from '@elvaria/domain';
import type { Quest, TickPlan } from '@elvaria/domain';

import { noteWaits, schedule } from './day.ts';
import { holderOf, step } from './ledger.ts';
import { manaTick } from './mana.ts';
import { ownerActs } from './owner.ts';
import { beginReview, finishReview, machineJudges } from './review.ts';
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

/**
 * planTick on the day's files. The fake runners of a day can do everything a real one declares, so every tribe
 * has full limits (tribeLimitsOf, §3.14).
 */
function planOf(day: Day): TickPlan {
  const snapshot = {
    kingdom: day.kingdom,
    territories: day.ledger.source().territories,
    registry: day.registry,
    quests: day.ledger.quests(),
    characters: day.ledger.characters(),
    asleep: day.ledger.pools().filter((pool) => pool.asleep),
    limits: Object.fromEntries(day.kingdom.tribes.map(({ id }) => [id, FULL_TRIBE_LIMITS])),
  };
  return planTick(snapshot, day.clock.now());
}

/** A session of the assignee opens on the quest: a claimed quest starts, a returned one goes back (§2.5). */
function reopen(day: Day, id: Quest['id'], type: 'start' | 'redispatch'): void {
  const assignee = holderOf(day.ledger.quest(id), 'assignee');
  openSession(day, (session) =>
    day.ledger.move(id, { type, session_id: session }, 'steward', { [assignee]: step('claim', id) }),
  );
}

/** Steps 4–6 as planTick decided them; the plot and the session of a claim follow in the same tick (§3.1, §3.3). */
function carryOut(day: Day, plan: TickPlan): void {
  for (const id of plan.suspensions) day.ledger.change(id, 'character.suspend', step('fail_streak'));
  for (const quest of plan.starts) reopen(day, quest, 'start');
  for (const { quest, verifier } of plan.verifications) beginReview(day, quest, verifier);
  for (const quest of plan.machine_verdicts) machineJudges(day, quest);
  for (const quest of plan.redispatches) reopen(day, quest, 'redispatch');
  // A fake day moves the character with the claim, the session following in the same minute.
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
  carryOut(day, planOf(day));
  deliveries(day);
}
