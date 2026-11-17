// A done quest's delivery to its forge (implementation-plan §3.16.7, ADR 0023; PS-08c) on a real git repo whose
// origin is a bare repo, with a fake forge: the Steward scans what the branch adds, pushes quest/<id>, opens its pull
// request once, records one outcome, and never tries a failure again until the owner's `deliver`.
import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

import { reduce } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { inKingdom, pathExists } from '@elvaria/store';
import { afterEach, describe, expect, it } from 'vitest';

import { delivered, noteOf } from './__fixtures__/deliver.ts';
import { forgeBench } from './__fixtures__/forge-bench.ts';
import { git } from './__fixtures__/git-plots.ts';
import { NPM_TOKEN, questPayload, settled, tickUntil, worldOfFiles } from './__fixtures__/kingdom.ts';
import { pushLogOf } from './forge/push.ts';
import type { ForgeBench } from './__fixtures__/forge-bench.ts';
import type { StepClock } from './__fixtures__/kingdom.ts';
import type { Steward } from './types.ts';

let current: ForgeBench | undefined;

afterEach(async () => {
  await current?.remove();
  current = undefined;
});

const PR = { mode: 'pr' };
const TITLE = 'Rooms API';
const PULL_1 = 'https://github.com/elvaria-specs/kingdom-repo/pull/1';
/** Built in parts, so no scanner of this repo takes the spec for a leak. */
const ANTHROPIC_KEY = ['sk-ant-', 'api03-', 'A1b2C3d4E5f6G7h8I9j0K1l2'].join('');
const GITHUB_TOKEN = ['gho', '_', 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'].join('');

const outcomes = async (bench: ForgeBench) => [
  ...(await bench.lines('delivery.pushed')),
  ...(await bench.lines('delivery.failed')),
];
const outcomeCount = (bench: ForgeBench, count: number) => async () =>
  (await outcomes(bench)).length >= count;
const opens = (bench: ForgeBench) => bench.forge.calls.filter(({ method }) => method === 'open');
const rejections = async (bench: ForgeBench) =>
  (await bench.lines('command.rejected')).map(({ data }) => (data as { reason?: string }).reason);

/** `count` ticks a minute apart, the work outside the tick ended between them: nothing new is due. */
async function quietTicks(steward: Steward, clock: StepClock, count = 3): Promise<void> {
  for (let tick = 0; tick < count; tick += 1) {
    await steward.tick();
    await settled(steward);
    clock.advance(1);
  }
}

/** A quest on dc1-se-team taken to its delivery's first outcome; the quest and its branch. */
async function deliverOne(bench: ForgeBench, steward: Steward) {
  await bench.kingdom.command('create_quest', questPayload(TITLE));
  await tickUntil(steward, bench.kingdom.clock, outcomeCount(bench, 1));
  const quest = await bench.kingdom.quest(TITLE);
  return { quest, branch: `quest/${quest.id}`, head: git(bench.repo, 'rev-parse', `quest/${quest.id}`) };
}

describe('a done quest on a territory that delivers by pull request', () => {
  it('is pushed at its head, gets one pull request with its delivery note, and nothing more after', async () => {
    current = await forgeBench({ delivery: PR });
    const { kingdom, forge } = current;
    const steward = await current.start();
    const { quest, branch, head } = await deliverOne(current, steward);
    expect(current.remoteTip(branch)).toBe(head);
    expect(git(current.remote, 'for-each-ref', '--format=%(refname)', 'refs/heads')).toBe(
      `refs/heads/main\nrefs/heads/${branch}`,
    );
    expect(forge.calls.map(({ method }) => method)).toEqual(['open']);
    expect(forge.calls[0]).toMatchObject({ repo: { owner: 'elvaria-specs', name: 'kingdom-repo' } });
    expect(forge.calls[0]?.draft).toEqual({
      head: branch,
      base: 'main',
      title: TITLE,
      body: await noteOf(kingdom, quest),
    });
    const [line, ...more] = await current.lines('delivery.pushed');
    expect(more).toEqual([]);
    expect(line).toMatchObject({ quest: quest.id, territory: 'dc1-se-team', actor: { kind: 'steward' } });
    expect(line?.data).toEqual({
      quest: quest.id,
      territory: 'dc1-se-team',
      branch,
      head,
      forge: 'github',
      pr: { number: 1, url: PULL_1 },
    });
    expect(await current.lines('delivery.failed')).toEqual([]);
    const log = await readFile(inKingdom(kingdom.root, pushLogOf(quest.id)), 'utf8');
    expect(log.startsWith(`$ git push origin ${branch}:refs/heads/${branch}\n`)).toBe(true);
    const bells = kingdom.notices.filter(({ kind }) => kind.startsWith('delivery_'));
    expect(bells).toEqual([
      {
        kind: 'delivery_pushed',
        quest: { id: quest.id, title: TITLE, rank: 'D' },
        url: PULL_1,
        warnings: [],
      },
    ]);

    await quietTicks(steward, kingdom.clock);
    expect(forge.calls).toHaveLength(1);
    expect(await outcomes(current)).toHaveLength(1);
    const events = (await openEventLog(kingdom.root).read()).events;
    expect(reduce(await kingdom.morning(), events)).toEqual(await worldOfFiles(kingdom.store));
  });

  it('finds the pull request it opened when the Steward stopped before recording it, and refuses a deliver meanwhile', async () => {
    current = await forgeBench({ delivery: PR });
    const { kingdom, forge } = current;
    const held = forge.holdOpen();
    const first = await current.start();
    await kingdom.command('create_quest', questPayload(TITLE));
    await tickUntil(first, kingdom.clock, delivered(kingdom, TITLE));
    const quest = await kingdom.quest(TITLE);
    await first.tick();
    await Promise.race([held.entered, first.idle()]);
    expect(opens(current)).toHaveLength(1);
    // The owner asks while the delivery runs: refused, the delivery goes on.
    await kingdom.command('deliver', { quest: quest.id });
    await first.tick();
    expect(await rejections(current)).toEqual(['delivery_running']);

    const stopping = first.stop();
    // The stop aborts the delivery before the forge answers: what it opened is never recorded.
    await sleep(300);
    held.release();
    await stopping;
    expect(forge.pulls.size).toBe(1);
    expect(await outcomes(current)).toEqual([]);

    const second = await current.start();
    await tickUntil(second, kingdom.clock, outcomeCount(current, 1));
    expect(opens(current)).toHaveLength(2);
    expect(forge.pulls.size).toBe(1);
    const [line, ...more] = await current.lines('delivery.pushed');
    expect(more).toEqual([]);
    expect(line?.data).toMatchObject({ pr: { number: 1, url: PULL_1 } });
    expect(current.remoteTip(`quest/${quest.id}`)).toBe(git(current.repo, 'rev-parse', `quest/${quest.id}`));
  });

  it('pushes a file that only matches a shared pattern, and names it in the line and the bell', async () => {
    current = await forgeBench({
      delivery: PR,
      leaves: () => ({ 'src/auth.spec.ts': 'const token = "abcdefghijklmnop";\n' }),
    });
    const { quest, branch, head } = await deliverOne(current, await current.start());
    expect(current.remoteTip(branch)).toBe(head);
    const [line] = await current.lines('delivery.pushed');
    expect(line?.data).toMatchObject({ quest: quest.id, warnings: ['src/auth.spec.ts'] });
    expect(current.kingdom.notices).toContainEqual(
      expect.objectContaining({ kind: 'delivery_pushed', warnings: ['src/auth.spec.ts'] }),
    );
  });
});

describe('a delivery that cannot go', () => {
  it.each([
    ['a model provider key', ANTHROPIC_KEY],
    ['a treasury value', NPM_TOKEN],
  ])('stops at the scan when the branch adds %s, naming the file and never the value', async (_, secret) => {
    current = await forgeBench({
      delivery: PR,
      leaves: () => ({
        'src/config.ts': `export const key = '${secret}';\n`,
        'src/clean.ts': 'export const a = 1;\n',
      }),
    });
    const { quest, branch, head } = await deliverOne(current, await current.start());
    expect(current.remoteTip(branch)).toBe('');
    expect(current.forge.calls).toEqual([]);
    const [line, ...more] = await current.lines('delivery.failed');
    expect(more).toEqual([]);
    expect(line?.data).toEqual({
      quest: quest.id,
      territory: 'dc1-se-team',
      stage: 'scan',
      reason: 'secret',
      branch,
      paths: ['src/config.ts'],
      detail: `commit ${head} adds a secret to src/config.ts`,
    });
    expect(current.kingdom.notices).toContainEqual(
      expect.objectContaining({ kind: 'delivery_failed', stage: 'scan', reason: 'secret' }),
    );
    expect(await current.holds(secret)).toBe(false);
  });

  it.each([
    ['forge_auth', 'Bad credentials (401)', 'Bad credentials (401)'],
    ['forge_error', `the forge answered 502 to ${GITHUB_TOKEN}`, 'the forge answered 502 to'],
  ] as const)(
    'stops at the pull request on %s, once, and goes again on the owner’s deliver',
    async (reason, detail, kept) => {
      current = await forgeBench({ delivery: PR });
      const { kingdom, forge } = current;
      forge.failOpen({ reason, detail });
      const steward = await current.start();
      const { quest, branch, head } = await deliverOne(current, steward);
      // The branch went before the pull request failed: the line says at which head.
      expect(current.remoteTip(branch)).toBe(head);
      const [failed] = await current.lines('delivery.failed');
      expect(failed?.data).toMatchObject({ quest: quest.id, stage: 'open', reason, branch, head });
      expect((failed?.data as { detail?: string }).detail).toContain(kept);
      await quietTicks(steward, kingdom.clock);
      expect(opens(current)).toHaveLength(1);
      expect(await outcomes(current)).toHaveLength(1);

      forge.failOpen(undefined);
      await kingdom.command('deliver', { quest: quest.id });
      await tickUntil(steward, kingdom.clock, outcomeCount(current, 2));
      expect(opens(current)).toHaveLength(2);
      expect(await current.lines('delivery.failed')).toHaveLength(1);
      const [pushed] = await current.lines('delivery.pushed');
      expect(pushed?.data).toMatchObject({ quest: quest.id, head, pr: { number: 1 } });
      const [applied] = (await current.lines('command.applied')).filter(
        ({ data }) => data.kind === 'deliver',
      );
      expect(applied).toMatchObject({ quest: quest.id, territory: 'dc1-se-team' });
      expect(await current.holds(GITHUB_TOKEN)).toBe(false);
    },
  );

  it('fails once with forge_error when the Steward has no forges, and never again', async () => {
    current = await forgeBench({ delivery: PR });
    const steward = await current.start({}, null);
    const { quest, branch } = await deliverOne(current, steward);
    await quietTicks(steward, current.kingdom.clock);
    const [line, ...more] = await current.lines('delivery.failed');
    expect(more).toEqual([]);
    expect(line?.data).toEqual({
      quest: quest.id,
      territory: 'dc1-se-team',
      stage: 'push',
      reason: 'forge_error',
      branch,
      detail: 'this Steward has no adapter for the forge github',
    });
    expect(current.remoteTip(branch)).toBe('');
  });

  it('is no delivery at all on a manual territory: nothing pushed, no forge called, deliver refused', async () => {
    current = await forgeBench();
    const { kingdom } = current;
    const steward = await current.start();
    await kingdom.command('create_quest', questPayload(TITLE));
    await tickUntil(steward, kingdom.clock, delivered(kingdom, TITLE));
    const quest = await kingdom.quest(TITLE);
    await kingdom.command('deliver', { quest: quest.id });
    await quietTicks(steward, kingdom.clock);
    expect(current.forge.calls).toEqual([]);
    expect(current.remoteTip(`quest/${quest.id}`)).toBe('');
    expect(await outcomes(current)).toEqual([]);
    expect(await pathExists(inKingdom(kingdom.root, pushLogOf(quest.id)))).toBe(false);
    expect(await rejections(current)).toEqual(['no_forge_delivery']);
  });

  it('pushes nothing and records nothing for a branch with no commit beyond the base', async () => {
    current = await forgeBench({ delivery: PR, leaves: () => ({}) });
    const { kingdom } = current;
    const steward = await current.start();
    await kingdom.command('create_quest', questPayload(TITLE));
    await tickUntil(steward, kingdom.clock, delivered(kingdom, TITLE));
    await quietTicks(steward, kingdom.clock);
    const branch = `quest/${(await kingdom.quest(TITLE)).id}`;
    expect(git(current.repo, 'rev-list', '--count', `main..${branch}`)).toBe('0');
    expect(current.forge.calls).toEqual([]);
    expect(await outcomes(current)).toEqual([]);
    expect(current.remoteTip(branch)).toBe('');
  });

  it('refuses deliver for a quest that is not done', async () => {
    current = await forgeBench({ delivery: PR });
    const { kingdom } = current;
    const steward = await current.start();
    await kingdom.command('create_quest', questPayload(TITLE, { draft: true }));
    await steward.tick();
    await kingdom.command('deliver', { quest: (await kingdom.quest(TITLE)).id });
    await steward.tick();
    expect(await rejections(current)).toEqual(['not_done']);
  });
});
