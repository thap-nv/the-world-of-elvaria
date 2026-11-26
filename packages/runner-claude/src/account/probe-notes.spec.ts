import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runOnce } from '../launch/run-once.ts';
import { probeClaude } from './probe.ts';
import type { Ran } from '../launch/run-once.ts';
import type { ProbeDeps } from './probe.ts';

vi.mock('../launch/run-once.ts', () => ({ runOnce: vi.fn() }));

const EMPTY: Ran = { code: 2, stdout: '', stderr: '', timed_out: false };
const DEPS: ProbeDeps = {
  launch: { file: 'unused', args: [] },
  env: {},
  cwd: 'unused',
  model: 'haiku',
  timeoutMs: 1000,
  now: () => Date.parse('2026-11-06T14:40:00Z'),
};

beforeEach(() => vi.mocked(runOnce).mockReset());

describe('probe fallback notes', () => {
  it.each([2, null])('codes a ping with no CLI text (exit %s)', async (code) => {
    vi.mocked(runOnce)
      .mockResolvedValueOnce(EMPTY)
      .mockResolvedValueOnce({ ...EMPTY, code });
    expect(await probeClaude(DEPS)).toEqual({
      status: 'error',
      note: { code: 'probe:ping_failed', params: { exit: String(code) } },
    });
  });

  it('codes usage that printed nothing without a ping', async () => {
    vi.mocked(runOnce).mockResolvedValue(EMPTY);
    expect(await probeClaude(DEPS, { ping: false })).toEqual({
      status: 'error',
      note: { code: 'probe:usage_unprinted', params: { command: 'claude -p /usage' } },
    });
  });

  it.each([
    { ...EMPTY, problem: 'spawn failed verbatim' },
    { ...EMPTY, stderr: 'first line\nsecond line\n' },
  ])('keeps usage errors separate from composed notes: %j', async (ran) => {
    vi.mocked(runOnce).mockResolvedValue(ran);
    expect(await probeClaude(DEPS, { ping: false })).toEqual({
      status: 'error',
      cli_text: ran.problem ?? 'first line',
    });
  });

  it.each([
    [
      { ...EMPTY, stdout: '{"type":"result","is_error":true,"result":"CLI error verbatim"}' },
      'CLI error verbatim',
    ],
    [{ ...EMPTY, problem: 'spawn failed verbatim' }, 'spawn failed verbatim'],
    [{ ...EMPTY, stderr: 'first line\nsecond line\n' }, 'first line'],
  ] as const)('keeps ping errors verbatim: %j', async (ran, text) => {
    vi.mocked(runOnce).mockResolvedValueOnce(EMPTY).mockResolvedValueOnce(ran);
    expect(await probeClaude(DEPS)).toEqual({ status: 'error', cli_text: text });
  });
});
