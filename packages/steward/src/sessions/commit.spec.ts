import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Quest, QuestId } from '@elvaria/domain';

import { commitPlot } from './commit.ts';
import type { Context } from '../context.ts';

const id = 'q_20261114_a1b2c3' as QuestId;
const quest = { id, territory: 'elvaria', plot: { type: 'none' }, attempt_log: [] } as unknown as Quest;

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true, maxRetries: 5 })),
  );
});

describe('commitPlot errors', () => {
  it.each(['touched', 'commit'])('summarizes an error from %s without losing the counts', async (call) => {
    const lines = Array.from({ length: 8 }, (_, i) => `Error ${i}: git failed`);
    const fail = () => Promise.reject(new Error(lines.join('\n')));
    const root = await mkdtemp(path.join(os.tmpdir(), 'elvaria commit error '));
    folders.push(root);
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
