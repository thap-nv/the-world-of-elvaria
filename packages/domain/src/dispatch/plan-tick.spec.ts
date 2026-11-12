import { describe, expect, it } from 'vitest';

import { transition } from '../quest/transition.ts';
import { FULL_TRIBE_LIMITS, tribeLimitsOf } from '../tribe/tribe-limits.ts';
import {
  DOCS,
  FLOOR_LAWS,
  GUARDED_LAWS,
  NOW,
  Q1,
  Q2,
  Q3,
  Q4,
  TERRITORY,
  at,
  character,
  claimedBy,
  inReview,
  moved,
  quest,
  returnedTo,
  snapshot,
  territory,
  workingBy,
} from './__fixtures__/snapshot.ts';
import { planTick } from './plan-tick.ts';
import type { TribeId } from '../core/ids.ts';
import type { Character } from '../schema/character/character.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { KingdomSnapshot } from './plan-tick.ts';

const claimsOf = (state: KingdomSnapshot) => planTick(state, NOW).claims;
const takers = (
  quests: readonly Quest[],
  characters: readonly Character[],
  more: Partial<KingdomSnapshot> = {},
) => claimsOf(snapshot(quests, characters, more)).map(({ quest: id, assignee }) => [id, assignee]);

const NO_TOOL_GATE = tribeLimitsOf({
  headless: true,
  context_file: true,
  events: true,
  tool_gate: false,
  usage: true,
  structured_output: true,
  resume: true,
  compact: true,
  subagent: true,
});
const CLAUDE = 'claude' as TribeId;

describe('planTick: who takes an open quest', () => {
  it('gives each open quest to a free character of the class it requires', () => {
    const quests = [quest(Q1), quest(Q2, { cls: 'dwarf', territory: DOCS })];
    const characters = [
      character('wren', { cls: 'scribe' }),
      character('thorn'),
      character('brann', { cls: 'dwarf' }),
    ];
    expect(claimsOf(snapshot(quests, characters))).toEqual([
      { quest: Q1, assignee: 'thorn', level: 3 },
      { quest: Q2, assignee: 'brann', level: 3 },
    ]);
  });

  it('claims nothing when nobody of the class is free', () => {
    const busy = ['working', 'suspended', 'sleeping_mana'] as const;
    const characters = [
      character('wren', { cls: 'scribe' }),
      ...busy.map((status, index) => character(`knight-${index}`, { status })),
    ];
    expect(takers([quest(Q1)], characters)).toEqual([]);
  });

  it('never gives a rank-A quest to a level-5 character, however free (canTake)', () => {
    expect(takers([quest(Q1, { rank: 'A' })], [character('thorn', { level: 5 })])).toEqual([]);
  });

  it('leaves out characters of a disabled tribe, and of a tribe with no runner', () => {
    expect(takers([quest(Q1)], [character('vex', { tribe: 'codex' })])).toEqual([]);
    expect(takers([quest(Q1)], [character('thorn')], { limits: {} })).toEqual([]);
  });

  it('leaves out characters of a tribe with a sleeping pool, not those of other tribes', () => {
    const characters = [character('thorn'), character('wren', { cls: 'scribe', tribe: 'gemini' })];
    const quests = [quest(Q1), quest(Q2, { cls: 'scribe' })];
    const geminiAsleep = { asleep: [{ tribe: 'gemini' as TribeId, pool: 'gemini_models' }] };
    expect(claimsOf(snapshot(quests, characters, geminiAsleep)).map(({ assignee }) => assignee)).toEqual([
      'thorn',
    ]);
  });
});

describe('planTick: order', () => {
  it('gives a free character one quest per tick: highest rank first, then the oldest, then by id', () => {
    const thorn = [character('thorn', { level: 6 })];
    expect(takers([quest(Q1, { rank: 'D' }), quest(Q2, { rank: 'B' })], thorn)).toEqual([[Q2, 'thorn']]);
    expect(takers([quest(Q1, { created: 9 }), quest(Q2, { created: 3 })], thorn)).toEqual([[Q2, 'thorn']]);
    expect(takers([quest(Q2), quest(Q1)], thorn)).toEqual([[Q1, 'thorn']]);
  });

  it('takes turns between territories: the one that had a quest taken least recently first', () => {
    const knights = [character('thorn'), character('kael')];
    const earlier = inReview(quest(Q3, { territory: DOCS }), 'brann', 5);
    const later = inReview(quest(Q4), 'ella', 30);
    // dc1-se-team had a quest taken at 09:30, handbook at 09:05: handbook first, though its quest ranks lower.
    const open = [quest(Q1, { rank: 'B' }), quest(Q2, { territory: DOCS, rank: 'E' })];
    expect(takers([...open, earlier, later], knights.slice(0, 1))).toEqual([[Q2, 'thorn']]);
    // Never taken from yet: the territory id decides, then each takes its turn.
    const three = [quest(Q1, { scope: ['a'] }), quest(Q2, { scope: ['b'] }), quest(Q3, { territory: DOCS })];
    expect(takers(three, [...knights, character('ash', { tribe: 'gemini' })])).toEqual([
      [Q1, 'ash'],
      [Q3, 'kael'],
      [Q2, 'thorn'],
    ]);
  });

  it('waits until every quest a quest depends on is done', () => {
    const thorn = [character('thorn')];
    const waiting = [quest(Q1, { dependsOn: [Q2] }), quest(Q2, { status: 'draft' })];
    expect(takers(waiting, thorn)).toEqual([]);
    expect(takers([quest(Q1, { dependsOn: [Q3] })], thorn)).toEqual([]);
    const ready = [quest(Q1, { dependsOn: [Q2] }), quest(Q2, { status: 'done' })];
    expect(takers(ready, thorn)).toEqual([[Q1, 'thorn']]);
  });

  it('hands script-tier quests to the Steward, with no character, and ignores quests that are not open', () => {
    const quests = [
      quest(Q1, { script: true }),
      quest(Q2, { status: 'draft' }),
      quest(Q3, { script: true, rank: 'B' }),
    ];
    const plan = planTick(snapshot(quests, [character('thorn')]), NOW);
    expect(plan).toMatchObject({ claims: [], scripts: [Q3, Q1], script_verdicts: [], unclaimable: [] });
  });

  it('names script-tier runs a Steward left working or in review, and no session-tier one', () => {
    const run = (id: string) =>
      moved(quest(id, { script: true }), 1, ['claim', 'steward', { assignee: null }], ['start', 'steward']);
    const reviewed = moved(run(Q1), 2, ['submit', 'steward']);
    const quests = [run(Q4), reviewed, inReview(quest(Q2), 'thorn'), quest(Q3, { script: true })];
    const plan = planTick(snapshot(quests, [character('thorn')]), NOW);
    expect(plan).toMatchObject({ scripts: [Q3], script_verdicts: [Q4, Q1] });
    // A script still running outside the tick (P1-25) is nobody's to judge yet.
    const background = { running: [Q4], checked: [] };
    expect(planTick(snapshot(quests, [character('thorn')], { background }), NOW)).toMatchObject({
      script_verdicts: [Q1],
    });
  });
});

describe('planTick: limits', () => {
  it("fills a tribe's sessions, verifiers included, and no more (tribe max_concurrent)", () => {
    // claude runs two sessions at once; one knight already works and one judge already reviews.
    const busy = [
      character('ella', { status: 'working' }),
      character('sable', { cls: 'judge', status: 'reviewing' }),
    ];
    expect(takers([quest(Q1)], [...busy, character('thorn')])).toEqual([]);
    expect(takers([quest(Q1), quest(Q2)], [busy[0]!, character('thorn'), character('kael')])).toEqual([
      [Q1, 'kael'],
    ]);
  });

  it('runs no more quests on a territory than it allows, and none on a territory it does not know', () => {
    const one = { territories: [territory(TERRITORY, 1)] };
    const running = workingBy(quest(Q3), 'ella');
    expect(takers([quest(Q1), running], [character('thorn')], one)).toEqual([]);
    expect(takers([quest(Q1), quest(Q2)], [character('thorn'), character('kael')], one)).toEqual([
      [Q1, 'kael'],
    ]);
    expect(takers([quest(Q1, { territory: 'atlas' })], [character('thorn')])).toEqual([]);
  });

  it('keeps a tribe without a tool gate below rank C and off guarded territories (tribeLimitsOf, §3.14)', () => {
    const limited = { limits: { [CLAUDE]: NO_TOOL_GATE } };
    const thorn = [character('thorn', { level: 6 })];
    expect(takers([quest(Q1, { rank: 'C' })], thorn, limited)).toEqual([]);
    expect(takers([quest(Q1, { rank: 'D' })], thorn, limited)).toEqual([[Q1, 'thorn']]);
    for (const laws of [GUARDED_LAWS, FLOOR_LAWS]) {
      const guarded = { ...limited, territories: [territory(TERRITORY, 9, laws)] };
      expect(takers([quest(Q1, { rank: 'D' })], thorn, guarded)).toEqual([]);
      const gated = { territories: [territory(TERRITORY, 9, laws)], limits: { [CLAUDE]: FULL_TRIBE_LIMITS } };
      expect(takers([quest(Q1, { rank: 'D' })], thorn, gated)).toEqual([[Q1, 'thorn']]);
    }
    // P1-19: a runner without a headless mode takes nothing, though kingdom.json enables its tribe.
    const headless = { limits: { [CLAUDE]: { ...FULL_TRIBE_LIMITS, enabled: false } } };
    expect(takers([quest(Q1, { rank: 'F' })], thorn, headless)).toEqual([]);
  });
});

describe('planTick: the other steps', () => {
  it('starts a claimed quest once its dependencies are done and its assignee is free', () => {
    const claimed = claimedBy(quest(Q1, { dependsOn: [Q2] }), 'thorn');
    const plan = (dep: Quest, thorn: Character) => planTick(snapshot([claimed, dep], [thorn]), NOW);
    expect(plan(quest(Q2, { status: 'done' }), character('thorn')).starts).toEqual([Q1]);
    expect(plan(quest(Q2), character('thorn')).starts).toEqual([]);
    expect(plan(quest(Q2, { status: 'done' }), character('thorn', { status: 'working' })).starts).toEqual([]);
  });

  it('starts no claimed script quest (the Steward runs scripts, P1-17) and keeps the started assignee', () => {
    const script = transition(
      quest(Q2, { script: true }),
      { type: 'claim', at: at(5), assignee: null },
      'steward',
    );
    if (!script.ok) throw new Error('fixture');
    const plan = planTick(
      snapshot([claimedBy(quest(Q1), 'thorn'), script.value, quest(Q3)], [character('thorn')]),
      NOW,
    );
    expect(plan).toMatchObject({ starts: [Q1], claims: [] });
  });

  it('gives a returned quest back to its assignee when it is free, before any claim', () => {
    const returned = returnedTo(quest(Q1), 'thorn');
    const plan = planTick(snapshot([returned, quest(Q2)], [character('thorn')]), NOW);
    expect(plan).toMatchObject({ redispatches: [Q1], claims: [] });
    const busy = planTick(snapshot([returned], [character('thorn', { status: 'working' })]), NOW);
    expect(busy.redispatches).toEqual([]);
  });

  it('gives a submitted quest a verifier other than the assignee, and that verifier takes nothing else', () => {
    const judges = [
      character('thorn', { cls: 'judge' }),
      character('sable', { cls: 'judge', model: 'claude-opus-5-5' }),
    ];
    const plan = planTick(snapshot([inReview(quest(Q1), 'thorn')], judges), NOW);
    expect(plan.verifications).toEqual([{ quest: Q1, verifier: 'sable', reason: 'same_family_other_model' }]);
    const reviewing = [inReview(quest(Q1), 'thorn'), quest(Q2, { cls: 'judge' })];
    expect(planTick(snapshot(reviewing, judges.slice(1)), NOW)).toMatchObject({ claims: [] });
    // Nobody fits: the quest waits in review.
    expect(
      planTick(snapshot([inReview(quest(Q1), 'thorn')], [character('kael')]), NOW).verifications,
    ).toEqual([]);
  });

  it('delivers done quests once: not yet delivered, highest rank first, whoever is free or not', () => {
    const delivered = quest(Q3, { status: 'done', rank: 'S' });
    const quests = [
      quest(Q1, { status: 'done' }),
      quest(Q2, { status: 'done', rank: 'A' }),
      { ...delivered, deliverable: { ...delivered.deliverable, delivered_at: at(5) } },
      inReview(quest(Q4), 'thorn'),
    ];
    expect(planTick(snapshot(quests, []), NOW).deliveries).toEqual([Q2, Q1]);
  });

  it('starts or redispatches nothing on a territory the kingdom does not know', () => {
    const lost = [returnedTo(quest(Q1, { territory: 'atlas' }), 'thorn')];
    expect(planTick(snapshot(lost, [character('thorn')]), NOW).redispatches).toEqual([]);
  });

  it('names an open quest nobody can take, and only one whose dependencies are done', () => {
    const quests = [
      quest(Q1, { rank: 'A' }),
      quest(Q2, { cls: 'scribe' }),
      quest(Q3, { rank: 'A', dependsOn: [Q4] }),
    ];
    const plan = planTick(snapshot(quests, [character('thorn', { level: 5 })]), NOW);
    expect(plan.unclaimable).toEqual([
      { quest: Q1, reason: 'level_too_low', best: { character: 'thorn', level: 5, ceiling: 'C' } },
      { quest: Q2, reason: 'no_class' },
    ]);
  });

  it('counts a busy, sleeping or meditating character of the class, never a suspended one or a disabled tribe', () => {
    const asleep = { asleep: [{ tribe: CLAUDE, pool: 'claude' }] };
    const roster = [
      character('thorn', { level: 9, status: 'working' }),
      character('kael', { level: 9, status: 'sleeping_mana' }),
    ];
    expect(planTick(snapshot([quest(Q1, { rank: 'A' })], roster, asleep), NOW).unclaimable).toEqual([]);
    // A tribe whose runner is missing is a setup problem for `elvaria doctor`, not a missing class.
    const noRunner = { limits: {} };
    expect(planTick(snapshot([quest(Q1, { rank: 'A' })], roster, noRunner), NOW).unclaimable).toEqual([]);
    const away = [
      character('thorn', { level: 9, status: 'suspended' }),
      character('vex', { level: 9, tribe: 'codex' }),
    ];
    expect(planTick(snapshot([quest(Q1, { rank: 'A' })], away), NOW).unclaimable).toEqual([
      { quest: Q1, reason: 'no_class' },
    ]);
  });
});

describe('planTick and transition()', () => {
  it('plans claims the state machine accepts, a stretched one waiting for the seal', () => {
    const quests = [quest(Q1, { rank: 'C' }), quest(Q2, { rank: 'C', cls: 'dwarf', territory: DOCS })];
    const characters = [character('kael', { level: 4 }), character('brann', { cls: 'dwarf', level: 3 })];
    const claimed = claimsOf(snapshot(quests, characters)).map(({ quest: id, assignee, level }) => {
      const before = quests.find((candidate) => candidate.id === id)!;
      return transition(before, { type: 'claim', at: at(120), assignee, level }, 'steward');
    });
    expect(claimed).toMatchObject([
      { ok: true, value: { status: 'claimed', assignee: 'kael', seal_required: false } },
      { ok: true, value: { status: 'claimed', assignee: 'brann', seal_required: true } },
    ]);
  });
});
