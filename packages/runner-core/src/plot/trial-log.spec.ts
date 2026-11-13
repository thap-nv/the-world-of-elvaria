// The failure a trial step's log tells (PS-25): the command of its last `$` header and the first line saying why.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { RM_TEMP } from '../__fixtures__/temp.ts';
import { failureInLog, failureInLogFile } from './trial-log.ts';

describe('failureInLog', () => {
  it('names the last command and the first line of its output that says why, CRLF or not', () => {
    const log = [
      '$ pnpm build',
      'built',
      '',
      '$ pnpm test',
      ' RUN  v5.1.0',
      ' FAIL  src/a.spec.ts > adds',
      'AssertionError: expected 1 to be 2',
    ].join('\r\n');
    expect(failureInLog(log)).toEqual({ command: 'pnpm test', line: 'FAIL  src/a.spec.ts > adds' });
  });

  it("finds pnpm's and npm's codes, and else keeps the last line of the output", () => {
    expect(failureInLog('$ pnpm install\n ERR_PNPM_OUTDATED_LOCKFILE  lockfile is old\n').line).toBe(
      'ERR_PNPM_OUTDATED_LOCKFILE  lockfile is old',
    );
    expect(failureInLog('$ npm ci\nnpm ERR! code E404\n').line).toBe('npm ERR! code E404');
    expect(failureInLog('$ node x.mjs\nstep 1\nstep 2\n')).toEqual({ command: 'node x.mjs', line: 'step 2' });
  });

  it('says nothing it does not know: no output, no header', () => {
    expect(failureInLog('$ node quiet.mjs\n\n')).toEqual({ command: 'node quiet.mjs' });
    expect(failureInLog('')).toEqual({});
    expect(failureInLog('fatal: not a git repository')).toEqual({ line: 'fatal: not a git repository' });
  });

  it('cuts a long line to one line of the card', () => {
    const { line = '' } = failureInLog(`$ x\nError: ${'a'.repeat(400)}`);
    expect(line).toHaveLength(300);
    expect(line.endsWith('…')).toBe(true);
  });
});

describe('failureInLogFile', () => {
  it('reads nothing from a log that is not there', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'elvaria trial log '));
    try {
      expect(await failureInLogFile(root, '.runs/none.log')).toEqual({});
    } finally {
      await rm(root, RM_TEMP);
    }
  });
});
