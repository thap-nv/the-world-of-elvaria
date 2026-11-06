// One fake day of a small kingdom, written by the scripted Steward of day-builder.ts: two territories, five
// characters, six quests. It walks the paths a real day takes: a build judged and delivered, a fix that fails
// once, sleeps when Claude's mana runs out and waits for the royal seal, a research quest that asks a question
// and is cancelled, a script-tier quest the machine judges, a draft discarded, and a breaker into the infirmary.
import { CharacterSchema } from '../../schema/character/character.ts';
import { QuestSchema } from '../../schema/quest/quest.ts';
import { TerritorySchema } from '../../schema/territory.ts';
import { poolsOf } from '../mana-view.ts';
import { CAMPAIGNS, KINGDOM, TERRITORIES } from './examples.ts';
import { at, both, dayBuilder, judged, step } from './day-builder.ts';
import type { CharacterId, QuestId, TribeId } from '../../core/ids.ts';
import type { Character } from '../../schema/character/character.ts';
import type { Quest } from '../../schema/quest/quest.ts';
import type { DayLog } from './day-builder.ts';

export const DC1 = TERRITORIES[0]!;
export const ELVARIA = TerritorySchema.parse({
  ...DC1,
  id: 'elvaria',
  name: 'Elvaria',
  path: 'D:/Dummy/Tool - Personal/Kingdom of Agents/the-world-of-elvaria',
});

const CLAUDE = 'claude' as TribeId;
const GEMINI = 'gemini' as TribeId;

function characterOf(id: string, cls: string, tribe: TribeId, model: string, level: number): Character {
  return CharacterSchema.parse({
    version: 1,
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    class: cls,
    tribe,
    model,
    level,
    reputation: { window: [] },
    status: 'idle',
    status_since: '2026-11-06T08:00:00+07:00',
    current: null,
    vow_no_production: cls === 'judge',
    consecutive_fail: { count: 0 },
    stats: { quests_done: 0, tokens_today: 0, tokens_day: '2026-11-06' },
    created_at: '2026-11-05T08:00:00+07:00',
  });
}

export const THORN = 'thorn' as CharacterId;
export const KAEL = 'kael' as CharacterId;
export const BRANN = 'brann' as CharacterId;
export const ELLA = 'ella' as CharacterId;
export const WREN = 'wren' as CharacterId;

interface QuestSpec {
  readonly id: string;
  readonly kind: string;
  readonly rank: string;
  readonly territory: string;
  readonly status?: 'open' | 'draft';
  readonly script?: string;
  readonly cls?: string;
}

const questOf = (spec: QuestSpec, minute: number): Quest =>
  QuestSchema.parse({
    version: 1,
    id: spec.id,
    title: `Quest ${spec.id.slice(-6)}`,
    description: `A ${spec.kind} quest of the fake day.`,
    kind: spec.kind,
    rank: spec.rank,
    territory: spec.territory,
    ...(spec.script === undefined
      ? { class_required: spec.cls ?? 'knight' }
      : { script: { id: spec.script, params: {} } }),
    tags: spec.script === undefined ? ['infra'] : ['docs'],
    status: spec.status ?? 'open',
    tier: spec.script === undefined ? 'session' : 'script',
    assignee: null,
    verifier: null,
    budget: { max_minutes: 45, max_tokens: 400000, max_attempts: spec.script === undefined ? 3 : 1 },
    estimate: { tokens: 200000, minutes: 30 },
    attempts: 0,
    attempt_log: [],
    plot: { type: 'none' },
    deliverable: { type: 'branch' },
    seal_required: false,
    created_by: 'chancellor',
    created_at: at(minute),
    updated_at: at(minute),
  });

export const Q1 = 'q_20261106_a1b2c3' as QuestId;
export const Q2 = 'q_20261106_d4e5f6' as QuestId;
export const Q3 = 'q_20261106_g7h8j9' as QuestId;
export const Q4 = 'q_20261106_k2m4n6' as QuestId;
export const Q5 = 'q_20261106_p3q5r7' as QuestId;
export const Q6 = 'q_20261106_s8t9v0' as QuestId;

export function morning() {
  return {
    kingdom: KINGDOM,
    territories: [DC1],
    characters: [
      characterOf(THORN, 'knight', CLAUDE, 'claude-sonnet-5-5', 3),
      characterOf(KAEL, 'knight', CLAUDE, 'claude-opus-5-5', 6),
      characterOf(BRANN, 'judge', GEMINI, 'gemini-4-argon-high', 1),
      characterOf(ELLA, 'judge', CLAUDE, 'claude-opus-5-5', 1),
    ],
    quests: [],
    campaigns: CAMPAIGNS,
    pools: poolsOf(KINGDOM.tribes),
  };
}

/** A build quest: claimed, judged by another family, done, delivered. */
function buildDelivered(day: ReturnType<typeof dayBuilder>): void {
  day.create(questOf({ id: Q1, kind: 'build', rank: 'D', territory: DC1.id }, 1));
  day.move(Q1, { type: 'claim', assignee: THORN, level: 3 }, 'steward', { [THORN]: step('claim', Q1) });
  day.move(Q1, { type: 'start', session_id: 's-q1-1' }, 'steward');
  day.noise(
    'agent.session.start',
    { kind: 'character', id: THORN },
    { session: 's-q1-1', model: 'claude-sonnet-5-5' },
    Q1,
  );
  day.noise('agent.tool', { kind: 'character', id: THORN }, { tool: 'write', path: 'package.json' }, Q1);
  day.move(Q1, { type: 'submit', session_id: 's-q1-1', tokens: 120000 }, 'runner', {
    [THORN]: step('submit'),
  });
  day.move(Q1, { type: 'assign_verifier', verifier: BRANN, session_id: 's-q1-v' }, 'steward', {
    [BRANN]: step('assign_verify', Q1),
  });
  day.move(Q1, { type: 'verdict_pass', session_id: 's-q1-v' }, 'verifier', {
    [BRANN]: step('verdict'),
    [THORN]: judged(`${Q1}-1`, 'pass'),
  });
  day.noise('verdict.pass', { kind: 'character', id: BRANN }, { verdict: `${Q1}-1` }, Q1);
  day.move(Q1, { type: 'deliver' }, 'steward');
}

/** A fix above Thorn's ceiling (seal), failed once, paused when Claude sleeps, then sealed by the owner. */
function fixSealed(day: ReturnType<typeof dayBuilder>): void {
  day.create(questOf({ id: Q2, kind: 'fix', rank: 'C', territory: DC1.id }, 10));
  day.move(Q2, { type: 'claim', assignee: THORN, level: 3 }, 'steward', { [THORN]: step('claim', Q2) });
  day.move(Q2, { type: 'start' }, 'steward');
  day.move(Q2, { type: 'submit' }, 'runner', { [THORN]: step('submit') });
  day.move(Q2, { type: 'assign_verifier', verifier: BRANN }, 'steward', {
    [BRANN]: step('assign_verify', Q2),
  });
  day.move(Q2, { type: 'verdict_fail' }, 'verifier', {
    [BRANN]: step('verdict'),
    [THORN]: judged(`${Q2}-1`, 'fail'),
  });
  day.move(Q2, { type: 'redispatch' }, 'steward', { [THORN]: step('claim', Q2) });
  day.reading(CLAUDE, 'claude', {
    window: 'five_hour',
    used_pct: 97,
    resets_at: at(200),
    source: 'rate_limits',
  });
  day.noise(
    'mana.signal',
    { kind: 'character', id: THORN },
    { error: 'rate_limit', source: 'api_retry' },
    Q2,
  );
  day.move(Q2, { type: 'mana_out' }, 'mana', { [THORN]: step('mana_out') });
  day.sleep(CLAUDE, 'claude', true);
  day.character(ELLA, 'character.sleep', step('mana_out'));
}

/** Wakes Claude: the paused fix goes on in a fresh session, is judged by Ella and sealed. */
function wakeAndSeal(day: ReturnType<typeof dayBuilder>): void {
  day.sleep(CLAUDE, 'claude', false);
  day.reading(CLAUDE, 'claude', { window: 'five_hour', used_pct: 12, resets_at: null, source: 'estimate' });
  day.move(Q2, { type: 'mana_restored' }, 'mana', { [THORN]: step('mana_restored') });
  day.character(ELLA, 'character.wake', step('mana_restored'));
  day.move(Q2, { type: 'submit' }, 'runner', { [THORN]: step('submit') });
  day.move(Q2, { type: 'assign_verifier', verifier: ELLA }, 'steward', { [ELLA]: step('assign_verify', Q2) });
  day.move(Q2, { type: 'verdict_pass' }, 'verifier', {
    [ELLA]: step('verdict'),
    [THORN]: judged(`${Q2}-2`, 'pass'),
  });
  day.noise('command.applied', { kind: 'steward' }, { command_id: '01JCFB7Q2R8S4T6V9W3X5Y1Z0A' });
  day.move(Q2, { type: 'seal', note: 'ok' }, 'user', { [THORN]: judged(`${Q2}-2`, 'pass', true) });
}

/** Research on the second territory by a newly summoned scribe: a question, an answer, a crash, cancelled. */
function researchCancelled(day: ReturnType<typeof dayBuilder>): void {
  day.territory(ELVARIA, 'territory.attached');
  day.summon(characterOf(WREN, 'scribe', GEMINI, 'gemini-4-argon-medium', 1));
  day.create(questOf({ id: Q3, kind: 'research', rank: 'F', territory: ELVARIA.id, cls: 'scribe' }, 30));
  day.move(Q3, { type: 'claim', assignee: WREN, level: 1 }, 'steward', { [WREN]: step('claim', Q3) });
  day.move(Q3, { type: 'start' }, 'steward');
  day.move(Q3, { type: 'ask', question: 'Bản EN dùng giọng nào?' }, 'runner', { [WREN]: step('ask') });
  day.move(Q3, { type: 'answer', answer: 'Giọng trang trọng.' }, 'user', { [WREN]: step('claim', Q3) });
  day.move(Q3, { type: 'crash' }, 'steward', { [WREN]: step('crash') });
  day.move(Q3, { type: 'cancel' }, 'user');
}

/** A link check the machine runs and judges; a draft the owner discards. */
function scriptAndDraft(day: ReturnType<typeof dayBuilder>): void {
  day.create(questOf({ id: Q4, kind: 'batch', rank: 'E', territory: ELVARIA.id, script: 'link-check' }, 40));
  day.move(Q4, { type: 'claim', assignee: null }, 'steward');
  day.move(Q4, { type: 'start' }, 'steward');
  day.move(Q4, { type: 'submit' }, 'steward');
  day.move(Q4, { type: 'verdict_pass' }, 'steward');
  day.create(
    questOf({ id: Q5, kind: 'plan', rank: 'B', territory: DC1.id, status: 'draft', cls: 'mage' }, 45),
  );
  day.move(Q5, { type: 'discard' }, 'user');
}

/** Kael's refactor trips the time breaker; the owner retries it and hands it to Thorn, who levels up. */
function breakerReassigned(day: ReturnType<typeof dayBuilder>): void {
  day.create(questOf({ id: Q6, kind: 'refactor', rank: 'C', territory: DC1.id }, 50));
  day.move(Q6, { type: 'claim', assignee: KAEL, level: 6 }, 'steward', { [KAEL]: step('claim', Q6) });
  day.move(Q6, { type: 'start' }, 'steward');
  day.character(KAEL, 'character.swamp', step('breaker'));
  day.move(Q6, { type: 'breaker', trip: 'time' }, 'steward', { [KAEL]: step('quest_infirmary') });
  day.move(Q6, { type: 'retry' }, 'user');
  day.move(Q6, { type: 'reassign', assignee: THORN, level: 3 }, 'user', { [THORN]: step('claim', Q6) });
  day.territory({ ...DC1, health: { ci: 'red', open_bugs: 2 } }, 'territory.health');
  day.territory({ ...ELVARIA, surveyed_at: at(70) }, 'territory.surveyed');
  day.character(
    THORN,
    'character.level_up',
    both((thorn, when) => ({ ...thorn, level: 4, level_since: when })),
  );
  day.reading(GEMINI, 'gemini_models', {
    window: 'weekly',
    used_pct: 40,
    resets_at: at(600),
    source: 'rate_limits',
  });
  day.noise('campaign.declared', { kind: 'user' }, { name: 'a type this reader has never seen' });
}

/** The whole day, line by line, with the files after every line. */
export function fakeDay(): DayLog {
  const day = dayBuilder(morning());
  buildDelivered(day);
  fixSealed(day);
  researchCancelled(day);
  wakeAndSeal(day);
  scriptAndDraft(day);
  breakerReassigned(day);
  return day.log();
}
