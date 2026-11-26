import { createFakeRunner } from '@elvaria/runner-core';
import { expect, it, vi } from 'vitest';

import { probeOf } from './read.ts';

it.each([new Error('adapter failed\nverbatim'), 'plain exception'])(
  'turns a thrown probe into a coded observation and verbatim exception: %s',
  async (error) => {
    const runner = { ...createFakeRunner(), probe: vi.fn().mockRejectedValue(error) };
    expect(await probeOf(runner, {})).toEqual({
      status: 'error',
      note: { code: 'probe:threw', params: {} },
      cli_text: error instanceof Error ? 'adapter failed\nverbatim' : 'plain exception',
    });
  },
);
