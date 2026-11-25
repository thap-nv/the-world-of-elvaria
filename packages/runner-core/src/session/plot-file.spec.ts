// The files a session keeps in the plot for its life (P1-23): written unless the territory owns the name, taken out
// when the session ends or never starts, a territory's file never touched.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { existingText, removeOwnFile, withPlotFiles, writeOwnFile } from './plot-file.ts';
import type { RunResult, RunningSession } from '../runner/types.ts';

const OURS = '<!-- Elvaria -->';
const isOurs = (text: string): boolean => text.startsWith(OURS);

let root: string;
let plot: string;
let file: string;
let temp: TempDir;
beforeEach(async () => {
  temp = await tempDir('plot file');
  root = temp.root;
  plot = path.join(root, 'plot');
  await mkdir(path.join(root, 'run'), { recursive: true });
  await mkdir(plot);
  file = path.join(plot, 'CONTEXT.md');
});
afterEach(() => temp.remove());

describe('writeOwnFile and removeOwnFile', () => {
  it('writes and takes out Elvaria’s file', async () => {
    await writeOwnFile(file, `${OURS} one`, isOurs, 'no');
    await writeOwnFile(file, `${OURS} two`, isOurs, 'no');
    expect(await readFile(file, 'utf8')).toBe(`${OURS} two`);
    await removeOwnFile(file, isOurs);
    expect(await existingText(file)).toBeUndefined();
    await removeOwnFile(file, isOurs);
  });

  it('refuses to write over the territory’s file, and leaves it in place', async () => {
    await writeFile(file, 'the territory', 'utf8');
    await expect(writeOwnFile(file, OURS, isOurs, 'the tribe cannot run here')).rejects.toThrow(
      `${file} belongs to the territory: the tribe cannot run here`,
    );
    await removeOwnFile(file, isOurs);
    expect(await readFile(file, 'utf8')).toBe('the territory');
  });

  it('reads a path it cannot read as a failure, not as no file', async () => {
    await expect(existingText(plot)).rejects.toThrow();
  });
});

const END: RunResult = {
  outcome: 'completed',
  exit_code: 0,
  usage: { tokens: 1, turns: 1 },
  session_id: 's',
  duration_ms: 1,
  permission_denials: [],
  rate_limited: false,
};

function session(): RunningSession & { readonly finish: () => void; readonly killed: string[] } {
  let finish = (): void => undefined;
  const ended = new Promise<RunResult>((resolve) => {
    finish = () => {
      resolve(END);
    };
  });
  const killed: string[] = [];
  return {
    session_id: Promise.resolve('s'),
    pid: 1,
    signals: {
      [Symbol.asyncIterator]: () => ({ next: () => Promise.resolve({ done: true, value: undefined }) }),
    },
    wait: () => ended,
    kill: async (reason) => {
      killed.push(reason);
      finish();
      await ended;
    },
    finish: () => {
      finish();
    },
    killed,
  };
}

describe('withPlotFiles', () => {
  const request = () => ({ cwd: plot, run_dir: path.join(root, 'run') });
  const files = {
    remove: (at: string) => removeOwnFile(path.join(at, 'CONTEXT.md'), isOurs),
    stay: 'it stays',
  };

  it('takes the files out once the session ends, before wait() settles', async () => {
    await writeOwnFile(file, OURS, isOurs, 'no');
    const started = session();
    const running = await withPlotFiles(request(), files, () => Promise.resolve(started));
    expect(await existingText(file)).toBe(OURS);
    started.finish();
    expect(await running.wait()).toEqual(END);
    expect(await existingText(file)).toBeUndefined();
  });

  it('takes them out after a kill too', async () => {
    await writeOwnFile(file, OURS, isOurs, 'no');
    const started = session();
    const running = await withPlotFiles(request(), files, () => Promise.resolve(started));
    await running.kill('breaker');
    expect(started.killed).toEqual(['breaker']);
    expect(await existingText(file)).toBeUndefined();
  });

  it('takes them out when the session never starts, and throws its reason', async () => {
    const start = async (): Promise<RunningSession> => {
      await writeOwnFile(file, OURS, isOurs, 'no');
      throw new Error('hooks not loaded');
    };
    await expect(withPlotFiles(request(), files, start)).rejects.toThrow('hooks not loaded');
    expect(await existingText(file)).toBeUndefined();
  });

  it('notes in stderr.log the files that will not go, and still ends', async () => {
    const stuck = { remove: () => Promise.reject(new Error('EBUSY')), stay: 'the hook files stay' };
    const started = session();
    const running = await withPlotFiles(request(), stuck, () => Promise.resolve(started));
    started.finish();
    await running.wait();
    const log = await readFile(path.join(root, 'run', 'stderr.log'), 'utf8');
    expect(log).toBe('[elvaria] the hook files stay in the plot: EBUSY\n');
  });
});
