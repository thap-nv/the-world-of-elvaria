// planTick and parties (implementation-plan §3.13; P1-21 (a), (b)): a dependency archived after its delivery stands
// as done, so archiving a party's contract midway holds up nothing; and whoever judged a quest of a party never takes
// work of it. In a blind trial (P1-37) the parts wait for the acceptance part, and a part its party bars every knight
// from is named.
import { describe, expect, it } from 'vitest';

import { NOW, Q1, Q2, Q3, at, character, quest, snapshot } from './__fixtures__/snapshot.ts';
import { partWaitsFor } from '../party/acceptance-quest.ts';
import { planTick } from './plan-tick.ts';
import type { CharacterId } from '../core/ids.ts';
import type { Character } from '../schema/character/character.ts';
import type { Quest } from '../schema/quest/quest.ts';

const takers = (quests: readonly Quest[], characters: readonly Character[]) =>
  planTick(snapshot(quests, characters), NOW).claims.map(({ quest: id, assignee }) => [id, assignee]);

describe('planTick in a party (P1-21)', () => {
  it('counts a dependency archived after its delivery as done, never one archived without (a)', () => {
    const thorn = [character('thorn')];
    const archived = (delivered: boolean): Quest => ({
      ...quest(Q2, { status: 'done' }),
      status: 'archived',
      deliverable: delivered ? { type: 'branch', delivered_at: at(5) } : { type: 'branch' },
    });
    expect(takers([quest(Q1, { dependsOn: [Q2] }), archived(true)], thorn)).toEqual([[Q1, 'thorn']]);
    expect(takers([quest(Q1, { dependsOn: [Q2] }), archived(false)], thorn)).toEqual([]);
  });

  it("never gives a party's part to whoever judged a quest of the party (b)", () => {
    const judge = 'thorn' as CharacterId;
    const contract: Quest = {
      ...quest(Q1, { party: Q1, kind: 'plan', cls: 'mage', status: 'done' }),
      attempt_log: [
        { n: 1, character: judge, role: 'verifier', started_at: at(1), run_dir: `.runs/${Q1}-1/verify` },
      ],
    };
    const part = quest(Q2, { party: Q1, dependsOn: [Q1] });
    expect(takers([contract, part], [character('thorn'), character('kael', { since: 30 })])).toEqual([
      [Q2, 'kael'],
    ]);
  });
});

describe('planTick in a blind trial (P1-37)', () => {
  const contract = quest(Q1, { party: Q1, kind: 'plan', cls: 'mage', status: 'done' });
  const tests = (status: 'open' | 'done', writer?: string): Quest => ({
    ...quest(Q3, { party: Q1, dependsOn: [Q1], status }),
    party_role: 'acceptance',
    ...(writer === undefined ? {} : { assignee: writer as CharacterId }),
  });
  const part = quest(Q2, { party: Q1, dependsOn: partWaitsFor(Q1, Q3) });

  it('starts the parts only once the acceptance part is done, the tests first (iii)', () => {
    const knights = [character('thorn'), character('kael', { since: 30 })];
    expect(takers([contract, tests('open'), part], knights)).toEqual([[Q3, 'thorn']]);
    expect(takers([contract, tests('done', 'thorn'), part], knights)).toEqual([[Q2, 'kael']]);
  });

  it('names a part nobody may take because its party bars every knight, instead of waiting in silence (ii)', () => {
    const plan = planTick(snapshot([contract, tests('done', 'thorn'), part], [character('thorn')]), NOW);
    expect(plan.claims).toEqual([]);
    expect(plan.unclaimable).toEqual([{ quest: Q2, reason: 'party_bars' }]);
  });
});
