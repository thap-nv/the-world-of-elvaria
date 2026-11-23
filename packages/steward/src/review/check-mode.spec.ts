// The check mode of a quest's run after its session (CM-01, ADR 0032): on a narrow territory the Steward asks the plot
// what the quest touched, runs the checks narrowly unless a path forces the full run, says so on both `check.*` lines,
// and gives the judge the run's narrow commands and law 3 of a narrow run; a territory without a policy runs as before.
import { TerritorySchema } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';
import type { TerritoryId } from '@elvaria/domain';
import type { CheckRun } from '@elvaria/runner-core';

import { bench, questPayload, tickUntil } from '../__fixtures__/kingdom.ts';
import { plotsWith, questOfRun, statusIs } from '../__fixtures__/review.ts';
import type { Bench } from '../__fixtures__/kingdom.ts';
import type { PlotCheck } from '../plot/plot.ts';
import type { Steward } from '../types.ts';

const CHECKS = [
  { id: 'lint', run: 'pnpm lint', narrow: 'pnpm lint:changed', when: ['**/*.ts'], timeout_minutes: 5 },
  { id: 'unit', run: 'pnpm -r test', narrow: 'pnpm test:changed', when: ['src/**'], timeout_minutes: 15 },
  { id: 'docs', run: 'pnpm docs:check', narrow: 'pnpm docs:changed', when: ['docs/**'], timeout_minutes: 5 },
];
const NARROW = { mode: 'narrow', full_when: ['package.json'] };
const CODE = ['src/api/total.ts'];
const NARROW_LAW = 'The machine checked this quest narrowly';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

/** A green run of lint and unit, the two checks a change under src/ selects. */
const green = (request: PlotCheck): Promise<readonly CheckRun[]> => {
  const quest = questOfRun(request.run_dir);
  const run = (id: string): CheckRun => ({
    id: id as CheckRun['id'],
    pass: true,
    duration_ms: 700,
    log_path: `.runs/${quest}-1/checks/${id}.log`,
    exit_code: 0,
    timed_out: false,
  });
  return Promise.resolve([run('lint'), run('unit')]);
};

/** A quest touching `touched` on dc1-se-team with `policy`, worked and judged to its end. */
async function judged(touched: readonly string[], policy: Record<string, unknown> | null = NARROW) {
  const kingdom = await bench();
  current = kingdom;
  const read = await kingdom.store.territories.read('dc1-se-team' as TerritoryId);
  if (!read.ok) throw new Error('fixture: no territory');
  const written = { ...read.value, checks: CHECKS, ...(policy === null ? {} : { check_policy: policy }) };
  await kingdom.store.territories.write(TerritorySchema.parse(written));
  const calls: PlotCheck[] = [];
  const check = (request: PlotCheck) => {
    calls.push(request);
    return green(request);
  };
  const touchedOf = () => Promise.resolve(touched);
  running = kingdom.steward({ plots: plotsWith(kingdom.root, { check, touched: touchedOf }) });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  await kingdom.command('create_quest', questPayload('Fix the total'));
  await tickUntil(running, kingdom.clock, statusIs(kingdom, 'Fix the total', 'done'));
  const lines = (await openEventLog(kingdom.root).read()).events.filter(({ type }) =>
    type.startsWith('check.'),
  );
  const judge = kingdom.requests.find(({ role }) => role === 'verifier');
  if (judge === undefined) throw new Error('no judge opened');
  return {
    calls,
    lines: lines.map(({ data }) => data),
    allow: judge.permissions.allow,
    system: judge.prompt.system,
  };
}

describe('the check mode of the run after a session (CM-01)', () => {
  it('runs narrowly, says so on both lines, and gives the judge the narrow commands of its run alone', async () => {
    const { calls, lines, allow, system } = await judged(CODE);
    expect(calls.map(({ mode }) => mode)).toEqual(['narrow']);
    expect(lines).toEqual([{ mode: 'narrow' }, expect.objectContaining({ mode: 'narrow', outcome: 'pass' })]);
    expect(allow).toEqual(expect.arrayContaining(['Bash(pnpm lint:changed:*)', 'Bash(pnpm test:changed:*)']));
    for (const rule of ['Bash(pnpm -r test:*)', 'Bash(pnpm docs:changed:*)', 'Bash(pnpm docs:check:*)'])
      expect(allow).not.toContain(rule);
    expect(system).toContain(NARROW_LAW);
  });

  it('runs in full when the quest touched a path of full_when, and its judge reads as before', async () => {
    const { calls, lines, allow, system } = await judged([...CODE, 'package.json']);
    expect(calls[0]).not.toHaveProperty('mode');
    expect(lines).toEqual([{}, expect.not.objectContaining({ mode: 'narrow' })]);
    expect(allow).toEqual(expect.arrayContaining(['Bash(pnpm -r test:*)', 'Bash(pnpm docs:check:*)']));
    expect(system).not.toContain(NARROW_LAW);
  });

  it('runs as before CM-01 on a territory that names no policy', async () => {
    const { calls, lines, allow } = await judged(CODE, null);
    expect(calls[0]).not.toHaveProperty('mode');
    expect(lines[0]).toEqual({});
    expect(allow).not.toContain('Bash(pnpm test:changed:*)');
  });
});
