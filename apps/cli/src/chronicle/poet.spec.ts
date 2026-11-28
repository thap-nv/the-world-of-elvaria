// The Bard's port (P2-06b) with a scripted runner (no mana): prose that passes the machine's check is appended under
// the machine's part; prose that names a quest the ledger lacks is asked for once more, then dropped; a token in a
// quest's title reaches neither the model nor the file.
import { readFile } from 'node:fs/promises';

import { ChronicleLedgerSchema, CharacterIdSchema, LEDGER_KINDS, TribeIdSchema } from '@elvaria/domain';
import type { ChronicleLedger } from '@elvaria/domain';
import { translator } from '@elvaria/i18n';
import { inKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../__fixtures__/cli.ts';
import { QUEST_ID } from '../__fixtures__/quest.ts';
import { MONK_TOKENS, monkRunner } from '../__fixtures__/temple.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { fileChronicle } from './chronicle-file.ts';
import { filePoet } from './poet.ts';
import type { TempDir, TestIo } from '../__fixtures__/cli.ts';
import type { MonkAnswer } from '../__fixtures__/temple.ts';

const TOKEN = `sk-ant-${'x'.repeat(24)}`;
const DAY = '2026-11-06';
const FILE = `chronicle/${DAY}.md`;

const ledger: ChronicleLedger = ChronicleLedgerSchema.parse({
  version: 1,
  day: DAY,
  tz: 'Asia/Ho_Chi_Minh',
  entries: [
    {
      at: `${DAY}T10:00:00+07:00`,
      kind: 'quest_done',
      quest: QUEST_ID,
      title: `Rotate ${TOKEN}`,
      character: { id: 'thorn', name: 'Thorn' },
    },
  ],
  counts: Object.fromEntries(LEDGER_KINDS.map((kind) => [kind, kind === 'quest_done' ? 1 : 0])),
  quests: 1,
  characters: [{ id: 'thorn', name: 'Thorn' }],
});

const GOOD = `Thorn finished quest ${QUEST_ID} before noon.`;
const MADE_UP = 'Thorn finished quest q_20261106_zzzzzz, a quest nobody gave.';

describe('the Bard of the chronicle (P2-06b)', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    const io = testIo();
    const added = await run(io, 'character', 'add', 'lyra', '--class', 'bard', '--kingdom', kingdom);
    if (added !== 0) throw new Error(io.printed.err.join('\n'));
    await fileChronicle(translator('en'), kingdom, 'Bình Minh').write({ day: DAY, ledger });
  });
  afterEach(() => dir.remove());

  async function write(answers: readonly MonkAnswer[], io: TestIo = testIo()) {
    const ctx = await openKingdomContext(
      { values: { kingdom }, positionals: [] },
      { io, locale: 'en', localeFromFlag: true, t: translator('en') },
    );
    if (ctx === undefined) throw new Error(io.printed.err.join('\n'));
    const runner = monkRunner(answers, 'claude');
    const signal = new AbortController().signal;
    const result = await filePoet(ctx, { [TribeIdSchema.parse('claude')]: runner }).write({
      day: DAY,
      ledger,
      file: FILE,
      bard: CharacterIdSchema.parse('lyra'),
      signal,
    });
    return { result, runner, io, markdown: await readFile(inKingdom(kingdom, FILE), 'utf8') };
  }

  it('appends prose that passes under the machine’s part, with what the session spent', async () => {
    const { result, runner, markdown } = await write([{ text: GOOD }]);
    expect(result).toEqual({
      prose: true,
      spent: { tribe: 'claude', model: 'claude-sonnet-5-5', tokens: MONK_TOKENS, session: 'monk-1' },
    });
    expect(markdown).toContain('# Chronicle of Bình Minh · 2026-11-06');
    expect(
      markdown.endsWith(
        `\n\n## The Bard’s tale\n\n_Lyra the Bard wrote this part from the ledger above; the machine checked every quest and character it names._\n\n${GOOD}\n`,
      ),
    ).toBe(true);
    expect(runner.heard).toHaveLength(1);
    expect(runner.heard[0]?.role).toBe('bard');
    expect(runner.heard[0]?.permissions.tools).toEqual([]);
    expect(JSON.stringify(runner.heard[0]?.prompt)).not.toContain(TOKEN);
  });

  it('asks once more with the errors, then drops prose that names a quest the ledger lacks', async () => {
    const { result, runner, io, markdown } = await write([{ text: MADE_UP }, { text: MADE_UP }]);
    expect(result).toEqual({
      prose: false,
      spent: { tribe: 'claude', model: 'claude-sonnet-5-5', tokens: 2 * MONK_TOKENS, session: 'monk-2' },
    });
    expect(runner.heard[1]?.prompt.user).toContain(
      '- names quest q_20261106_zzzzzz, which the ledger does not hold',
    );
    expect(markdown).not.toContain('The Bard’s tale');
    expect(io.printed.err).toEqual([
      'Chronicle 2026-11-06: Lyra’s prose was refused twice (names quest q_20261106_zzzzzz, which the ledger does not hold); the machine’s part stands.',
    ]);
  });

  it('keeps the second try when it passes, and names the Bard idle that day as an error', async () => {
    const idle = `${GOOD} Lyra sang of it.`;
    const { result, runner, markdown } = await write([{ text: idle }, { text: GOOD }]);
    expect(result.prose).toBe(true);
    expect(runner.heard[1]?.prompt.user).toContain("- names Lyra, who is not among the day's characters");
    expect(markdown).toContain(`\n${GOOD}\n`);
    expect(markdown).not.toContain('Lyra sang');
  });

  it('redacts a secret in the prose before the file holds it', async () => {
    const { result, markdown } = await write([{ text: `${GOOD} The key was ${TOKEN}.` }]);
    expect(result.prose).toBe(true);
    expect(markdown).not.toContain(TOKEN);
    expect(markdown).toContain('The key was [redacted].');
  });

  it('opens no session when the file holds the prose already', async () => {
    await write([{ text: GOOD }]);
    const again = await write([{ text: GOOD }]);
    expect(again.result).toEqual({ prose: true });
    expect(again.runner.heard).toEqual([]);
    expect(again.markdown.split('The Bard’s tale')).toHaveLength(2);
  });

  it('says why a session gave no prose, and keeps the machine’s part', async () => {
    const { result, io, markdown } = await write([{}]);
    expect(result).toEqual({
      prose: false,
      spent: { tribe: 'claude', model: 'claude-sonnet-5-5', tokens: 0 },
    });
    expect(io.printed.err.join('\n')).toContain(
      'Chronicle 2026-11-06: Lyra’s session gave no prose (no_reply)',
    );
    expect(markdown).not.toContain('The Bard’s tale');
  });
});
