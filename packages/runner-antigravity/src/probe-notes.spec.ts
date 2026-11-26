import { runToEnd } from '@elvaria/runner-core';
import type * as RunnerCore from '@elvaria/runner-core';
import { beforeEach, expect, it, vi } from 'vitest';

import { fakeRunner } from './__fixtures__/agy.ts';

vi.mock('@elvaria/runner-core', async (original) => ({
  ...(await original<typeof RunnerCore>()),
  runToEnd: vi.fn(),
}));

beforeEach(() => vi.mocked(runToEnd).mockReset());

it('codes a failed usage command and keeps its problem verbatim', async () => {
  vi.mocked(runToEnd).mockResolvedValue({
    code: null,
    signal: null,
    stdout: '',
    stderr: '',
    problem: 'spawn failed',
    timed_out: false,
  });
  expect(await fakeRunner().probe()).toEqual({
    status: 'error',
    note: { code: 'probe:usage_failed', params: { command: 'agy -p /usage' } },
    cli_text: 'spawn failed',
  });
});

it.each([
  [3, 'CLI error\nsecond line', 'CLI error\nsecond line'],
  [0, '', undefined],
  [null, '', undefined],
] as const)('codes unreadable usage with exit %s and stderr %s', async (code, stderr, text) => {
  vi.mocked(runToEnd).mockResolvedValue({
    code,
    signal: null,
    stdout: 'unreadable',
    stderr,
    timed_out: false,
  });
  expect(await fakeRunner().probe()).toEqual({
    status: 'error',
    note: { code: 'probe:usage_exit', params: { command: 'agy -p /usage', exit: String(code) } },
    ...(text === undefined ? {} : { cli_text: text }),
  });
});
