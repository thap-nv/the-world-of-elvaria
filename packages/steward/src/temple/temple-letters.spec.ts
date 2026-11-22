// A temple report's letters, merges and second readings (PS-12c, temple-first plan DB8, ADR 0024, ADR 0005): rungs 1–3
// go to the Chancellor and rung 6 to the owner as proposals from the Monk; a merge takes the Monk's lines out of every
// scripture and appends the one that replaces them; a line the owner deleted is no error; and a report applied again,
// after a stop in the middle or sent twice, writes no line and files no letter twice.
import { attentionQueue, worldStateOf } from '@elvaria/domain';
import type { Instant } from '@elvaria/domain';
import { afterEach, describe, expect, it } from 'vitest';

import {
  FAILED,
  PASSED,
  linesOf,
  monkEntry,
  plantScripture,
  readKingdom,
  report,
  templeBench,
} from '../__fixtures__/temple.ts';
import type { Bench } from '../__fixtures__/kingdom.ts';
import type { Steward } from '../types.ts';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

const letter = (rung: string, to: string, body: string, verdict = FAILED) => ({
  rung,
  to,
  source_verdict: verdict,
  body,
  refs: ['packages/i18n/src/locales/en.json'],
});
const CHECK = letter('check', 'chancellor', 'A check running pnpm i18n:check would catch the missing key.');
const MODEL = letter('model', 'owner', 'Scribes fail wrong_facts on long docs: give them a stronger model.');
const SENTENCE = 'Run the tests of every package you touched before you hand in.';
const ADD = { op: 'add', owner: 'temple', fail_kind: 'tests_fail', text: SENTENCE, source_verdict: FAILED };

async function open(): Promise<{ kingdom: Bench; steward: Steward }> {
  current = await templeBench();
  running = current.steward();
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running };
}

/** What waits for the owner, from the files: the open memos with the rest. */
async function attentionOf(kingdom: Bench) {
  const read = await kingdom.store.kingdom.read();
  if (!read.ok) throw new Error('fixture: kingdom');
  const [territories, characters, quests, memos] = await Promise.all([
    kingdom.store.territories.list(),
    kingdom.store.characters.list(),
    kingdom.store.quests.list(),
    kingdom.store.memos.list(),
  ]);
  const state = worldStateOf({
    kingdom: read.value,
    territories: territories.items,
    characters: characters.items,
    quests: quests.items,
    campaigns: [],
    memos: memos.items,
  });
  return attentionQueue(state, Date.parse('2026-11-19T22:00:00+07:00') as Instant);
}

describe("a temple report's letters (PS-12c)", () => {
  it('files a check for the Chancellor and a stronger model for the owner, each a memo to decide', async () => {
    const { kingdom, steward } = await open();
    const lost = letter('script', 'chancellor', 'A script would do it.', PASSED);
    await report(kingdom, { character: 'sage', operations: [], letters: [CHECK, MODEL, lost] });
    await steward.tick();
    const { items } = await kingdom.store.memos.list();
    const memos = items.map(({ kind, from, quest, attempt, to, body }) => ({
      kind,
      from,
      quest,
      attempt,
      to,
      body,
    }));
    const fields = { kind: 'proposal', from: 'sage', quest: 'q_20261106_7k3m2a', attempt: 1 };
    expect(memos).toHaveLength(2);
    expect(memos).toContainEqual({ ...fields, to: { route: 'chancellor' }, body: CHECK.body });
    expect(memos).toContainEqual({ ...fields, to: { route: 'owner' }, body: MODEL.body });
    const lines = await linesOf(kingdom, 'memo.filed', 'memo.routed');
    expect(lines.map(({ type, actor, data }) => [type, actor.kind, data.route ?? data.from])).toEqual([
      ['memo.filed', 'character', 'sage'],
      ['memo.routed', 'steward', 'chancellor'],
      ['memo.filed', 'character', 'sage'],
      ['memo.routed', 'steward', 'owner'],
    ]);
    expect(kingdom.warnings.filter((warning) => warning.includes('its verdict is no fail'))).toHaveLength(1);
    const queue = await attentionOf(kingdom);
    expect(queue.filter(({ memo }) => memo !== undefined).map(({ kind }) => kind)).toEqual(['memo', 'memo']);
    expect(kingdom.notices).toEqual([
      { kind: 'temple', character: 'sage', added: 0, retired: 0, refused: 0, letters: 2 },
    ]);
  });
});

describe("a temple report's merges and second readings (PS-12c)", () => {
  it("merges the Monk's lines of two scriptures into one, and passes over a line the owner deleted", async () => {
    const { kingdom, steward } = await open();
    const [a, b, gone] = ['L_20261118_aaaaaa', 'L_20261118_bbbbbb', 'L_20261118_cccccc'];
    await plantScripture(kingdom, 'temple', `# Temple\n- [${a}] Run the tests.\n- Owner rule.\n`, [
      monkEntry(a),
    ]);
    await plantScripture(kingdom, 'kael', `- [${b}] Run the package tests.\n`, [
      monkEntry(b),
      monkEntry(gone),
    ]);
    const merge = { ...ADD, op: 'merge', lessons: [a, b] };
    await report(kingdom, { character: 'sage', operations: [merge], letters: [] });
    await steward.tick();
    const temple = await readKingdom(kingdom, 'temple/scripture.md');
    expect(temple).toMatch(
      new RegExp(
        `^# Temple\\n- Owner rule\\.\\n- \\[L_20261119_[0-9a-z]{6}\\] \\{fail_kind=tests_fail\\} ${SENTENCE}\\n$`,
        'u',
      ),
    );
    expect(await readKingdom(kingdom, 'characters/kael/scripture.md')).toBe('');
    const lines = await linesOf(kingdom, 'lesson.added', 'lesson.retired');
    expect(lines.map(({ type, data }) => [type, data.owner, data.lesson])).toEqual([
      ['lesson.retired', 'temple', a],
      ['lesson.retired', 'kael', b],
      ['lesson.added', 'temple', expect.stringMatching(/^L_20261119_/u)],
    ]);
    expect(kingdom.warnings).toEqual([]);
    expect(kingdom.notices).toEqual([
      { kind: 'temple', character: 'sage', added: 1, retired: 2, refused: 0, letters: 0 },
    ]);
  });

  it('completes a report the Steward stopped in, and writes no line and files no letter twice', async () => {
    current = await templeBench();
    const kingdom = current;
    const { scriptures } = kingdom.store;
    let fail = true;
    const store = {
      ...kingdom.store,
      scriptures: {
        ...scriptures,
        writeText: (owner: string, text: string) => {
          if (!fail) return scriptures.writeText(owner, text);
          fail = false;
          return Promise.reject(new Error('the Steward stopped'));
        },
      },
    };
    const first = kingdom.steward({ store });
    expect(await first.start({ loop: false })).toEqual({ ok: true });
    const command = await report(kingdom, { character: 'sage', operations: [ADD], letters: [CHECK] });
    await expect(first.tick()).rejects.toThrow('the Steward stopped');
    await first.stop();
    running = kingdom.steward();
    expect(await running.start({ loop: false })).toEqual({ ok: true });
    await running.tick();
    await report(kingdom, { character: 'sage', operations: [ADD], letters: [CHECK] });
    await report(kingdom, { character: 'sage', operations: [ADD], letters: [CHECK] }, command);
    await running.tick();
    const text = await readKingdom(kingdom, 'temple/scripture.md');
    expect(text.split('\n').filter((line) => line.includes(SENTENCE))).toHaveLength(1);
    const ledger = JSON.parse(await readKingdom(kingdom, 'temple/scripture.json')) as { lessons: unknown[] };
    expect(ledger.lessons).toHaveLength(1);
    expect((await kingdom.store.memos.list()).items).toHaveLength(1);
    expect((await linesOf(kingdom, 'lesson.added')).length).toBe(1);
    expect((await linesOf(kingdom, 'lesson.refused')).map(({ data }) => data.code)).toEqual(['duplicate']);
  });
});
