// The checks a continuing assignee reads ahead of its work (P1-43, (d) of P1-37): the Steward asks the plot what the
// branch touched, and the prompt names the checks selectChecks picks for it, those the machine will run when the
// session ends. A revived session once wrote stubs for a check that no longer ran on its quest (P1-37 real run).
import { TerritorySchema } from '@elvaria/domain';
import { selectChecks } from '@elvaria/runner-core';
import { afterEach, describe, expect, it } from 'vitest';
import type { TerritoryId } from '@elvaria/domain';

import { bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { plotsWith, questOfRun, unitFails } from './__fixtures__/review.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Plots, Steward } from './types.ts';

const CHECKS = [
  { id: 'lint', run: 'pnpm lint', when: ['**/*.ts'], timeout_minutes: 10 },
  { id: 'unit', run: 'pnpm test', when: ['apps/api/**'], timeout_minutes: 10 },
  { id: 'web', run: 'pnpm --filter web test', when: ['apps/web/**'], timeout_minutes: 10 },
];
const TOUCHED = ['apps/api/src/total.ts'];
const SECTION = '## Machine checks on your work';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

/** The prompts of the assignee's two sessions: its run's unit check fails, so the quest comes back once. */
async function twoSessions(touched: Plots['touched']) {
  const kingdom = await bench();
  current = kingdom;
  const read = await kingdom.store.territories.read('dc1-se-team' as TerritoryId);
  if (!read.ok) throw new Error('fixture: no territory');
  await kingdom.store.territories.write(TerritorySchema.parse({ ...read.value, checks: CHECKS }));
  const check: Plots['check'] = (request) => Promise.resolve([unitFails(questOfRun(request.run_dir))]);
  const steward = kingdom.steward({ plots: plotsWith(kingdom.root, { check, touched }) });
  running = steward;
  expect(await steward.start({ loop: false })).toEqual({ ok: true });
  await kingdom.command('create_quest', questPayload('Fix the total'));
  const assignees = () => kingdom.requests.filter(({ role }) => role === 'assignee');
  await tickUntil(steward, kingdom.clock, () => Promise.resolve(assignees().length === 2));
  return { kingdom, prompts: assignees().map(({ prompt }) => prompt.user) };
}

describe('the checks ahead of a continuing assignee (P1-43)', () => {
  it('are those selectChecks picks for what the branch touched, after the work came back', async () => {
    const asked: string[] = [];
    const { prompts } = await twoSessions((plot) => {
      asked.push(plot.type);
      return Promise.resolve(TOUCHED);
    });
    const [first, returned] = prompts;
    expect(first).not.toContain(SECTION);
    expect(returned).toContain(SECTION);
    const picked = selectChecks(TerritorySchema.shape.checks.parse(CHECKS), TOUCHED).map(({ id }) => id);
    expect(picked).toEqual(['lint', 'unit']);
    expect(returned).toContain('- `lint`: `pnpm lint`\n- `unit`: `pnpm test`\n\n');
    expect(returned).toContain(
      'These run too if your work touches a path they watch: `web` (`apps/web/**`).',
    );
    // Asked before the first session's submit commit (forbidden paths, P1-49), then for the session that goes on: a
    // first session has nothing to go on from.
    expect(asked).toEqual(['folder', 'folder']);
  });

  it('are left out when the plot cannot say what the branch touched, and the session still opens', async () => {
    // The submit commit gets an answer (with none, nothing is committed, P1-49); the prompt that follows gets none.
    let asked = 0;
    const { kingdom, prompts } = await twoSessions(() =>
      (asked += 1) === 1 ? Promise.resolve(TOUCHED) : Promise.reject(new Error('git is gone')),
    );
    expect(prompts[1]).toContain('# The quest came back');
    expect(prompts[1]).not.toContain(SECTION);
    expect(kingdom.warnings).toContainEqual(
      expect.stringContaining('what the branch touched is unknown: git is gone'),
    );
  });
});
