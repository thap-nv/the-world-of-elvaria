// The owner's hold and the owner's submit from the infirmary in the Steward (fix/quest-hold). `hold` and `unhold`
// change one field and write a quest.edited line; planTick leaves a held quest alone. `submit` commits what the plot
// still holds, with the territory's hooks, and sends the work to review, same run; a refused commit or a forbidden
// path refuses the command and the quest stays in the infirmary.
import { ok } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { CLEAN } from '../__fixtures__/cuts.ts';
import { bench, questPayload } from '../__fixtures__/kingdom.ts';
import { plotsWith } from '../__fixtures__/review.ts';
import { createForgeBook } from '../forge/book.ts';
import { createPatrolBook } from '../patrol/book.ts';
import { createDelegationBook } from '../delegation/book.ts';
import { noticesOf } from '../schedule/digest.ts';
import { loadWorld } from '../world.ts';
import type { Bench, BenchOptions } from '../__fixtures__/kingdom.ts';
import type { Plots, Steward, StewardDeps } from '../types.ts';

let current: Bench | undefined;
let running: Steward | undefined;

async function open(
  options: BenchOptions = {},
  overrides: (kingdom: Bench) => Partial<StewardDeps> = () => ({}),
) {
  current = await bench(options);
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

const HANGS = { work: { Cut: ['hang', 'hang', 'hang'] as const } };
/** Rank D: 45 minutes, so 150 % is 67.5. */
const HARD = 67.5;

const answers = async (kingdom: Bench) =>
  (await openEventLog(kingdom.root).read()).events
    .filter(({ type }) => type.startsWith('command.'))
    .map(({ type, data }) => [type, data.kind, (data as { reason?: string }).reason]);

const linesOf = async (kingdom: Bench, type: string) =>
  (await openEventLog(kingdom.root).read()).events.filter((event) => event.type === type);

describe('hold and unhold', () => {
  it('keeps a held quest with the character the owner named from starting, and starts it once lifted', async () => {
    const { kingdom, steward } = await open({ plays: { work: { Busy: ['hang'] } } });
    await kingdom.command('create_quest', questPayload('Busy'));
    await steward.tick();
    const busy = await kingdom.quest('Busy');
    expect(busy.status).toBe('working');
    await kingdom.command('create_quest', questPayload('Named', { assignee: busy.assignee }));
    await steward.tick();
    const named = await kingdom.quest('Named');
    expect(named).toMatchObject({ status: 'claimed', assignee: busy.assignee });
    await kingdom.command('hold', { quest: named.id, reason: 'next run' });
    await kingdom.command('cancel', { quest: busy.id });
    await steward.tick();
    await steward.tick();
    expect(await kingdom.quest('Named')).toMatchObject({
      status: 'claimed',
      assignee: busy.assignee,
      held: { reason: 'next run' },
    });
    expect(kingdom.requests.filter(({ quest }) => quest?.id === named.id)).toEqual([]);
    await kingdom.command('unhold', { quest: named.id });
    await steward.tick();
    const started = await kingdom.quest('Named');
    expect(started).not.toHaveProperty('held');
    expect(started.status).not.toBe('claimed');
    expect(started.attempt_log).toMatchObject([{ role: 'assignee', character: busy.assignee }]);
    const edits = (await linesOf(kingdom, 'quest.edited')).filter(({ quest }) => quest === named.id);
    expect(edits).toMatchObject([{ actor: { kind: 'user' } }, { actor: { kind: 'user' } }]);
  });

  it('refuses a hold on a working quest, and an unhold of a quest not held, with the domain’s reason', async () => {
    const { kingdom, steward } = await open({ plays: HANGS });
    await kingdom.command('create_quest', questPayload('Cut'));
    await steward.tick();
    const quest = await kingdom.quest('Cut');
    expect(quest.status).toBe('working');
    await kingdom.command('hold', { quest: quest.id });
    await kingdom.command('unhold', { quest: quest.id });
    await steward.tick();
    expect((await answers(kingdom)).slice(1)).toEqual([
      ['command.rejected', 'hold', 'not_holdable'],
      ['command.rejected', 'unhold', 'not_held'],
    ]);
  });

  // (D) of fix/quest-hold: the digest names the held quest with the owner's reason, and no longer once lifted.
  it('gives the digest each held quest with why, from the quest files', async () => {
    const { kingdom, steward } = await open({ plays: HANGS });
    // The one knight works on Cut: Later stays open.
    await kingdom.command('create_quest', questPayload('Cut'));
    await steward.tick();
    await kingdom.command('create_quest', questPayload('Later'));
    await steward.tick();
    const quest = await kingdom.quest('Later');
    await kingdom.command('hold', { quest: quest.id, reason: 'next run' });
    await steward.tick();
    const heldOf = async () => {
      const world = await loadWorld(kingdom.store, { warn: () => undefined });
      if (world === undefined) throw new Error('fixture: world');
      const versions = { asked: new Map(), told: new Map(), holds: [] };
      const books = {
        forge: createForgeBook(),
        patrol: createPatrolBook(),
        delegation: createDelegationBook(),
      };
      return noticesOf(world, {
        reported: new Map(),
        unjudged: new Set(),
        judgeWaits: new Map(),
        versions,
        ...books,
      }).held;
    };
    expect(await heldOf()).toEqual([{ quest: quest.id, reason: 'next run' }]);
    await kingdom.command('unhold', { quest: quest.id });
    await steward.tick();
    expect(await heldOf()).toEqual([]);
  });
});

/** Plots whose commit and changed paths the spec sets as it goes; the commit messages go to `commits`. */
function steeredPlots(kingdom: Bench, commits: string[]) {
  const steer: { commit: Plots['commit']; touched: readonly string[]; patch: Plots['applyPatch'] } = {
    commit: () => Promise.resolve(CLEAN),
    touched: [],
    patch: () => Promise.resolve({ status: 'none' }),
  };
  const plots = plotsWith(
    kingdom.root,
    {
      commit: (...args) => steer.commit(...args),
      touched: () => Promise.resolve(steer.touched),
      applyPatch: (...args) => steer.patch(...args),
    },
    commits,
  );
  return { steer, plots };
}

/** A quest cut twice at the hard ceiling without progress: the infirmary (ADR 0030). */
async function cutTwice(kingdom: Bench, steward: Steward) {
  await kingdom.command('create_quest', questPayload('Cut'));
  await steward.tick();
  kingdom.clock.advance(HARD);
  await steward.tick();
  await steward.tick();
  kingdom.clock.advance(HARD);
  await steward.tick();
  const quest = await kingdom.quest('Cut');
  expect(quest).toMatchObject({ status: 'infirmary', attempts: 1 });
  return quest;
}

describe('submit from the infirmary', () => {
  let steer: ReturnType<typeof steeredPlots>['steer'];
  const commits: string[] = [];
  const withPlots = (kingdom: Bench): Partial<StewardDeps> => {
    commits.length = 0;
    const made = steeredPlots(kingdom, commits);
    steer = made.steer;
    return { plots: made.plots };
  };

  it('commits what the plot holds and sends the work to review: same assignee, attempt and run', async () => {
    const { kingdom, steward } = await open({ plays: HANGS }, withPlots);
    const sick = await cutTwice(kingdom, steward);
    await kingdom.command('submit', { quest: sick.id });
    await steward.tick();
    const quest = await kingdom.quest('Cut');
    expect(quest).toMatchObject({ status: 'review', assignee: sick.assignee, attempts: 1 });
    expect(quest.attempt_log.filter(({ role }) => role === 'assignee')).toHaveLength(2);
    expect(commits).toContain(`commit chore: submit ${sick.id}`);
    expect(await linesOf(kingdom, 'quest.submitted')).toMatchObject([
      { quest: sick.id, actor: { kind: 'user' } },
    ]);
    expect((await answers(kingdom)).at(-1)).toEqual(['command.applied', 'submit', undefined]);
  });

  it('marks the protected paths the work changed, so the quest waits for the seal (ADR 0026)', async () => {
    const { kingdom, steward } = await open({ plays: HANGS }, withPlots);
    await kingdom.store.territories.update('dc1-se-team' as never, (territory) =>
      ok({ ...territory, laws: { ...territory.laws, protected_paths: ['.github/**'] } }),
    );
    const sick = await cutTwice(kingdom, steward);
    steer.touched = ['.github/workflows/ci.yml', 'src/app.ts'];
    await kingdom.command('submit', { quest: sick.id });
    await steward.tick();
    expect(await kingdom.quest('Cut')).toMatchObject({
      status: 'review',
      seal_required: true,
      protected_changes: ['.github/workflows/ci.yml'],
    });
  });

  it('refuses the command when the hooks refuse the commit: the quest stays, the work stays in the plot', async () => {
    const { kingdom, steward } = await open({ plays: HANGS }, withPlots);
    const sick = await cutTwice(kingdom, steward);
    steer.commit = () => Promise.reject(new Error('husky refused'));
    await kingdom.command('submit', { quest: sick.id });
    await steward.tick();
    expect((await kingdom.quest('Cut')).status).toBe('infirmary');
    expect((await answers(kingdom)).at(-1)).toEqual(['command.rejected', 'submit', 'commit_refused']);
    expect(kingdom.warnings.some((line) => line.includes('the commit was refused'))).toBe(true);
  });

  it('applies the patch its session wrote first, and refuses the command when it does not apply', async () => {
    const { kingdom, steward } = await open({ plays: HANGS }, withPlots);
    await kingdom.store.territories.update('dc1-se-team' as never, (territory) =>
      ok({ ...territory, laws: { ...territory.laws, patch_paths: ['.claude/**'] } }),
    );
    const sick = await cutTwice(kingdom, steward);
    steer.patch = () => Promise.resolve({ status: 'refused', detail: 'touches src/app.ts' });
    const before = commits.length;
    await kingdom.command('submit', { quest: sick.id });
    await steward.tick();
    expect((await kingdom.quest('Cut')).status).toBe('infirmary');
    expect(commits.slice(before)).toEqual(['patch .claude/**']);
    expect((await answers(kingdom)).at(-1)).toEqual(['command.rejected', 'submit', 'patch_refused']);
    steer.patch = () => Promise.resolve({ status: 'applied', paths: ['.claude/settings.json'] });
    await kingdom.command('submit', { quest: sick.id });
    await steward.tick();
    expect((await kingdom.quest('Cut')).status).toBe('review');
    expect(await linesOf(kingdom, 'plot.patched')).toMatchObject([
      { quest: sick.id, data: { paths: ['.claude/settings.json'] } },
    ]);
  });

  it('refuses the command when a forbidden path changed in the plot, committing nothing', async () => {
    const { kingdom, steward } = await open({ plays: HANGS }, withPlots);
    const sick = await cutTwice(kingdom, steward);
    await kingdom.store.territories.update('dc1-se-team' as never, (territory) =>
      ok({ ...territory, laws: { ...territory.laws, forbidden_paths: ['infra/secrets/**'] } }),
    );
    steer.touched = ['infra/secrets/key.txt'];
    const before = commits.length;
    await kingdom.command('submit', { quest: sick.id });
    await steward.tick();
    expect((await kingdom.quest('Cut')).status).toBe('infirmary');
    expect(commits).toHaveLength(before);
    expect((await answers(kingdom)).at(-1)).toEqual(['command.rejected', 'submit', 'forbidden_paths']);
  });

  it('refuses a quest the owner may not send to review, before it commits anything', async () => {
    const { kingdom, steward } = await open({ plays: HANGS }, withPlots);
    await kingdom.command('create_quest', questPayload('Cut'));
    await steward.tick();
    const quest = await kingdom.quest('Cut');
    await kingdom.command('submit', { quest: quest.id });
    await steward.tick();
    expect(commits).toEqual([]);
    // A working quest's submit is its session's (runner) or the machine's, never the owner's.
    expect((await answers(kingdom)).at(-1)).toEqual(['command.rejected', 'submit', 'actor_not_allowed']);
  });
});
