// The config probe must stop the actual delivery, before its update can run repo programs (SEC-02b).
import { afterEach, expect, it } from 'vitest';

import { forgeBench } from '../__fixtures__/forge-bench.ts';
import { git } from '../__fixtures__/git-plots.ts';
import { questPayload, tickUntil } from '../__fixtures__/kingdom.ts';
import type { ForgeBench } from '../__fixtures__/forge-bench.ts';

let current: ForgeBench | undefined;
afterEach(async () => {
  await current?.remove();
  current = undefined;
});

it('records push_refused and never pushes or opens a pull request for repo programs', async () => {
  current = await forgeBench({
    delivery: { mode: 'pr' },
    leaves: ({ cwd }) => {
      git(cwd, 'config', 'remote.origin.receivepack', 'private-program-value');
      return { 'src/rooms.ts': 'export const rooms = [];\n' };
    },
  });
  const bench = current;
  const steward = await bench.start();
  await bench.kingdom.command('create_quest', questPayload('Config refusal'));
  await tickUntil(
    steward,
    bench.kingdom.clock,
    async () => (await bench.lines('delivery.failed')).length > 0,
  );
  const quest = await bench.kingdom.quest('Config refusal');
  const branch = `quest/${quest.id}`;
  const failures = await bench.lines('delivery.failed');
  expect(failures.map(({ data }) => data)).toEqual([
    {
      quest: quest.id,
      territory: 'dc1-se-team',
      branch,
      stage: 'push',
      reason: 'push_refused',
      detail: 'repo config refused: remote.origin.receivepack',
    },
  ]);
  expect(await bench.lines('delivery.pushed')).toEqual([]);
  expect(bench.remoteTip(branch)).toBe('');
  expect(bench.forge.calls).toEqual([]);
});
