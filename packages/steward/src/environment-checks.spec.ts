// Checks that failed because of their environment (P1-54, (c) of the P1-50 report): Docker down, a container another
// quest's reset removed. No judge reads them, nobody's level moves, no quest hunts a flake; the bell tells the owner
// once per run, and the checks run again ENVIRONMENT_RECHECK_MINUTES later.
import { ENVIRONMENT_RECHECK_MINUTES } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload, settled, tickUntil } from './__fixtures__/kingdom.ts';
import { plotsWith, questOfRun, statusIs, unitFails } from './__fixtures__/review.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Steward, StewardDeps } from './types.ts';
import type { CheckRun } from '@elvaria/runner-core';

let current: Bench | undefined;
let running: Steward | undefined;

async function open(overrides: (kingdom: Bench) => Partial<StewardDeps>) {
  current = await bench();
  running = current.steward(overrides(current));
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running };
}

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

const GONE = 'dependency db failed to start: No such container: 3f1c';

/** The e2e check of run 1 of `quest`, failed because another quest's reset removed its database. */
const e2eGone = (quest: string): CheckRun => ({
  ...unitFails(quest),
  id: 'e2e' as CheckRun['id'],
  log_path: `.runs/${quest}-1/checks/e2e.log`,
  environment: GONE,
});

const typesOf = async (kingdom: Bench) =>
  (await openEventLog(kingdom.root).read()).events.map(({ type }) => type);

describe('checks that failed because of their environment', () => {
  it('get no judge, move no level, open no quest, ring once and run again later until they pass', async () => {
    let gone = true;
    const calls: string[] = [];
    const { kingdom, steward } = await open((k) => ({
      plots: plotsWith(
        k.root,
        { check: (request) => Promise.resolve(gone ? [e2eGone(questOfRun(request.run_dir))] : []) },
        calls,
      ),
    }));
    const checksRun = () => calls.filter((call) => call.startsWith('check ')).length;
    const rung = () => kingdom.notices.filter(({ kind }) => kind === 'environment');
    await kingdom.command('create_quest', questPayload('Docker down'));
    await tickUntil(steward, kingdom.clock, () => Promise.resolve(rung().length > 0));
    const quest = await kingdom.quest('Docker down');
    expect(quest).toMatchObject({ status: 'review', verifier: null });
    expect(rung()).toEqual([
      {
        kind: 'environment',
        quest: { id: quest.id, title: 'Docker down', rank: quest.rank },
        check: 'e2e',
        line: GONE,
        log_path: `.runs/${quest.id}-1/checks/e2e.log`,
        recheck_minutes: ENVIRONMENT_RECHECK_MINUTES,
      },
    ]);
    expect(kingdom.warnings.join('\n')).toContain('its checks failed because of their environment (e2e: ');
    // Before the recheck is due nothing runs, and no judge comes.
    const first = checksRun();
    for (let minute = 1; minute < ENVIRONMENT_RECHECK_MINUTES; minute += 1) {
      await steward.tick();
      await settled(steward);
      kingdom.clock.advance(1);
    }
    expect(checksRun()).toBe(first);
    expect((await kingdom.quest('Docker down')).verifier).toBeNull();
    // Due: they run again, fail the same way, and the owner hears nothing more of this run.
    await tickUntil(steward, kingdom.clock, () => Promise.resolve(checksRun() > first));
    await settled(steward);
    await steward.tick();
    expect(rung()).toHaveLength(1);
    // The environment is back: the next recheck passes and the judge comes.
    gone = false;
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Docker down', 'done'));
    const types = await typesOf(kingdom);
    expect(types).not.toContain('verdict.fail');
    expect(types).not.toContain('character.level_down');
    expect(types.filter((type) => type === 'quest.created')).toHaveLength(1);
    const judged = (await kingdom.quest('Docker down')).attempt_log.filter(({ role }) => role === 'verifier');
    expect(judged).toHaveLength(1);
  });
});
