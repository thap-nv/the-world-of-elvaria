import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TerritorySchema } from '@elvaria/domain';
import type { Quest, QuestId } from '@elvaria/domain';

import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { commitPlot } from './commit.ts';
import type { Context } from '../context.ts';

const id = 'q_20261114_a1b2c3' as QuestId;
const quest = { id, territory: 'elvaria', plot: { type: 'none' }, attempt_log: [] } as unknown as Quest;

const folders: TempDir[] = [];
afterEach(async () => {
  await Promise.all(folders.splice(0).map((folder) => folder.remove()));
});

describe('commitPlot errors', () => {
  it.each(['touched', 'commit'])('summarizes an error from %s without losing the counts', async (call) => {
    const lines = Array.from({ length: 8 }, (_, i) => `Error ${i}: git failed`);
    const fail = () => Promise.reject(new Error(lines.join('\n')));
    const folder = await tempDir('commit error');
    const root = folder.root;
    folders.push(folder);
    const ctx = {
      root,
      world: { quests: new Map([[id, quest]]), territories: new Map() },
      deps: {
        plots: { touched: call === 'touched' ? fail : () => Promise.resolve([]), commit: fail },
      },
    } as unknown as Context;
    expect(await commitPlot(ctx, id, 'submit')).toEqual({
      status: 'refused',
      detail: lines.slice(0, 5).join('\n'),
      head: { lines: lines.slice(0, 5), errors: 8, total_lines: 8 },
      log: 'pre-commit.log',
    });
    expect(await readFile(path.join(root, `.runs/${id}-0/pre-commit.log`), 'utf8')).toBe(lines.join('\n'));
  });
});

describe('commitPlot after commands.setup again (fix/plot-setup-on-lockfile)', () => {
  const territory = TerritorySchema.parse({
    version: 1,
    id: 'elvaria',
    name: 'Elvaria',
    path: 'E:/repo',
    kind: 'code',
    vcs: { type: 'git', default_branch: 'main' },
    commands: { setup: 'pnpm install', setup_when: ['pnpm-lock.yaml'] },
  });
  const failed = {
    reason: 'setup_failed',
    detail: 'pnpm install: ended with 1',
    log_path: '.runs/q-setup.log',
  };
  type Ran = { ok: false; error: typeof failed } | { ok: true; value: object | null };
  let notes: { type: string; data: unknown }[] = [];
  afterEach(() => {
    notes = [];
  });
  const ctxWith = (stopping: AbortSignal, ran: Ran = { ok: false, error: failed }) =>
    ({
      root: 'E:/kingdom',
      stopping,
      record: {
        note: (line: { type: string; data: unknown }) => {
          notes.push({ type: line.type, data: line.data });
          return Promise.resolve();
        },
      },
      world: {
        quests: new Map([[id, { ...quest, secrets_required: [] }]]),
        territories: new Map([['elvaria', territory]]),
      },
      deps: {
        log: { warn: () => undefined },
        plots: {
          touched: () => Promise.resolve(['pnpm-lock.yaml']),
          refreshSetup: () => Promise.resolve(ran),
          commit: () => Promise.resolve({ status: 'committed', sha: 'abc' }),
        },
      },
    }) as unknown as Context;

  it('is refused, naming the setup and its log, when setup fails', async () => {
    expect(await commitPlot(ctxWith(new AbortController().signal), id, 'submit')).toEqual({
      status: 'refused',
      detail:
        'commands.setup failed before the commit (pnpm install: ended with 1); its log: .runs/q-setup.log',
      head: {
        lines: [
          'commands.setup failed before the commit (pnpm install: ended with 1); its log: .runs/q-setup.log',
        ],
        errors: 0,
        total_lines: 1,
      },
      setup: { detail: 'pnpm install: ended with 1', log: '.runs/q-setup.log' },
    });
    // LL-04: the log says the setup ran again and failed, as the infirmary's reason does.
    expect(notes).toEqual([
      {
        type: 'plot.setup',
        data: {
          trigger: 'changed',
          pass: false,
          log_path: '.runs/q-setup.log',
          detail: 'pnpm install: ended with 1',
        },
      },
    ]);
  });

  it('tells a setup that ran again and passed with plot.setup, trigger changed (LL-04)', async () => {
    const run = { exit_code: 0, timed_out: false, duration_ms: 4200, log_path: '.runs/q-setup.log' };
    const ctx = ctxWith(new AbortController().signal, { ok: true, value: run });
    expect(await commitPlot(ctx, id, 'submit')).toEqual({ status: 'committed', sha: 'abc' });
    expect(notes).toEqual([
      {
        type: 'plot.setup',
        data: { trigger: 'changed', pass: true, duration_ms: 4200, log_path: '.runs/q-setup.log' },
      },
    ]);
  });

  it('writes no plot.setup when setup was not due', async () => {
    expect(
      await commitPlot(ctxWith(new AbortController().signal, { ok: true, value: null }), id, 'submit'),
    ).toEqual({
      status: 'committed',
      sha: 'abc',
    });
    expect(notes).toEqual([]);
  });

  it('goes on to the commit when the Steward stopping cut the setup short', async () => {
    expect(await commitPlot(ctxWith(AbortSignal.abort()), id, 'submit')).toEqual({
      status: 'committed',
      sha: 'abc',
    });
    expect(notes).toEqual([]);
  });
});
