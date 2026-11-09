// planTick and parties (implementation-plan §3.13; P1-21 (a), (b)): a dependency archived after its delivery stands
// as done, so archiving a party's contract midway holds up nothing; and whoever judged a quest of a party never takes
// work of it.
import { describe, expect, it } from 'vitest';

import { NOW, Q1, Q2, at, character, quest, snapshot } from './__fixtures__/snapshot.ts';
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
