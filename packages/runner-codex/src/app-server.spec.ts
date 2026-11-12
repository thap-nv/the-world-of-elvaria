// The JSON-RPC client of `codex app-server` (spike Codex 2026-11-12 §1.11): answers in order, and every way it ends
// without them.
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { FAKE_CODEX, minimalEnv } from './__fixtures__/codex.ts';
import { askAppServer } from './app-server.ts';

const FAKE = { command: process.execPath, args: [FAKE_CODEX] };
const OPTIONS = { env: minimalEnv(), timeout_ms: 20_000 };

describe('askAppServer', () => {
  it('makes each call in turn and returns the answers in order', async () => {
    const answer = await askAppServer(
      FAKE,
      [],
      [{ method: 'account/rateLimits/read' }, { method: 'hooks/list', params: { cwds: ['C:/plot'] } }],
      OPTIONS,
    );
    expect(answer.ok).toBe(true);
    if (answer.ok) {
      expect(answer.results).toHaveLength(2);
      expect(answer.results[1]).toEqual({ data: [{ cwd: 'C:/plot', hooks: [], warnings: [], errors: [] }] });
    }
  });

  it("ends on the server's error", async () => {
    expect(await askAppServer(FAKE, [], [{ method: 'no/such' }], OPTIONS)).toEqual({
      ok: false,
      problem: 'codex app-server: unknown method no/such',
    });
  });

  it('ends when the server leaves, never starts, or keeps silent past the timeout', async () => {
    const leaves = { command: process.execPath, args: ['-e', 'process.exit(4)'] };
    expect(await askAppServer(leaves, [], [], OPTIONS)).toEqual({
      ok: false,
      problem: 'codex app-server left early (exit 4)',
    });
    const missing = { command: 'no such codex here', args: [] };
    expect(await askAppServer(missing, [], [], OPTIONS)).toMatchObject({
      ok: false,
      problem: expect.stringMatching(/did not start/) as unknown,
    });
    const silent = { command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'] };
    expect(await askAppServer(silent, [], [], { ...OPTIONS, timeout_ms: 500 })).toEqual({
      ok: false,
      problem: 'codex app-server gave no answer within 500 ms',
    });
  });
});
