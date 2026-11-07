import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { CAST, bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { delivered, leavingRunners, noteOf } from './__fixtures__/deliver.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Steward, StewardDeps } from './types.ts';
import type { Quest, VerdictId } from '@elvaria/domain';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

const MAGES = ['merle', 'morgan', 'mirel', 'mott'].map((id) => ({ id, cls: 'mage' }));

/** A sub-quest draft of the quest-draft schema, a knight's build on dc1-se-team unless `fields` say otherwise. */
const draft = (ref: string, fields: Record<string, unknown> = {}) => ({
  ref,
  title: `Part ${ref}`,
  description: `Sub-quest ${ref} of the plan.`,
  kind: 'build',
  rank: 'D',
  territory: 'dc1-se-team',
  tier: 'session',
  class_required: 'knight',
  tags: ['db'],
  depends_on_refs: [],
  estimate: { tokens: 60000, minutes: 20 },
  seal_required: false,
  secrets_required: [],
  ...fields,
});

const list = (...drafts: readonly unknown[]) => JSON.stringify({ version: 1, drafts });

const planPayload = (title: string) =>
  questPayload(title, { kind: 'plan', class_required: 'mage', tags: ['backend'] });

/** Plans whose mage leaves `files[title]` as subquests.json (nothing when the title has none). */
async function open(
  files: Readonly<Record<string, string>>,
  more: (k: Bench) => Partial<StewardDeps> = () => ({}),
) {
  current = await bench({ cast: [...CAST, ...MAGES] });
  const kingdom = current;
  const leaves = (req: { readonly quest?: Quest }) => {
    const text = files[req.quest?.title ?? ''];
    return text === undefined ? {} : { 'subquests.json': text };
  };
  running = kingdom.steward({ runners: leavingRunners(kingdom, leaves), ...more(kingdom) });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom, steward: running };
}

const childrenOf = async (kingdom: Bench, parent: Quest) =>
  (await kingdom.quests()).filter((quest) => quest.parent_id === parent.id || quest.created_by === 'council');

describe('delivering a plan: its sub-quests open', () => {
  it('opens every draft of subquests.json as an open child quest, each after what it waits on', async () => {
    const { kingdom, steward } = await open({
      'Plan the orders': list(
        draft('d2', {
          kind: 'document',
          class_required: 'scribe',
          territory: 'handbook',
          tags: ['docs'],
          depends_on_refs: ['d1'],
          parent_ref: 'd1',
          seal_required: true,
        }),
        draft('d1'),
      ),
    });
    await kingdom.command('create_quest', planPayload('Plan the orders'));
    await tickUntil(steward, kingdom.clock, delivered(kingdom, 'Plan the orders'));
    const plan = await kingdom.quest('Plan the orders');
    expect(plan.deliverable).toMatchObject({ type: 'subquests', path: `.runs/${plan.id}-delivery.md` });
    const table = await kingdom.quest('Part d1');
    const docs = await kingdom.quest('Part d2');
    expect(table).toMatchObject({
      status: 'open',
      parent_id: plan.id,
      depends_on: [],
      created_by: 'council',
      class_required: 'knight',
      budget: { max_tokens: 120000 },
    });
    expect(table.id).toMatch(/^q_\d{8}_[0-9a-z]{6}$/);
    expect(docs).toMatchObject({
      status: 'open',
      parent_id: table.id,
      depends_on: [table.id],
      seal_required: true,
    });
    const created = (await openEventLog(kingdom.root).read()).events.filter(
      ({ type, actor }) => type === 'quest.created' && actor.kind === 'steward',
    );
    expect(created.map(({ quest }) => quest)).toEqual([table.id, docs.id]);
    const note = await noteOf(kingdom, plan);
    expect(note).toContain(`- \`${table.id}\` Part d1 (build, rank D, knight)`);
    expect(note).not.toContain('## Merge by hand');
    expect(kingdom.notices.filter(({ kind }) => kind === 'subquests_refused')).toEqual([]);
    // The children are quests like any other: a knight takes the first, the second waits for it.
    await tickUntil(steward, kingdom.clock, async () => (await kingdom.quest('Part d1')).status !== 'open');
    expect((await kingdom.quest('Part d2')).status).toBe('open');
  });

  it('opens the same children when a delivery that failed halfway is tried again', async () => {
    const failing = new Set<string>();
    const { kingdom, steward } = await open({ 'Plan twice': list(draft('d1'), draft('d2')) }, (k) => ({
      store: {
        ...k.store,
        verdicts: {
          ...k.store.verdicts,
          read: (id: VerdictId) =>
            failing.has(id) ? Promise.reject(new Error('disk gone')) : k.store.verdicts.read(id),
        },
      },
    }));
    await kingdom.command('create_quest', planPayload('Plan twice'));
    await steward.tick();
    const plan = await kingdom.quest('Plan twice');
    // The owner's verdict is read only by the delivery here: it fails after the children are written.
    failing.add(`${plan.id}-1-user`);
    await tickUntil(steward, kingdom.clock, async () => (await kingdom.quests()).length === 3);
    expect((await kingdom.quest('Plan twice')).deliverable.delivered_at).toBeUndefined();
    expect(kingdom.warnings.join('\n')).toContain(`${plan.id} deliver: disk gone`);
    failing.clear();
    await steward.tick();
    expect((await kingdom.quest('Plan twice')).deliverable.delivered_at).toBeDefined();
    expect(await kingdom.quests()).toHaveLength(3);
    expect(await childrenOf(kingdom, plan)).toHaveLength(2);
  });

  it('opens none of a list it cannot follow, and the note says why', async () => {
    const cases: Readonly<Record<string, readonly [string | undefined, string]>> = {
      'No list': [undefined, 'no subquests.json at the root of the plot'],
      'Not JSON': ['{', 'subquests.json is not JSON'],
      'Empty list': [
        JSON.stringify({ version: 1, drafts: [] }),
        'subquests.json is no quest-draft file: drafts',
      ],
      'A party': [list(draft('d1', { party_role: 'part', contract: 'api.yaml' })), 'd1 belong to a party'],
      'A question': [list(draft('d1', { question: 'Which database?' })), 'd1 asks a question'],
      'A circle': [
        list(draft('d1', { depends_on_refs: ['d2'] }), draft('d2', { depends_on_refs: ['d1'] })),
        'the drafts wait on each other in a circle',
      ],
      'Unknown tag': [list(draft('d1', { tags: ['blockchain'] })), 'd1 is refused: unknown_tag'],
    };
    const files = Object.fromEntries(
      Object.entries(cases).flatMap(([title, [text]]) => (text === undefined ? [] : [[title, text]])),
    );
    const { kingdom, steward } = await open(files);
    for (const title of Object.keys(cases)) await kingdom.command('create_quest', planPayload(title));
    const titles = Object.keys(cases);
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await Promise.all(titles.map((title) => delivered(kingdom, title)()))).every(Boolean),
      150,
    );
    expect(await kingdom.quests()).toHaveLength(titles.length);
    for (const [title, [, reason]] of Object.entries(cases)) {
      const plan = await kingdom.quest(title);
      expect(await noteOf(kingdom, plan)).toContain(`## Sub-quests\n\nNone opened: ${reason}`);
      // The owner hears it once, the log says it too.
      const rung = kingdom.notices.filter(
        (notice) => notice.kind === 'subquests_refused' && notice.quest.id === plan.id,
      );
      expect(rung).toHaveLength(1);
      expect(rung[0]).toMatchObject({ kind: 'subquests_refused', quest: { id: plan.id, title, rank: 'D' } });
      expect(rung[0]?.kind === 'subquests_refused' ? rung[0].reason : '').toContain(reason);
      expect(kingdom.warnings.join('\n')).toContain(`${plan.id}: delivered, no sub-quest opened: ${reason}`);
    }
  });
});
