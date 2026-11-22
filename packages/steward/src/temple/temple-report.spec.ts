// The Monk's temple report, applied by the Steward (PS-12c, temple-first plan, ADR 0005, ADR 0027): one line appended
// or taken out at a time, the owner's lines never touched, a report that would replace a scripture refused whole and
// the files left byte for byte, each refused operation told on its own line, and the next session loading the new line.
import { ScriptureLedgerSchema } from '@elvaria/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { questPayload, tickUntil } from '../__fixtures__/kingdom.ts';
import { statusIs } from '../__fixtures__/review.ts';
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

// The owner's lines, CRLF as Notepad saves them: none of their bytes may change.
const OWNER =
  '# Lessons of the temple\r\n\r\n- Read the file before you edit it.\r\n- {role=verifier} Compare commits.\r\n';
const SENTENCE = 'Run the tests of the touched package before you hand in.';

async function open(text = OWNER, lessons: readonly object[] = []) {
  current = await templeBench();
  await plantScripture(current, 'temple', text, lessons);
  running = current.steward();
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running };
}

const add = (fields: Record<string, unknown> = {}) => ({
  op: 'add',
  owner: 'temple',
  scope: { role: ['assignee'] },
  fail_kind: 'tests_fail',
  text: SENTENCE,
  source_verdict: FAILED,
  ...fields,
});

describe('a temple report applied by the Steward (PS-12c)', () => {
  it('appends one line, writes its ledger, tells it, rings once, and the next session loads it', async () => {
    const { kingdom, steward } = await open();
    const command = await report(kingdom, { character: 'sage', operations: [add()], letters: [] });
    await steward.tick();
    const ledger = ScriptureLedgerSchema.parse(
      JSON.parse(await readKingdom(kingdom, 'temple/scripture.json')),
    );
    const [entry] = ledger.lessons;
    expect(entry).toMatchObject({ source: 'monk', source_verdict: FAILED });
    // Stamped by the bench's clock, in kingdom.tz.
    expect(entry?.added_at).toMatch(/^2026-11-07T\d{2}:\d{2}:\d{2}\+07:00$/u);
    const id = entry?.id ?? '';
    expect(id).toMatch(/^L_20261119_[0-9a-z]{6}$/);
    expect(await readKingdom(kingdom, 'temple/scripture.md')).toBe(
      `${OWNER}- [${id}] {role=assignee fail_kind=tests_fail} ${SENTENCE}\r\n`,
    );
    const lines = await linesOf(kingdom, 'lesson.added', 'command.applied');
    expect(lines.map(({ type, data }) => [type, data])).toEqual([
      [
        'lesson.added',
        {
          lesson: id,
          owner: 'temple',
          scope: { role: ['assignee'] },
          fail_kind: 'tests_fail',
          source: 'monk',
          source_verdict: FAILED,
        },
      ],
      ['command.applied', { command_id: command, kind: 'temple_report', source: 'monk' }],
    ]);
    expect(kingdom.notices).toEqual([
      { kind: 'temple', character: 'sage', added: 1, retired: 0, refused: 0, letters: 0 },
    ]);
    await kingdom.command('create_quest', questPayload('Taught'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Taught', 'done'));
    const [assignee = '', judge = ''] = kingdom.requests.map(({ prompt }) => prompt.user);
    expect(assignee).toContain(`- ${SENTENCE}`);
    expect(assignee).not.toContain(id);
    expect(judge).not.toContain(SENTENCE);
  });

  it('refuses a report that takes every line out and puts them back, and leaves the files byte for byte', async () => {
    const ids = [1, 2, 3, 4, 5, 6].map((n) => `L_20261118_m0000${String(n)}`);
    const text = `${OWNER}${ids.map((id, n) => `- [${id}] Monk rule ${String(n)}.\r\n`).join('')}`;
    const { kingdom, steward } = await open(text, ids.map(monkEntry));
    const before = [
      await readKingdom(kingdom, 'temple/scripture.md'),
      await readKingdom(kingdom, 'temple/scripture.json'),
    ];
    const retires = ids.map((lesson) => ({ op: 'retire', lesson, why: 'all anew' }));
    const operations = [...retires, add({ text: 'Rule one.' }), add({ text: 'Rule two.' })];
    const command = await report(kingdom, { character: 'sage', operations, letters: [] });
    await steward.tick();
    expect([
      await readKingdom(kingdom, 'temple/scripture.md'),
      await readKingdom(kingdom, 'temple/scripture.json'),
    ]).toEqual(before);
    const lines = await linesOf(
      kingdom,
      'lesson.added',
      'lesson.retired',
      'lesson.refused',
      'command.rejected',
    );
    expect(lines.map(({ type, data }) => [type, data])).toEqual([
      [
        'command.rejected',
        { command_id: command, reason: 'replaces_scripture', kind: 'temple_report', source: 'monk' },
      ],
    ]);
    expect(kingdom.notices).toEqual([
      {
        kind: 'temple',
        character: 'sage',
        added: 0,
        retired: 0,
        refused: 8,
        letters: 0,
        rejected: 'replaces_scripture',
      },
    ]);
  });

  it('refuses each operation it may not apply, by name, and writes nothing for it', async () => {
    const text = `${OWNER}- [L_20261118_00wner] An owner line that carries an id.\r\n`;
    const { kingdom, steward } = await open(text);
    await report(kingdom, {
      character: 'sage',
      operations: [
        add({ source_verdict: undefined }),
        add({ source_verdict: PASSED }),
        { op: 'retire', lesson: 'L_20261118_00wner', why: 'the owner wrote it' },
      ],
      letters: [],
    });
    await report(kingdom, {
      character: 'sage',
      operations: [
        add({ text: 'Read https://example.com first.' }),
        add({ text: `Push with ghp_${'a'.repeat(36)} as the token.` }),
        add({ text: 'read the FILE before you edit it.' }),
      ],
      letters: [],
    });
    await steward.tick();
    expect(await readKingdom(kingdom, 'temple/scripture.md')).toBe(text);
    const refused = await linesOf(kingdom, 'lesson.refused');
    expect(refused.map(({ data }) => data)).toEqual([
      { op: 'add', code: 'no_source_verdict' },
      { op: 'add', code: 'unknown_verdict' },
      { op: 'retire', code: 'not_monk_lesson', lesson: 'L_20261118_00wner' },
      { op: 'add', code: 'lint', issues: ['url'] },
      { op: 'add', code: 'lint', issues: ['secret'] },
      { op: 'add', code: 'duplicate' },
    ]);
    expect(kingdom.notices.map((notice) => 'refused' in notice && notice.refused)).toEqual([3, 3]);
  });

  it('refuses the 41st line a session would load, lets one for another tribe through', async () => {
    const forty = Array.from({ length: 40 }, (_, n) => `- Owner rule ${String(n + 1)}.\r\n`).join('');
    const { kingdom, steward } = await open(forty);
    await report(kingdom, {
      character: 'sage',
      operations: [add({ scope: { tribe: ['claude'] } }), add({ scope: { tribe: ['gemini'] } })],
      letters: [],
    });
    await steward.tick();
    expect((await linesOf(kingdom, 'lesson.refused')).map(({ data }) => data)).toEqual([
      { op: 'add', code: 'over_cap' },
    ]);
    expect((await linesOf(kingdom, 'lesson.added')).map(({ data }) => data.scope)).toEqual([
      { tribe: ['gemini'] },
    ]);
  });

  it('applies to the file as the owner left it after the report was written', async () => {
    const { kingdom, steward } = await open();
    await report(kingdom, { character: 'sage', operations: [add()], letters: [] });
    await plantScripture(kingdom, 'temple', `${OWNER}- A line the owner just added.\r\n`);
    await steward.tick();
    const text = await readKingdom(kingdom, 'temple/scripture.md');
    expect(text.startsWith(`${OWNER}- A line the owner just added.\r\n- [L_20261119_`)).toBe(true);
  });

  it('refuses a report of someone who is no Monk', async () => {
    const { kingdom, steward } = await open();
    await report(kingdom, { character: 'kael', operations: [add()], letters: [] });
    await report(kingdom, { character: 'ghost', operations: [add()], letters: [] });
    await steward.tick();
    const rejected = await linesOf(kingdom, 'command.rejected');
    expect(rejected.map(({ data }) => data.reason)).toEqual(['not_monk', 'unknown_character']);
    expect(await readKingdom(kingdom, 'temple/scripture.md')).toBe(OWNER);
  });
});
