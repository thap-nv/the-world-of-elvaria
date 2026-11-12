import { readFile } from 'node:fs/promises';

import { MemoSchema, QuestIdSchema, VerdictSchema } from '@elvaria/domain';
import { journalOf } from '@elvaria/eventlog';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixture, plant, tempKingdom } from '../test/kingdom.ts';
import { openKingdom } from './kingdom-store.ts';
import { kingdomLayout } from './layout.ts';
import { readClassPrompt, readDecree, redactHandover } from './texts.ts';
import type { TempKingdom } from '../test/kingdom.ts';

const QUEST = QuestIdSchema.parse('q_20261106_7k3m2a');
/** A treasury value no pattern knows, and a value with a pattern's shape (a GitHub token). */
const KNOWN = ['plain', '-FAKE-', 'treasury-value-77'].join('');
const SHAPED = ['gh', 'p_', 'abcdefghijklmnopqrstuvwxyz0123456789'].join('');

let kingdom: TempKingdom;
beforeEach(async () => {
  kingdom = await tempKingdom();
});
afterEach(() => kingdom.remove());

describe('kingdomLayout, the parts the event log and the decree share', () => {
  it('names the journal as the event log does, and the decree at the root', () => {
    expect(kingdomLayout.journal(QUEST)).toBe(journalOf(QUEST));
    expect(kingdomLayout.decree()).toBe('decree.md');
  });
});

describe('readDecree', () => {
  it('reads the owner decree, or null when there is none', async () => {
    expect(await readDecree(kingdom.root)).toBeNull();
    await plant(kingdom.root, 'decree.md', '# Decree\n\nCommit messages in English.\n');
    expect(await readDecree(kingdom.root)).toBe('# Decree\n\nCommit messages in English.\n');
  });
});

describe('readClassPrompt (P1-15)', () => {
  it('reads registry/<prompt_file>, or null when it is gone', async () => {
    const scribe = { prompt_file: 'prompts/scribe.md' };
    expect(await readClassPrompt(kingdom.root, scribe)).toBeNull();
    await plant(kingdom.root, 'registry/prompts/scribe.md', 'Write plainly.\n');
    expect(await readClassPrompt(kingdom.root, scribe)).toBe('Write plainly.\n');
  });
});

describe('redactHandover (ADR 0013)', () => {
  const letter = kingdomLayout.handover(QUEST);

  it('masks the session secrets and the patterns, and rewrites only then', async () => {
    expect(await redactHandover(kingdom.root, QUEST, [KNOWN])).toBe(false);
    const file = await plant(kingdom.root, letter, `## Done\nNPM_TOKEN was ${KNOWN}; gh used ${SHAPED}\n`);
    expect(await redactHandover(kingdom.root, QUEST, [KNOWN])).toBe(true);
    const text = await readFile(file, 'utf8');
    expect(text).not.toContain(KNOWN);
    expect(text).not.toContain(SHAPED);
    expect(text).toBe('## Done\nNPM_TOKEN was [redacted]; gh used [redacted]\n');
    expect(await redactHandover(kingdom.root, QUEST, [KNOWN])).toBe(false);
  });
});

describe('verdict notes', () => {
  it('lose every secret shape on write, and are checked again after', async () => {
    const store = openKingdom(kingdom.root);
    const verdict = VerdictSchema.parse(fixture('verdict'));
    const notes = `The test prints the deploy key ${SHAPED} in its output; take it out of the snapshot.`;
    const written = await store.verdicts.write({ ...verdict, notes });
    expect(written).toMatchObject({ ok: true });
    const text = await readFile(`${kingdom.root}/${kingdomLayout.verdict(verdict.id)}`, 'utf8');
    expect(text).not.toContain(SHAPED);
    expect(text).toContain('deploy key [redacted] in its output');
    // A fail needs specific notes; a note that was only a secret is none once masked.
    const short = await store.verdicts.write({ ...verdict, notes: SHAPED });
    expect(short).toMatchObject({ ok: false, error: { code: 'invalid' } });
  });
});

describe('memo texts', () => {
  it('lose every secret shape on write (PS-02): a character wrote them, the Chancellor and the owner read them', async () => {
    const store = openKingdom(kingdom.root);
    const memo = MemoSchema.parse(fixture('memo'));
    const written = await store.memos.write({ ...memo, body: `Rotate the deploy key ${SHAPED} in ci.yml.` });
    expect(written).toMatchObject({ ok: true });
    const text = await readFile(`${kingdom.root}/${kingdomLayout.memo(memo.id)}`, 'utf8');
    expect(text).not.toContain(SHAPED);
    expect(text).toContain('deploy key [redacted] in ci.yml');
    expect((await store.memos.list()).items.map(({ id }) => id)).toEqual([memo.id]);
  });
});
