import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { CheckIdSchema } from '@elvaria/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RM_TEMP } from '../__fixtures__/kingdom.ts';
import { TAILS_MAX_CHARS, TAIL_LINES, withLogTails } from './log-tail.ts';
import type { VerdictCheck } from '@elvaria/domain';

let root = '';
beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'elvaria log tail '));
  await mkdir(path.join(root, 'checks'), { recursive: true });
});
afterAll(() => rm(root, RM_TEMP));

const check = (id: string, pass = false): VerdictCheck => ({
  id: CheckIdSchema.parse(id),
  pass,
  duration_ms: 10,
  log_path: `checks/${id}.log`,
});
const log = (id: string, text: string) => writeFile(path.join(root, 'checks', `${id}.log`), text);

describe('withLogTails', () => {
  it('keeps the last lines of a failing check, none of a passing one, and nothing of a log it cannot read', async () => {
    await log('unit', Array.from({ length: 100 }, (_, index) => `line ${index}`).join('\n'));
    await log('lint', 'all good\n');
    const [unit, lint, gone] = await withLogTails(
      root,
      [check('unit'), check('lint', true), check('gone')],
      [],
    );
    expect(unit?.log_tail?.split('\n')).toHaveLength(TAIL_LINES);
    expect(unit?.log_tail?.endsWith('line 99')).toBe(true);
    expect(lint).not.toHaveProperty('log_tail');
    expect(gone).not.toHaveProperty('log_tail');
  });

  it('reads only the end of a long log, from the start of a line, and masks before it cuts', async () => {
    const secret = 'plain-known-value-42';
    // Far more than it reads: the first line it sees is cut and dropped, the secret at the end is masked.
    const long = `${'x'.repeat(200_000)}\nmiddle\n${'y'.repeat(30)} ${secret}\n`;
    await log('big', long);
    const [big] = await withLogTails(root, [check('big')], [secret]);
    expect(big?.log_tail).toBe(`middle
${'y'.repeat(30)} [redacted]`);
  });

  it('shares its budget among the failing checks, and keeps the end of a single long line', async () => {
    const ids = ['a', 'b', 'c', 'd'];
    for (const id of ids) await log(id, `${'z'.repeat(5000)}\n`);
    const tails = await withLogTails(
      root,
      ids.map((id) => check(id)),
      [],
    );
    expect(tails.map(({ log_tail: tail }) => tail?.length)).toEqual(
      ids.map(() => TAILS_MAX_CHARS / ids.length),
    );
  });
});
