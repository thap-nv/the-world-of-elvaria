// The code graph in planning, on the Steward's side (PS-21b): a plan quest's mage reads the impact of its scope, its
// judge the sub-quests free to run at once whose code the graph links, as a warning: the plan still passes. Any other
// quest, or a plan without a graph, reads as before.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { TerritorySchema } from '@elvaria/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { A, fakeGraphs } from './__fixtures__/graphs.ts';
import { CAST, bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { leavingRunners } from './__fixtures__/deliver.ts';
import { templated } from './__fixtures__/template.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Steward } from './types.ts';
import type { Quest, TerritoryId } from '@elvaria/domain';
import type { SpawnRequest } from '@elvaria/runner-core';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

const MAGES = ['merle', 'morgan'].map((id) => ({ id, cls: 'mage' }));

const draft = (ref: string, scope: readonly string[]) => ({
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
});

/** graphify's node-link data: three files outside `apps/api` import from it, and the web page calls the API. */
const GRAPH = {
  nodes: [
    { id: 'orders', source_file: 'apps/api/src/orders.ts' },
    { id: 'page', source_file: 'apps/web/src/orders/page.tsx' },
    { id: 'client', source_file: 'apps/web/src/lib/client.ts' },
    { id: 'seed', source_file: 'scripts/seed.ts' },
  ],
  links: [
    { source: 'page', target: 'orders', relation: 'calls' },
    { source: 'client', target: 'orders', relation: 'imports' },
    { source: 'seed', target: 'orders', relation: 'imports_from' },
  ],
};

async function planned(codeGraph: boolean): Promise<readonly SpawnRequest[]> {
  current = await bench({ cast: [...CAST, ...MAGES] });
  const kingdom = current;
  const read = await kingdom.store.territories.read('dc1-se-team' as TerritoryId);
  if (!read.ok) throw new Error('fixture: no territory dc1-se-team');
  const territory = { ...read.value, vcs: { type: 'git', default_branch: 'main' }, code_graph: codeGraph };
  await kingdom.store.territories.write(TerritorySchema.parse(territory));
  const folder = path.join(kingdom.root, 'graphs here');
  await mkdir(path.join(folder, A), { recursive: true });
  await writeFile(path.join(folder, A, 'graph.json'), JSON.stringify(GRAPH));
  const list = JSON.stringify({
    version: 1,
    drafts: [draft('d1', ['apps/api/**']), draft('d2', ['apps/web/**'])],
  });
  const leaves = (req: { readonly quest?: Quest }) =>
    req.quest?.kind === 'plan' ? { 'subquests.json': list } : {};
  running = kingdom.steward({
    runners: leavingRunners(kingdom, leaves),
    graphs: fakeGraphs(A, [A], folder.replaceAll('\\', '/')),
  });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  const fields = { kind: 'plan', class_required: 'mage', tags: ['backend'], scope_paths: ['apps/api/**'] };
  await kingdom.command('create_quest', questPayload('Plan the orders', fields));
  await kingdom.command('create_quest', questPayload('Fix the orders', { scope_paths: ['docs/**'] }));
  await tickUntil(running, kingdom.clock, async () =>
    (await Promise.all(['Plan the orders', 'Fix the orders'].map((title) => kingdom.quest(title)))).every(
      ({ status }) => status === 'done' || status === 'archived',
    ),
  );
  return kingdom.requests;
}

const requestOf = (requests: readonly SpawnRequest[], title: string, role: string): SpawnRequest => {
  const found = requests.find((req) => req.quest?.title === title && req.role === role);
  if (found === undefined) throw new Error(`no ${role} request for ${title}`);
  return found;
};

describe('a plan quest whose code graph is built (PS-21b)', () => {
  it('gives its mage the impact of its scope and its judge the linked sub-quests, and passes the plan', async () => {
    const requests = await planned(true);
    const mage = requestOf(requests, 'Plan the orders', 'assignee');
    expect(mage.prompt.system).toContain(
      "Impact: 3 files outside this quest's scope use code in it: `apps/web/src/lib/client.ts`, `apps/web/src/orders/page.tsx`, `scripts/seed.ts`.",
    );
    const judge = requestOf(requests, 'Plan the orders', 'verifier');
    expect(judge.prompt.user).toContain('# Sub-quests linked through the code');
    expect(judge.prompt.user).toContain(
      '- `d2` and `d1`: `apps/web/src/orders/page.tsx` (d2) uses `apps/api/src/orders.ts` (d1), and 1 more link between them',
    );
    const fix = requestOf(requests, 'Fix the orders', 'assignee');
    expect(fix.prompt.system).toContain('## Code graph');
    expect(fix.prompt.system).not.toContain('Impact');
    expect(requestOf(requests, 'Fix the orders', 'verifier').prompt.user).not.toContain('Sub-quests linked');
  });

  it('says none of it with the switch off', async () => {
    const requests = await planned(false);
    expect(requestOf(requests, 'Plan the orders', 'assignee').prompt.system).not.toContain('Impact');
    expect(requestOf(requests, 'Plan the orders', 'verifier').prompt.user).not.toContain('Sub-quests linked');
  });
});
