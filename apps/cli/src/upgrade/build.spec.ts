// SEC-02b: the arguments reaching upgrade's git carry the guard before the command.
import { afterEach, expect, it, vi } from 'vitest';
import type * as RunnerCore from '@elvaria/runner-core';

import { testIo } from '../../test/cli.ts';
import { runProcess } from '../process/run-process.ts';
import { gitRun } from './build.ts';

vi.mock('../process/run-process.ts', () => ({ runProcess: vi.fn() }));
vi.mock('@elvaria/runner-core', async (original) => ({
  ...(await original<typeof RunnerCore>()),
  gitGuard: () => Promise.resolve(['-c', 'core.fsmonitor=false', '-c', 'credential.helper=']),
}));

afterEach(() => vi.clearAllMocks());

it('puts gitGuard switches before every upgrade git command and returns its outcome', async () => {
  vi.mocked(runProcess).mockImplementation((_file, args) =>
    Promise.resolve({ code: 0, stdout: JSON.stringify(args), stderr: '' }),
  );
  const tools = { git: '/tools/git', pnpm: { file: '/tools/pnpm', args: [] } };
  const run = gitRun(tools, testIo());
  for (const command of ['rev-parse', 'worktree', 'rev-list', 'init', 'add', 'commit']) {
    const result = await run('/source repo', [command, 'argument']);
    expect(result).toEqual({
      code: 0,
      stdout: JSON.stringify(['-c', 'core.fsmonitor=false', '-c', 'credential.helper=', command, 'argument']),
      stderr: '',
    });
  }
});
