// (PS-12g, item (r) of the PS-12c row) `elvaria scripture lint` and the doctor name each ledger entry whose line the
// owner deleted: a fact, no error, so the exit code and the doctor's level stay as they were.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { translator } from '@elvaria/i18n';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, gitRepo, run, tempDir, testIo } from '../__fixtures__/cli.ts';
import { checkScripture } from '../doctor/check-scripture.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import type { TempDir } from '../__fixtures__/cli.ts';

const KEPT = 'L_20261119_4k2pqz';
const GONE = 'L_20261118_9tw3hx';
const RETIRED = 'L_20261117_7pzkfv';
const ADDED_AT = '2026-11-18T21:10:02+07:00';

const entry = (id: string, more: object = {}) => ({
  id,
  source: 'monk',
  source_verdict: 'q_20261118_aaaaaa-1',
  added_at: ADDED_AT,
  ...more,
});
const RETIREMENT = {
  retired: {
    at: ADDED_AT,
    by: 'monk',
    text: 'Old rule.',
    why: 'it never helped',
    command: '01JC000000000000000000000A',
  },
};

describe('the lines of scripture the owner deleted (PS-12g)', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    await run(testIo(), 'territory', 'add', await gitRepo(path.join(dir.root, 'dc1')), '--kingdom', kingdom);
  });
  afterEach(() => dir.remove());

  async function plant(relative: string, text: string): Promise<void> {
    const file = path.join(kingdom, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text, 'utf8');
  }

  /** The Monk's line still there, one the owner deleted, one the Monk retired. */
  async function scriptures(): Promise<void> {
    await plant('temple/scripture.md', `- [${KEPT}] {fail_kind=style} Keep it short.\n`);
    const lessons = [entry(KEPT), entry(GONE), entry(RETIRED, RETIREMENT)];
    await plant('temple/scripture.json', `${JSON.stringify({ version: 1, lessons })}\n`);
  }

  const DELETED = `temple/scripture.md: ledger entry ${GONE} (added ${ADDED_AT}): you deleted its line. No error; the ledger keeps what the Monk wrote.`;

  it('lint prints each entry whose line is gone, not one retired, and still exits 0', async () => {
    await scriptures();
    const io = testIo({ platform: 'win32' });
    expect(await run(io, 'scripture', 'lint', '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    expect(io.printed.out).toEqual([DELETED, '1 files, 1 lessons: 0 errors, 0 warnings.']);
  });

  it('the doctor quotes it under a line still ready', async () => {
    await scriptures();
    const io = testIo({ platform: 'win32' });
    const cli = { io, locale: 'en' as const, localeFromFlag: true, t: translator('en') };
    const ctx = await openKingdomContext({ values: { kingdom }, positionals: [] }, cli);
    if (ctx === undefined) throw new Error('no kingdom');
    expect(await checkScripture(ctx)).toEqual([
      { level: 'ok', text: 'Scripture: 1 lessons, nothing to fix.', details: [DELETED] },
    ]);
    await plant('temple/scripture.md', `- [${KEPT}] Keep it short.\n`);
    expect(await checkScripture(ctx)).toEqual([
      {
        level: 'warn',
        text: 'Scripture: 0 errors, 1 warnings; see elvaria scripture lint.',
        details: [
          'temple/scripture.md:1: warning: no fail_kind: the metrics cannot tell whether the lesson helps',
          DELETED,
        ],
      },
    ]);
  });
});
