// Mana in a fake day (implementation-plan §3.5, ADR 0009): a reading of every awake pool now and then, and in
// the mana-out day one tribe running dry. Then the whole pool sleeps: its running quests pause and keep their
// assignee, a verifier leaves its review with a partial verdict, idle characters fall asleep. When the probe
// succeeds the pool wakes, paused quests go on in a fresh session of the same attempt, sleepers wake.
import { currentRun } from '@elvaria/domain';
import type { CharacterId, Instant, PoolKey, Quest } from '@elvaria/domain';

import { sessionOf, tribeAsleep } from './day.ts';
import { holderOf, step } from './ledger.ts';
import { verdictIdOf } from './reputation.ts';
import { endSession, openSession } from './work.ts';
import type { Day } from './day.ts';
import type { ReadingData } from './ledger.ts';

/** Minutes between two readings of every pool. */
const READING_EVERY = 90;
/** Statuses of a quest still in play: while one is, the gauges are read; an idle evening reads nothing. */
const IN_PLAY: readonly Quest['status'][] = [
  'open',
  'claimed',
  'working',
  'review',
  'returned',
  'blocked',
  'awaiting_seal',
  'paused_mana',
];
const FIVE_HOURS_MS = 5 * 3_600_000;
/** Without `budget.tokens_5h` in kingdom.json, the estimate gauge measures against this much. */
const DEFAULT_TOKENS_5H = 4_000_000;
/** The doomed pool climbs to this share of its window by the time it runs dry. */
const BEFORE_EMPTY_PCT = 95;
const FLOOR_PCT = 2;
const MAX_PCT = 99;

const poolsOf = (day: Day, tribe: string): PoolKey[] =>
  day.ledger
    .pools()
    .filter((pool) => pool.tribe === tribe)
    .map(({ tribe: id, pool }) => ({ tribe: id, pool }));

function usedPct(day: Day, tribe: string): number {
  const out = day.scenario.manaOut;
  const minute = day.clock.minute();
  if (out?.tribe === tribe && minute < out.at) return Math.round((BEFORE_EMPTY_PCT * minute) / out.at);
  const budget = day.kingdom.tribes.find(({ id }) => id === tribe)?.budget?.tokens_5h ?? DEFAULT_TOKENS_5H;
  return Math.min(MAX_PCT, FLOOR_PCT + Math.round((100 * (day.tokens.get(tribe) ?? 0)) / budget));
}

/** An account with several pools reports them itself (agy /usage); a one-pool account is estimated (§3.5). */
function readingOf(day: Day, tribe: string): ReadingData {
  const used_pct = usedPct(day, tribe);
  const pooled = day.kingdom.tribes.find(({ id }) => id === tribe)?.pools !== undefined;
  if (!pooled) return { window: 'five_hour', used_pct, source: 'estimate' };
  const resets_at = day.zoned.format((day.clock.now() + FIVE_HOURS_MS) as Instant);
  return { window: 'five_hour', used_pct, resets_at, source: 'rate_limits' };
}

function readAll(day: Day): void {
  const awake = day.kingdom.tribes.filter(({ enabled, id }) => enabled && !tribeAsleep(day, id));
  for (const { id } of awake) for (const key of poolsOf(day, id)) day.ledger.reading(key, readingOf(day, id));
}

const ofTribe = (day: Day, tribe: string, id: CharacterId | null | undefined): boolean =>
  typeof id === 'string' && day.ledger.character(id).tribe === tribe;

const inStatusOf = (day: Day, status: Quest['status'], role: 'assignee' | 'verifier', tribe: string) =>
  day.ledger.quests().filter((quest) => quest.status === status && ofTribe(day, tribe, quest[role]));

/** The session that reports the rate limit: the first running one of the tribe (§3.5: the in-band signal). */
function signal(day: Day, quest: Quest): void {
  const id = holderOf(quest, 'assignee');
  const data = { error: 'rate_limit', source: 'api_retry' };
  day.ledger.note({
    type: 'mana.signal',
    actor: { kind: 'character', id },
    data,
    quest,
    session: sessionOf(quest, 'assignee'),
  });
}

function pause(day: Day, quest: Quest): void {
  const session = sessionOf(quest, 'assignee');
  endSession(day, quest, 'assignee', { session, outcome: 'killed' });
  const assignee = holderOf(quest, 'assignee');
  day.ledger.move(quest.id, { type: 'mana_out', session_id: session }, 'mana', {
    [assignee]: step('mana_out'),
  });
}

/** The verifier stopped by the sleep leaves a partial verdict; the next one reads on from it (§2.5). */
function verifierSleeps(day: Day, quest: Quest): void {
  const verifier = holderOf(quest, 'verifier');
  const session = sessionOf(quest, 'verifier');
  endSession(day, quest, 'verifier', { session, outcome: 'killed' });
  const data = { verdict: verdictIdOf(quest, currentRun(quest)), progress: { checked_until: 'README.md' } };
  day.ledger.note({
    type: 'verdict.partial',
    actor: { kind: 'character', id: verifier },
    data,
    quest,
    session,
  });
  day.ledger.move(quest.id, { type: 'mana_out', session_id: session }, 'mana', {
    [verifier]: step('mana_out'),
  });
}

function exhaust(day: Day, tribe: string): void {
  const working = inStatusOf(day, 'working', 'assignee', tribe);
  if (working[0] !== undefined) signal(day, working[0]);
  for (const key of poolsOf(day, tribe)) {
    day.ledger.reading(key, { window: 'five_hour', used_pct: 100, source: 'signal' });
    day.ledger.sleep(key, true);
  }
  for (const quest of working) pause(day, quest);
  for (const quest of inStatusOf(day, 'review', 'verifier', tribe)) verifierSleeps(day, quest);
  for (const character of day.ledger.characters().filter((c) => c.tribe === tribe && c.status === 'idle')) {
    day.ledger.change(character.id, 'character.sleep', step('mana_out'));
  }
}

function restore(day: Day, tribe: string): void {
  day.ledger.note({ type: 'mana.probe', actor: { kind: 'steward' }, data: { tribe, result: 'ok' } });
  day.tokens.set(tribe, 0);
  for (const key of poolsOf(day, tribe)) {
    day.ledger.sleep(key, false);
    day.ledger.reading(key, readingOf(day, tribe));
  }
  for (const quest of inStatusOf(day, 'paused_mana', 'assignee', tribe)) {
    const assignee = holderOf(quest, 'assignee');
    openSession(day, (session) =>
      day.ledger.move(quest.id, { type: 'mana_restored', session_id: session }, 'mana', {
        [assignee]: step('mana_restored'),
      }),
    );
  }
  const sleepers = day.ledger.characters().filter((c) => c.tribe === tribe && c.status === 'sleeping_mana');
  for (const character of sleepers) day.ledger.change(character.id, 'character.wake', step('mana_restored'));
}

/**
 * Step 2 of a tick (§3.1): the gauges are read in the morning and while quests are in play; in the mana-out day
 * the pool runs dry, then wakes.
 */
export function manaTick(day: Day): void {
  const minute = day.clock.minute();
  const inPlay = day.ledger.quests().some(({ status }) => IN_PLAY.includes(status));
  if (minute % READING_EVERY === 0 && (minute === 0 || inPlay)) readAll(day);
  const out = day.scenario.manaOut;
  if (out === undefined) return;
  if (minute === out.at && !tribeAsleep(day, out.tribe)) exhaust(day, out.tribe);
  if (minute === out.at + out.asleep && tribeAsleep(day, out.tribe)) restore(day, out.tribe);
}
