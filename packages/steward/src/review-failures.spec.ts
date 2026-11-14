import { afterEach, describe, expect, it } from 'vitest';

import { KINGDOM, PASS, bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { plotsWith, questOfRun, statusIs, unitFails, verdictIn } from './__fixtures__/review.ts';
import type { Bench, BenchOptions } from './__fixtures__/kingdom.ts';
import type { Steward, StewardDeps } from './types.ts';

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

describe('what goes wrong on the way', () => {
  it('records the external error when the treasury cannot be read', async () => {
    const { kingdom, steward } = await open({}, () => ({
      treasury: {
        names: () => Promise.reject(new Error('EACCES: treasury.json')),
        resolve: () => Promise.resolve({}),
      },
    }));
    await kingdom.command('create_quest', questPayload('Unreadable', { secrets_required: ['npm_token'] }));
    await steward.tick();
    expect(kingdom.notices.at(-1)).toMatchObject({
      reason: { code: 'breaker:treasury_unreadable', params: { error: 'EACCES: treasury.json' } },
    });
  });

  it('records the storage error when judges cannot write their verdicts', async () => {
    const { kingdom, steward } = await open({}, (k) => ({
      store: {
        ...k.store,
        verdicts: {
          ...k.store.verdicts,
          write: () =>
            Promise.resolve({
              ok: false,
              error: { code: 'locked', file: 'verdict.json', message: 'held' },
            }),
        },
      },
    }));
    await kingdom.command('create_quest', questPayload('Unwritten'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Unwritten', 'infirmary'));
    expect(kingdom.notices.at(-1)).toMatchObject({
      reason: {
        code: 'judge:verdict_unwritten',
        params: { stopped: 2, run: 1, error: expect.stringContaining('held') as unknown },
      },
    });
  });

  it('records sessions lost after their completed crash could not be saved', async () => {
    let refuse = true;
    const { kingdom, steward } = await open(
      { plays: { verdicts: { Lost: [{ verdict: 'nothing' }, { verdict: 'nothing' }] } } },
      (k) => ({
        store: {
          ...k.store,
          quests: {
            ...k.store.quests,
            write: (quest) => {
              const last = quest.attempt_log.at(-1);
              if (quest.status === 'review' && last?.outcome === 'crash') {
                const fail = refuse;
                refuse = !refuse;
                if (fail)
                  return Promise.resolve({
                    ok: false,
                    error: { code: 'locked', file: 'quest.json', message: 'held' },
                  });
              }
              return k.store.quests.write(quest);
            },
          },
        },
      }),
    );
    await kingdom.command('create_quest', questPayload('Lost'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Lost', 'infirmary'));
    expect(kingdom.notices.at(-1)).toMatchObject({
      reason: { code: 'judge:session_lost', params: { stopped: 2, run: 1 } },
    });
  });

  it('leaves the quest in review while its checks cannot run, and judges once they can', async () => {
    let broken = true;
    const { kingdom, steward } = await open({}, (k) => ({
      plots: plotsWith(k.root, {
        check: () => (broken ? Promise.reject(new Error('git is not found')) : Promise.resolve([])),
      }),
    }));
    await kingdom.command('create_quest', questPayload('No git yet'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'No git yet', 'review'));
    await steward.tick();
    expect((await kingdom.quest('No git yet')).verifier).toBeNull();
    expect(kingdom.warnings.join('\n')).toContain('the checks did not run: git is not found');
    broken = false;
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'No git yet', 'done'));
  });

  it('takes a commit that throws for a refusal', async () => {
    const { kingdom, steward } = await open({}, (k) => ({
      plots: plotsWith(k.root, {
        commit: () => Promise.reject(new Error('index.lock exists')),
      }),
    }));
    await kingdom.command('create_quest', questPayload('Locked index'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Locked index', 'infirmary'));
    expect(kingdom.notices.at(-1)).toMatchObject({
      reason: {
        code: 'breaker:commit',
        params: {
          lines: 'index.lock exists',
          total_lines: 1,
          log: expect.stringMatching(/pre-commit\.log$/) as unknown,
        },
      },
    });
  });

  it('writes no verdict for an output the verdict schema refuses, and lets the next judge come', async () => {
    const vague = { result: 'fail', fail_kind: 'style', notes: 'Meh.' };
    const { kingdom, steward } = await open({ plays: { verdicts: { 'Vague judge': [vague, PASS] } } });
    await kingdom.command('create_quest', questPayload('Vague judge'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Vague judge', 'done'));
    // What the schema refused, issue by issue (P1-33: a judge answering in text is told the same).
    expect(kingdom.warnings.join('\n')).toContain(
      "the verifier's output is no verdict (invalid_verdict: notes: a fail verdict needs specific notes",
    );
    const quest = await kingdom.quest('Vague judge');
    expect(quest.attempt_log.filter(({ role }) => role === 'verifier')).toHaveLength(2);
  });

  it('writes no verdict for a pass without notes, and lets the next judge come (P1-40)', async () => {
    const bare = { result: 'pass', notes: ' ' };
    const { kingdom, steward } = await open({ plays: { verdicts: { 'Silent judge': [bare, PASS] } } });
    await kingdom.command('create_quest', questPayload('Silent judge'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Silent judge', 'done'));
    expect(kingdom.warnings.join('\n')).toContain(
      "the verifier's output is no verdict (invalid_verdict: notes: a pass says what the judge checked",
    );
    const quest = await kingdom.quest('Silent judge');
    const judged = quest.attempt_log.filter(({ role }) => role === 'verifier');
    expect(judged.map(({ outcome }) => outcome)).toEqual(['crash', 'submitted']);
    expect(await verdictIn(kingdom, `${quest.id}-1`)).toMatchObject({ result: 'pass', notes: PASS.notes });
  });

  it("refuses the owner's seal or return on a quest that does not wait for it, and writes no file", async () => {
    const { kingdom, steward } = await open();
    await kingdom.command('create_quest', questPayload('Not sealed yet', { rank: 'S', seal_required: true }));
    await steward.tick();
    const quest = await kingdom.quest('Not sealed yet');
    await kingdom.command('seal', { quest: quest.id });
    await kingdom.command('return', { quest: quest.id, notes: 'Please rework the pricing rounding first.' });
    expect((await steward.tick()).commands).toMatchObject({ rejected: 2 });
    expect((await kingdom.store.verdicts.list()).items).toEqual([]);
  });

  it('keeps a plot the territory will not give back, and says why', async () => {
    const { kingdom, steward } = await open({}, (k) => ({
      plots: plotsWith(k.root, {
        release: () =>
          Promise.resolve({ ok: false, error: { reason: 'dirty', detail: 'src/a.ts is modified' } }),
      }),
    }));
    await kingdom.command('create_quest', questPayload('Dirty plot'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Dirty plot', 'done'));
    await kingdom.command('archive', { quest: (await kingdom.quest('Dirty plot')).id });
    await steward.tick();
    expect((await kingdom.quest('Dirty plot')).status).toBe('archived');
    expect(kingdom.warnings.join('\n')).toContain('the plot stays (dirty): src/a.ts is modified');
  });

  it("warns when a tribe's CLI keeps data about a released plot, its folder stays, or the release throws", async () => {
    let call = 0;
    const { kingdom, steward } = await open({}, (k) => ({
      plots: plotsWith(k.root, {
        release: () => {
          call += 1;
          if (call === 2) return Promise.reject(new Error('EBUSY'));
          return Promise.resolve({
            ok: true,
            value: {
              removed: true,
              forget_failures: ['claude purge: exit 2'],
              leftover: 'D:/repo/.elvaria/worktrees/q: EPERM',
            },
          });
        },
      }),
    }));
    await kingdom.command('create_quest', questPayload('First'));
    await kingdom.command('create_quest', questPayload('Second'));
    const done = async () =>
      (await statusIs(kingdom, 'First', 'done')()) && (await statusIs(kingdom, 'Second', 'done')());
    await tickUntil(steward, kingdom.clock, done);
    await kingdom.command('archive', { quest: (await kingdom.quest('First')).id });
    await kingdom.command('archive', { quest: (await kingdom.quest('Second')).id });
    await steward.tick();
    const said = kingdom.warnings.join('\n');
    expect(said).toContain("a tribe's CLI kept data about the plot: claude purge: exit 2");
    expect(said).toContain("the plot's folder stays, remove it by hand: D:/repo/.elvaria/worktrees/q: EPERM");
    expect(said).toContain('the plot stays: EBUSY');
  });

  it('fails the run on a failing check when the machine judges, and returns the quest', async () => {
    const cast = [
      { id: 'kael', cls: 'knight' },
      { id: 'sable', cls: 'judge', model: 'claude-opus-5-5' },
    ] as const;
    const { kingdom, steward } = await open({ cast }, (k) => ({
      plots: plotsWith(k.root, { check: ({ run_dir }) => Promise.resolve([unitFails(questOfRun(run_dir))]) }),
    }));
    const dispatch = { ...KINGDOM.dispatch, verifier_same_family: 'machine_only' as const };
    expect((await kingdom.store.kingdom.write({ ...KINGDOM, dispatch })).ok).toBe(true);
    await kingdom.command('create_quest', questPayload('Machine fails it'));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await kingdom.quest('Machine fails it')).attempts === 2,
    );
    const quest = await kingdom.quest('Machine fails it');
    expect(await verdictIn(kingdom, `${quest.id}-1`)).toMatchObject({
      verifier_id: 'machine',
      result: 'fail',
      fail_kind: 'tests_fail',
    });
    expect(quest.checks_run).toEqual(['unit']);
  });
});
