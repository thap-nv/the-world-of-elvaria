// What a plan's list may open (P1-18): parts only from a party's contract quest and nothing else from it, the
// party's quests on one territory, no party within a party. And the plot of a quest waiting for another one not
// merged yet starts on that one's branch (P1-16 proposal (f)).
import { readFile } from 'node:fs/promises';

import { SUBQUESTS_FILE } from '@elvaria/runner-core';
import { inKingdom } from '@elvaria/store';
import { afterEach, describe, expect, it } from 'vitest';

import { git } from './__fixtures__/git-plots.ts';
import { questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { contractPayload, list, part, partyBench, reached, worktreeOf } from './__fixtures__/party.ts';
import type { PartyBench } from './__fixtures__/party.ts';
import type { VerdictId } from '@elvaria/domain';

let current: PartyBench | undefined;

afterEach(async () => {
  await current?.remove();
  current = undefined;
});

const planPayload = (title: string, tags: readonly string[] = ['backend']) =>
  questPayload(title, { kind: 'plan', class_required: 'mage', tags, seal_required: false });

describe('a quest waiting for another one not merged yet (P1-16 proposal (f))', () => {
  it('starts on the branch of the quest it waits for, so the two never conflict when merged in order', async () => {
    const doc = 'docs/architecture.md';
    const child = (ref: string, title: string, fields: Record<string, unknown> = {}) => {
      const { party_role: _role, contract: _contract, ...fieldsOf } = part(ref, title, fields);
      return fieldsOf;
    };
    current = await partyBench({
      'Split the doc': {
        [SUBQUESTS_FILE]: list(
          child('d1', 'First half'),
          child('d2', 'Second half', { depends_on_refs: ['d1'] }),
        ),
      },
      'First half': { [doc]: '# Architecture\n\nFirst half.\n' },
      'Second half': { [doc]: '# Architecture\n\nFirst half.\n\nSecond half.\n' },
    });
    const { kingdom, steward, repo } = current;
    await kingdom.command('create_quest', planPayload('Split the doc', ['docs']));
    await tickUntil(
      steward,
      kingdom.clock,
      reached(() => kingdom.quest('Second half'), 'done'),
      200,
    );

    const first = await kingdom.quest('First half');
    const second = await kingdom.quest('Second half');
    expect(git(repo, 'merge-base', `quest/${second.id}`, `quest/${first.id}`)).toBe(
      git(repo, 'rev-parse', `quest/${first.id}`),
    );
    // The judge of the second reads its own change only.
    expect(git(worktreeOf(second), 'diff', '--name-only', `quest/${first.id}`, 'HEAD')).toBe(doc);
    expect(git(worktreeOf(second), 'log', '-1', '--format=%s')).toBe(`chore: submit ${second.id}`);
  }, 120_000);
});

describe("the party rules on a plan's list (P1-18)", () => {
  it('opens no part but from a contract, nothing else from it, and no part on another territory', async () => {
    const cases: Readonly<Record<string, readonly [Record<string, unknown>, string, string]>> = {
      'Plain plan': [
        planPayload('Plain plan'),
        list(part('d1', 'A part')),
        "d1 are parts of a party: only a party's contract quest opens parts",
      ],
      'Mixed contract': [
        contractPayload('Mixed contract'),
        list(part('d1', 'A part'), { ...part('d2', 'No part'), party_role: undefined, contract: undefined }),
        "d2 are no parts: a party's contract quest opens only its parts",
      ],
      'Nested party': [
        contractPayload('Nested party'),
        list({ ...part('d1', 'Head'), kind: 'plan', class_required: 'mage', party_role: 'contract' }),
        'd1 would head a party: a sub-quest never forms one',
      ],
      'Two lands': [
        contractPayload('Two lands'),
        list(part('d1', 'Here'), part('d2', 'There', { territory: 'handbook' })),
        'the party would break: ',
      ],
    };
    const files = Object.fromEntries(
      Object.entries(cases).map(([title, [, text]]) => [title, { [SUBQUESTS_FILE]: text }]),
    );
    current = await partyBench(files, Object.keys(cases).length);
    const { kingdom, steward } = current;
    for (const [payload] of Object.values(cases)) await kingdom.command('create_quest', payload);
    const logOf = async (title: string) =>
      readFile(
        inKingdom(kingdom.root, `.runs/${(await kingdom.quest(title)).id}-1/checks/subquests.log`),
        'utf8',
      );
    const judged = async (title: string) =>
      (await kingdom.store.verdicts.read(`${(await kingdom.quest(title)).id}-1` as VerdictId)).ok;
    const titles = Object.keys(cases);
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await Promise.all(titles.map(judged))).every(Boolean),
      200,
    );
    for (const [title, [, , reason]] of Object.entries(cases))
      expect(await logOf(title)).toContain(`the delivery would open none: ${reason}`);
    expect(await logOf('Two lands')).toContain('party member in handbook, contract in dc1-se-team');
    expect((await kingdom.quests()).filter(({ party_role: role }) => role === 'part')).toEqual([]);
  }, 120_000);
});
