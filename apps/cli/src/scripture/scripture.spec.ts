import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { translator } from '@elvaria/i18n';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, gitRepo, run, tempDir, testIo } from '../../test/cli.ts';
import { checkScripture } from '../doctor/check-scripture.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import type { TempDir, TestIo } from '../../test/cli.ts';

const TOKEN = `ghp_${'a'.repeat(36)}`;
const RULES = Array.from({ length: 40 }, (_, index) => `- {fail_kind=style} Rule ${index + 1}.`);

describe('elvaria scripture lint, list (PS-12)', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    await run(testIo(), 'territory', 'add', await gitRepo(path.join(dir.root, 'dc1')), '--kingdom', kingdom);
    await run(testIo(), 'character', 'add', 'thorn', '--class', 'knight', '--kingdom', kingdom);
  });
  afterEach(() => dir.remove());

  async function scripture(relative: string, lines: readonly string[]): Promise<void> {
    const file = path.join(kingdom, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${lines.join('\n')}\n`, 'utf8');
  }

  /** On Windows, whatever the machine running the spec, so a scope `os` reads the same everywhere. */
  async function elvaria(...args: string[]): Promise<{ code: number; io: TestIo }> {
    const io = testIo({ platform: 'win32' });
    const code = await run(io, 'scripture', ...args, '--kingdom', kingdom, '--locale', 'en');
    return { code, io };
  }

  it('names each issue with its file and line, sums them up, and exits 1 on an error', async () => {
    await scripture('temple/scripture.md', [
      '# Temple',
      '- {fail_kind=tests_fail} Run the tests before you submit.',
      '- {rol=verifier fail_kind=style} A typo in the key.',
      '- Write files with LF line endings.',
      'Some stray words.',
    ]);
    await scripture('characters/thorn/scripture.md', [`- {fail_kind=unsafe} Push with ${TOKEN}.`]);
    const { code, io } = await elvaria('lint');
    expect(io.printed.out).toEqual([
      'temple/scripture.md:3: error: unknown scope key "rol" (role, class, tribe, os, territory, tag, fail_kind, cli); the line never loads',
      'temple/scripture.md:4: warning: no fail_kind: the metrics cannot tell whether the lesson helps',
      'temple/scripture.md:5: warning: text that is no lesson never loads (a lesson is a line that starts with "- ")',
      'characters/thorn/scripture.md:1: error: the sentence matches a secret pattern of the event log; the line never loads',
      '2 files, 4 lessons: 2 errors, 2 warnings.',
    ]);
    expect(code).toBe(1);
  });

  it('passes a clean scripture, and says when there is none', async () => {
    expect((await elvaria('lint')).io.printed.out).toEqual([
      'No scripture yet: no temple/scripture.md and no characters/<id>/scripture.md.',
    ]);
    await scripture('temple/scripture.md', ['- {role=verifier os=win32 fail_kind=style} Compare commits.']);
    const { code, io } = await elvaria('lint');
    expect(io.printed.out).toEqual(['1 files, 1 lessons: 0 errors, 0 warnings.']);
    expect(code).toBe(0);
  });

  it('warns of a character whose heaviest session would load more than 40 lessons', async () => {
    await scripture('temple/scripture.md', ['- {role=verifier fail_kind=style} For judges.', ...RULES]);
    await scripture('characters/thorn/scripture.md', ['- {fail_kind=style} Mine.']);
    const { code, io } = await elvaria('lint');
    expect(io.printed.out).toEqual([
      'thorn: its heaviest session (verifier in dc1) has 42 lessons; only the first 40 load',
      '2 files, 42 lessons: 0 errors, 1 warnings.',
    ]);
    expect(code).toBe(0);
  });

  it("shows what a character's heaviest session loads and what the cap cuts, its own lines first", async () => {
    await scripture('temple/scripture.md', [
      '- {role=verifier fail_kind=style} For judges.',
      '- {tribe=nope} An unknown tribe.',
      ...RULES,
    ]);
    await scripture('characters/thorn/scripture.md', ['- [L_20261119_4k2pqz] {os=win32} Mine.']);
    const { code, io } = await elvaria('list', '--character', 'thorn');
    const [session, header, ...rows] = io.printed.out;
    expect(session).toBe(
      "thorn's heaviest session: verifier in dc1, a quest with every tag: 40 of the 42 lessons in scope load (cap 40).",
    );
    expect(header).toMatch(/^Ref +File +Line +Scope +Fail kind +Source +Load +Text$/u);
    const cells = rows.map((row) => row.split(/ {2,}/u));
    expect(cells[0]).toEqual([
      'L_20261119_4k2pqz',
      'characters/thorn/scripture.md',
      '1',
      'os=win32',
      '—',
      'owner',
      'loads',
      'Mine.',
    ]);
    expect(cells[1]?.slice(3)).toEqual(['role=verifier', 'style', 'owner', 'loads', 'For judges.']);
    expect(cells[2]?.slice(3)).toEqual(['tribe=nope', '—', 'owner', 'never loads', 'An unknown tribe.']);
    expect(cells.slice(3).map((row) => row.at(-2))).toEqual([
      ...Array.from({ length: 38 }, () => 'loads'),
      'over the cap',
      'over the cap',
    ]);
    expect(cells[1]?.[0]).toMatch(/^T_[0-9a-hjkmnp-tv-z]{10}$/u);
    expect(code).toBe(0);
  });

  it('lists every lesson of the kingdom without a character, and refuses one it does not have', async () => {
    await scripture('temple/scripture.md', ['- {class=paladin} No such class.', '- Plain.']);
    const { io } = await elvaria('list');
    expect(io.printed.out.slice(1).map((row) => row.split(/ {2,}/u).slice(1))).toEqual([
      ['temple/scripture.md', '1', 'class=paladin', '—', 'owner', 'never loads', 'No such class.'],
      ['temple/scripture.md', '2', '—', '—', 'owner', '—', 'Plain.'],
    ]);
    const unknown = await elvaria('list', '--character', 'ghost');
    expect(unknown.io.printed.err).toEqual(['No character ghost.']);
    expect(unknown.code).toBe(1);
  });

  it("tells the Monk's lines from the owner's by the ledger beside the scripture (PS-12c)", async () => {
    const [monk, owners] = ['L_20261119_4k2pqz', 'L_20261119_9tw3hx'];
    await scripture('temple/scripture.md', [
      `- [${monk}] Written by the Monk.`,
      `- [${owners}] The owner's.`,
    ]);
    const entry = {
      id: monk,
      source: 'monk',
      source_verdict: 'q_20261118_aaaaaa-1',
      added_at: '2026-11-19T21:10:02+07:00',
    };
    await scripture('temple/scripture.json', [JSON.stringify({ version: 1, lessons: [entry] })]);
    const { io } = await elvaria('list');
    expect(io.printed.out.slice(1).map((row) => row.split(/ {2,}/u)[5])).toEqual(['Monk', 'owner']);
  });

  describe('scripture.json kept while scripture.md is gone (PS-12g, item (i))', () => {
    const id = 'L_20261119_4k2pqz';
    const ledger = async (): Promise<void> => {
      const entry = {
        id,
        source: 'monk',
        source_verdict: 'q_20261118_aaaaaa-1',
        added_at: '2026-11-19T21:10:02+07:00',
      };
      await scripture('temple/scripture.json', [JSON.stringify({ version: 1, lessons: [entry] })]);
    };

    it('lint still names the ledger entry as a deleted line and exits 0', async () => {
      await ledger();
      const { code, io } = await elvaria('lint');
      expect(io.printed.out.join('\n')).toContain(id);
      expect(io.printed.out.join('\n')).not.toContain('no scripture');
      expect(code).toBe(0);
    });

    it('the doctor quotes the entry, and list shows no lesson and does not fail', async () => {
      await ledger();
      const io = testIo({ platform: 'win32' });
      const cli = { io, locale: 'en' as const, localeFromFlag: true, t: translator('en') };
      const ctx = await openKingdomContext({ values: { kingdom }, positionals: [] }, cli);
      if (ctx === undefined) throw new Error('no kingdom');
      const [found] = await checkScripture(ctx);
      expect(found?.level).toBe('ok');
      expect((found?.details ?? []).join('\n')).toContain(id);
      expect((await elvaria('list')).code).toBe(0);
    });
  });

  it('gives the doctor one line: ready, or the counts with the first issues', async () => {
    const io = testIo({ platform: 'win32' });
    const cli = { io, locale: 'en' as const, localeFromFlag: true, t: translator('en') };
    const ctx = await openKingdomContext({ values: { kingdom }, positionals: [] }, cli);
    if (ctx === undefined) throw new Error('no kingdom');
    expect(await checkScripture(ctx)).toEqual([]);
    await scripture('temple/scripture.md', ['- {fail_kind=style} Keep it short.']);
    expect(await checkScripture(ctx)).toEqual([
      { level: 'ok', text: 'Scripture: 1 lessons, nothing to fix.', details: [] },
    ]);
    await scripture('temple/scripture.md', ['- Keep it short.', '- See https://example.com.']);
    expect(await checkScripture(ctx)).toEqual([
      {
        level: 'warn',
        text: 'Scripture: 1 errors, 2 warnings; see elvaria scripture lint.',
        details: [
          'temple/scripture.md:1: warning: no fail_kind: the metrics cannot tell whether the lesson helps',
          'temple/scripture.md:2: error: the sentence holds a URL',
          'temple/scripture.md:2: warning: no fail_kind: the metrics cannot tell whether the lesson helps',
        ],
      },
    ]);
  });
});
