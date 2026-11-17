// The patrol (PS-26) on a real git repo with the bench's fake clock: one `patrol.ran` a day for each git territory with
// `patrol`; a check that turns red is one bell, one draft quest and one `base_red` item in each day's digest until a
// patrol finds it green; a scan that fails is counted; the Steward's stop kills the run, leaves no plot and no
// `schedule.ran`, and the next start runs it again.
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { TerritorySchema } from '@elvaria/domain';
import type { Event, TerritoryId } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { git, gitPlots, gitRepoWith, onRepo } from './__fixtures__/git-plots.ts';
import { bench, settled } from './__fixtures__/kingdom.ts';
import { withCatalog } from './__fixtures__/scripts.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { DigestRequest, Steward } from './types.ts';

const CHECK = [
  "import { existsSync, readFileSync } from 'node:fs';",
  "if (existsSync('slow.txt')) await new Promise((resolve) => setTimeout(resolve, 120_000));",
  "if (readFileSync('state.txt', 'utf8').trim() === 'red') { console.error('Error: the base is red'); process.exit(1); }",
  "console.log('green');",
].join('\n');
const DAY_MINUTES = 24 * 60;
const SLOW = 'slow.txt';

let current: Bench | undefined;
let running: Steward | undefined;
afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

/** A bench whose code territory is a git repo with one check, patrolled every day at 06:30 (the clock reads 09:00). */
async function open(patrol: Record<string, unknown> = {}) {
  const kingdom = await bench({ cast: [] });
  current = kingdom;
  await withCatalog(kingdom.root);
  const repo = await gitRepoWith(path.join(kingdom.root, 'the repo'), {
    'check.mjs': CHECK,
    'state.txt': 'green\n',
    'docs/a.md': '# A\n\n[gone](./missing.md)\n',
  });
  const checks = [{ id: 'unit', run: 'node check.mjs', when: ['**'], timeout_minutes: 5 }];
  await onRepo(kingdom, repo, [], { checks, patrol });
  // The docs territory has no git: the patrol passes it by whatever it says.
  const docs = await kingdom.store.territories.read('handbook' as TerritoryId);
  if (!docs.ok) throw new Error('fixture: handbook');
  await kingdom.store.territories.write(TerritorySchema.parse({ ...docs.value, patrol: {} }));
  const settings = await kingdom.store.kingdom.read();
  if (!settings.ok) throw new Error('fixture: kingdom.json');
  const schedule = { ...settings.value.schedule, patrol: { enabled: true, at: '06:30', every: 'P1D' } };
  await kingdom.store.kingdom.write({ ...settings.value, schedule });
  return { kingdom, repo };
}

/** The digests the Steward wrote (08:00, once the day's patrol ended). */
const digests: DigestRequest[] = [];

async function start(kingdom: Bench): Promise<Steward> {
  digests.length = 0;
  const digest = {
    write: (request: DigestRequest) => {
      digests.push(request);
      return Promise.resolve(`digest/${request.day}.md`);
    },
  };
  running = kingdom.steward({ plots: gitPlots(kingdom.root), digest });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return running;
}

const lines = async (kingdom: Bench, type: string): Promise<Event[]> =>
  (await openEventLog(kingdom.root).read()).events.filter((event) => event.type === type);

/**
 * A tick that starts the patrol, its end (settled), a tick that sees it ended, and one after it: the digest waits for
 * the patrol to have ended before the tick before its own (fix/digest-timing).
 */
async function patrolDay(steward: Steward): Promise<void> {
  await steward.tick();
  await settled(steward);
  await steward.tick();
  await steward.tick();
}

/** Commits `text` as `file` on main; empty text removes it. */
function commit(repo: string, file: string, text: string): void {
  git(repo, 'rm', '-q', '--ignore-unmatch', file);
  if (text !== '') {
    writeFileSync(path.join(repo, file), text);
    git(repo, 'add', file);
  }
  git(repo, 'commit', '-q', '-m', `set ${file}`);
}

const baseRed = (request: DigestRequest | undefined) =>
  (request?.items ?? []).filter(({ kind }) => kind === 'base_red');

describe('the patrol', () => {
  it('a green base: one patrol.ran a day for the git territory with patrol, no item, whatever the clock does', async () => {
    const { kingdom } = await open({
      scans: [{ script: 'link-check', params: { globs: ['docs/**/*.md'] } }],
    });
    const steward = await start(kingdom);
    await patrolDay(steward);
    const [ran] = await lines(kingdom, 'patrol.ran');
    expect(ran?.data).toMatchObject({
      territory: 'dc1-se-team',
      trigger: 'schedule',
      checks: [{ id: 'unit', pass: true, log_path: '.runs/patrol-dc1-se-team/checks/unit.log' }],
      scans: [{ script: 'link-check', outcome: 'fail', count: 1 }],
    });
    expect((await lines(kingdom, 'schedule.ran')).map(({ data }) => data)).toContainEqual({
      job: 'patrol',
      day: '2026-11-07',
    });
    const [health] = await lines(kingdom, 'territory.health');
    expect(health?.data).toMatchObject({ territory: { id: 'dc1-se-team', health: { ci: 'green' } } });
    expect(kingdom.notices.filter(({ kind }) => kind === 'base_red')).toEqual([]);
    expect(baseRed(digests[0])).toEqual([]);
    expect(digests[0]?.items.filter(({ kind }) => kind === 'patrol_scan')).toHaveLength(1);
    expect(
      existsSync(path.join(kingdom.root, '.runs', 'patrol-dc1-se-team', 'scans', 'link-check.log')),
    ).toBe(true);
    // The clock set back an hour, then forward again: still one run that day.
    kingdom.clock.advance(-60);
    await patrolDay(steward);
    kingdom.clock.advance(120);
    await patrolDay(steward);
    expect(await lines(kingdom, 'patrol.ran')).toHaveLength(1);
  });

  it('a check turned red: one ring, one draft, one item a day; green again: no item', async () => {
    const { kingdom, repo } = await open({ follow_up: { kind: 'fix', rank: 'D', class: 'knight' } });
    const steward = await start(kingdom);
    await patrolDay(steward);
    commit(repo, 'state.txt', 'red\n');
    for (const day of [1, 2]) {
      kingdom.clock.advance(DAY_MINUTES);
      await patrolDay(steward);
      expect(await lines(kingdom, 'patrol.ran')).toHaveLength(day + 1);
    }
    const drafts = (await kingdom.quests()).filter(({ created_by: by }) => by === 'patrol');
    expect(drafts.map(({ status, kind, rank }) => ({ status, kind, rank }))).toEqual([
      { status: 'draft', kind: 'fix', rank: 'D' },
    ]);
    expect(kingdom.notices.filter(({ kind }) => kind === 'base_red')).toEqual([
      {
        kind: 'base_red',
        territory: 'dc1-se-team',
        checks: [{ check: 'unit', error_line: 'Error: the base is red' }],
        draft: drafts[0]?.id,
      },
    ]);
    expect(digests.map((request) => baseRed(request).length)).toEqual([0, 1, 1]);
    expect(baseRed(digests[2])[0]).toMatchObject({ check: 'unit', error_line: 'Error: the base is red' });
    commit(repo, 'state.txt', 'green\n');
    kingdom.clock.advance(DAY_MINUTES);
    await patrolDay(steward);
    const [last] = (await lines(kingdom, 'territory.health')).slice(-1);
    expect(last?.data).toMatchObject({ territory: { health: { ci: 'green' } } });
    expect(baseRed(digests.at(-1))).toEqual([]);
  });

  it('the Steward stopped under a check kills it, leaves no plot and no line; the next start runs it', async () => {
    const { kingdom, repo } = await open();
    commit(repo, SLOW, 'slow\n');
    const steward = await start(kingdom);
    await steward.tick();
    const log = path.join(kingdom.root, '.runs', 'patrol-dc1-se-team', 'checks', 'unit.log');
    for (let n = 0; n < 1200 && !existsSync(log); n += 1)
      await new Promise((resolve) => setTimeout(resolve, 50));
    // The check sleeps two minutes: stop() returns long before, because it kills the check.
    await steward.stop();
    running = undefined;
    expect(await lines(kingdom, 'patrol.ran')).toEqual([]);
    expect((await lines(kingdom, 'schedule.ran')).map(({ data }) => data)).not.toContainEqual(
      expect.objectContaining({ job: 'patrol' }),
    );
    expect(existsSync(path.join(repo, '.elvaria', 'worktrees', 'patrol-dc1-se-team'))).toBe(false);
    commit(repo, SLOW, '');
    await patrolDay(await start(kingdom));
    expect(await lines(kingdom, 'patrol.ran')).toHaveLength(1);
  });
});
