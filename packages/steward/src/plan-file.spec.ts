// The plan file in the subquests check (PS-06b): a plan whose plot holds no plans/*.md, or one that misses a section of
// the template, goes back to its mage whatever its judge says; a plan file that follows it lets the plan through.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { inKingdom, toPortable } from '@elvaria/store';
import type { Quest, VerdictId } from '@elvaria/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { CAST, bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { leavingRunners } from './__fixtures__/deliver.ts';
import { PLAN_FILE, templated } from './__fixtures__/template.ts';
import { folderPlots } from './plots.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Plots, Steward } from './types.ts';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

const MAGES = ['merle', 'morgan', 'mirel'].map((id) => ({ id, cls: 'mage' }));

const LIST = JSON.stringify({
  version: 1,
  drafts: [
    {
      ref: 'd1',
      title: 'Part d1',
      description: templated('The export endpoint.'),
      kind: 'build',
      rank: 'D',
      territory: 'dc1-se-team',
      tier: 'session',
      class_required: 'knight',
      tags: ['backend'],
      scope_paths: ['apps/api/**'],
      depends_on_refs: [],
      estimate: { tokens: 200_000, minutes: 30, context: 80_000 },
      secrets_required: [],
    },
  ],
});

/** Every file under the folder plot, as a git plot lists what its quest changed. */
function touchingPlots(root: string): Plots {
  const plots = folderPlots(root);
  return {
    ...plots,
    touched: async (plot) => {
      const dir = inKingdom(root, plot.path ?? '');
      const entries = await readdir(dir, { recursive: true, withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile())
        .map((entry) => toPortable(path.relative(dir, path.join(entry.parentPath, entry.name))))
        .sort();
    },
  };
}

const CASES: Readonly<Record<string, readonly [Readonly<Record<string, string>>, boolean, string]>> = {
  'No plan file': [{ 'subquests.json': LIST }, false, '\nno plan file: the plan is written to plans/'],
  'A thin plan file': [
    { 'subquests.json': LIST, 'plans/orders.md': PLAN_FILE.replace(/## Summary\n\nSome text\.\n\n/, '') },
    false,
    '\nplans/orders.md lacks "## Summary", or they are empty',
  ],
  'A plan file': [
    { 'subquests.json': LIST, 'plans/orders.md': PLAN_FILE },
    true,
    '\nplan file: plans/orders.md follows the template\n',
  ],
};

describe('the subquests check holds the plan file to its template (PS-06b)', () => {
  it('fails a plan without a plan file, or with one that misses a section, and passes one that has them all', async () => {
    current = await bench({ cast: [...CAST, ...MAGES] });
    const kingdom = current;
    const leaves = (req: { readonly quest?: Quest }) => CASES[req.quest?.title ?? '']?.[0] ?? {};
    running = kingdom.steward({
      runners: leavingRunners(kingdom, leaves),
      plots: touchingPlots(kingdom.root),
    });
    expect(await running.start({ loop: false })).toEqual({ ok: true });
    for (const title of Object.keys(CASES))
      await kingdom.command(
        'create_quest',
        questPayload(title, { kind: 'plan', class_required: 'mage', tags: ['backend'] }),
      );
    const verdictOf = async (title: string) =>
      kingdom.store.verdicts.read(`${(await kingdom.quest(title)).id}-1` as VerdictId);
    const steward = running;
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await Promise.all(Object.keys(CASES).map(verdictOf))).every(({ ok }) => ok),
      150,
    );
    for (const [title, [, pass, line]] of Object.entries(CASES)) {
      const verdict = await verdictOf(title);
      if (!verdict.ok) throw new Error(`no verdict for ${title}`);
      const check = verdict.value.checks.find(({ id }) => id === 'subquests');
      expect([title, check?.pass, verdict.value.result]).toEqual([title, pass, pass ? 'pass' : 'fail']);
      const log = await readFile(inKingdom(kingdom.root, check?.log_path ?? ''), 'utf8');
      expect(log).toContain('subquests.json: the delivery would open 1 sub-quests\n');
      expect(log).toContain(line);
    }
  });
});
