// The machine half of the council's plan review (PS-06, ADR 0028): planIssuesOf in the subquests check, before the
// judge and at the delivery, and the one seal a plan waits for before its sub-quests open.
import { readFile } from 'node:fs/promises';

import { inKingdom } from '@elvaria/store';
import { afterEach, describe, expect, it } from 'vitest';

import { CAST, bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { delivered, leavingRunners } from './__fixtures__/deliver.ts';
import { templated } from './__fixtures__/template.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Steward } from './types.ts';
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

/** A knight's rank D build on dc1-se-team in the quest template, scoped to `scope`, unless `fields` say otherwise. */
const draft = (ref: string, scope: readonly string[], fields: Record<string, unknown> = {}) => ({
  ref,
  title: `Part ${ref}`,
  description: templated(`Sub-quest ${ref} of the plan.`),
  kind: 'build',
  rank: 'D',
  territory: 'dc1-se-team',
  tier: 'session',
  class_required: 'knight',
  tags: ['backend'],
  scope_paths: [...scope],
  depends_on_refs: [],
  estimate: { tokens: 200_000, minutes: 30, context: 80_000 },
  secrets_required: [],
  ...fields,
});

const list = (...drafts: readonly unknown[]) => JSON.stringify({ version: 1, drafts });

const planPayload = (title: string, fields: Record<string, unknown> = {}) =>
  questPayload(title, { kind: 'plan', class_required: 'mage', tags: ['backend'], ...fields });

async function open(files: Readonly<Record<string, string>>) {
  current = await bench({ cast: [...CAST, ...MAGES] });
  const kingdom = current;
  const leaves = (req: { readonly quest?: Quest }) => {
    const text = files[req.quest?.title ?? ''];
    return text === undefined ? {} : { 'subquests.json': text };
  };
  running = kingdom.steward({ runners: leavingRunners(kingdom, leaves) });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom, steward: running };
}

describe('the subquests check holds a plan to planIssuesOf (PS-06)', () => {
  it('returns a plan the machine finds not ready as incomplete, though its judge passes it', async () => {
    const cases: Readonly<Record<string, readonly [string, string]>> = {
      'Parts that meet': [
        list(draft('d1', ['apps/api/**']), draft('d2', ['apps/api/src/orders.ts'])),
        '- d1 and d2 may run at once and their scopes meet',
      ],
      'A part without scope': [
        list(draft('d1', ['apps/api/**']), { ...draft('d2', []), scope_paths: undefined }),
        '- d2 has no scope_paths',
      ],
      'A part without done': [
        list(draft('d1', ['apps/api/**'], { description: templated('x').replace(/## Done when[^#]*/, '') })),
        '- d1: no "## Done when" section, or it is empty',
      ],
      'Steps not in order': [
        list(
          draft('d1', ['apps/api/**'], {
            description: templated('x').replace('1. Change', '- Change').replace('2. Add', '- Add'),
          }),
        ),
        '- d1: "## Steps" has no numbered step',
      ],
    };
    const { kingdom, steward } = await open(
      Object.fromEntries(Object.entries(cases).map(([title, [text]]) => [title, text])),
    );
    for (const title of Object.keys(cases)) await kingdom.command('create_quest', planPayload(title));
    const judged = async (title: string) =>
      (await kingdom.store.verdicts.read(`${(await kingdom.quest(title)).id}-1` as VerdictId)).ok;
    const titles = Object.keys(cases);
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await Promise.all(titles.map(judged))).every(Boolean),
      150,
    );
    for (const [title, [, reason]] of Object.entries(cases)) {
      const plan = await kingdom.quest(title);
      const verdict = await kingdom.store.verdicts.read(`${plan.id}-1` as VerdictId);
      if (!verdict.ok) throw new Error(`no verdict for ${title}`);
      expect(verdict.value).toMatchObject({ result: 'fail', fail_kind: 'incomplete' });
      const check = verdict.value.checks.find(({ id }) => id === 'subquests');
      expect(check?.pass).toBe(false);
      const log = await readFile(inKingdom(kingdom.root, check?.log_path ?? ''), 'utf8');
      expect(log).toContain('subquests.json: the delivery would open none: the plan is not ready:\n');
      expect(log).toContain(reason);
    }
    expect(await kingdom.quests()).toHaveLength(titles.length);
  });

  it("waits for one seal on a plan that asks for it, then opens its sub-quests, each with its kind's seal", async () => {
    const scribe = draft('d2', ['docs/orders.md'], {
      kind: 'research',
      class_required: 'scout',
      tags: ['docs'],
      depends_on_refs: ['d1'],
    });
    const { kingdom, steward } = await open({
      'Plan the orders': list(draft('d1', ['apps/api/**']), scribe),
    });
    await kingdom.command('create_quest', planPayload('Plan the orders', { seal_required: true }));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await kingdom.quest('Plan the orders')).status === 'awaiting_seal',
    );
    expect(await kingdom.quests()).toHaveLength(1);
    const plan = await kingdom.quest('Plan the orders');
    await kingdom.command('seal', { quest: plan.id });
    await tickUntil(steward, kingdom.clock, delivered(kingdom, 'Plan the orders'));
    // Neither draft says seal_required: each takes its kind's (build: sealed, research: not).
    expect(await kingdom.quest('Part d1')).toMatchObject({
      status: 'open',
      parent_id: plan.id,
      seal_required: true,
      estimate: { tokens: 200_000, minutes: 30 },
    });
    expect((await kingdom.quest('Part d1')).estimate).not.toHaveProperty('context');
    expect(await kingdom.quest('Part d2')).toMatchObject({ status: 'open', seal_required: false });
  });
});
