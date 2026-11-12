import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RM_TEMP } from '../__fixtures__/temp.ts';
import { LETTER } from '../__fixtures__/world.ts';
import { PROMPTS_DIR } from '../prompt/templates.ts';
import { HANDOVER_SECTIONS, memosOf, questionOf, readQuestion, sectionOf } from './handover.ts';

const withQuestion = (text: string) => `${LETTER}\n${text}\n`;

describe('sectionOf', () => {
  it('reads one section up to the next heading', () => {
    expect(sectionOf(LETTER, 'Tried and failed')).toBe(
      '- `pnpm -r check`: mỗi package không có script `check`.',
    );
    expect(sectionOf(LETTER, 'Next step')).toBe('Nộp.');
  });

  it('matches headings whatever their case, closing hashes or line ends', () => {
    expect(sectionOf('## next STEP ##\r\nShip it.\r\n## Question\r\n', 'Next step')).toBe('Ship it.');
  });

  it('is undefined for a missing or empty section', () => {
    expect(sectionOf('# Letter\n\nNo sections.', 'Done')).toBeUndefined();
    expect(sectionOf(LETTER, 'Question')).toBeUndefined();
  });
});

describe('questionOf', () => {
  it('is the Question section when the character wrote one', () => {
    expect(questionOf(withQuestion('Release notes on main or on release/1.4?'))).toBe(
      'Release notes on main or on release/1.4?',
    );
  });

  it.each(['', '-', '—', 'None', 'none.', 'N/A', 'Không', 'không có.'])(
    'treats "%s" as no question',
    (text) => {
      expect(questionOf(withQuestion(text))).toBeUndefined();
    },
  );
});

describe('memosOf (PS-02)', () => {
  const withMemos = (lines: string) => `## Next step\n\nNộp.\n\n## Memos\n\n${lines}\n\n## Question\n`;

  it('reads one memo per line, its refs at the end, the kind in lower case', () => {
    const letter = withMemos(
      [
        '- proposal: `quest list` in giờ UTC; nên dùng múi giờ của vương quốc. refs: apps/cli/src/quest/list.ts, `apps/cli/src/table.ts`',
        '* Proposal: README của store còn nói năm file.',
      ].join('\n'),
    );
    expect(memosOf(letter)).toEqual({
      memos: [
        {
          kind: 'proposal',
          body: '`quest list` in giờ UTC; nên dùng múi giờ của vương quốc.',
          refs: ['apps/cli/src/quest/list.ts', 'apps/cli/src/table.ts'],
        },
        { kind: 'proposal', body: 'README của store còn nói năm file.', refs: [] },
      ],
      malformed: [],
    });
  });

  it('goes on with an indented line, as a Markdown list item does', () => {
    const letter = withMemos('- proposal: Tách file\n  request.ts trước khi thêm. Refs: a.ts,  ,b.ts');
    expect(memosOf(letter).memos).toEqual([
      { kind: 'proposal', body: 'Tách file request.ts trước khi thêm.', refs: ['a.ts', 'b.ts'] },
    ]);
  });

  it.each(['-', '- none', 'Không.', '-\n-'])('finds nothing and warns of nothing in "%s"', (lines) => {
    expect(memosOf(withMemos(lines))).toEqual({ memos: [], malformed: [] });
  });

  it('finds nothing in a letter without the section, or with it empty', () => {
    expect(memosOf(LETTER)).toEqual({ memos: [], malformed: [] });
    expect(memosOf(withMemos(''))).toEqual({ memos: [], malformed: [] });
  });

  it('leaves out the lines that follow no memo, and says which', () => {
    const letter = withMemos(
      'Fix the README too.\n- proposal: Thêm test cho list.\n-proposal: no space\n- : no kind',
    );
    expect(memosOf(letter)).toEqual({
      memos: [{ kind: 'proposal', body: 'Thêm test cho list.', refs: [] }],
      malformed: ['Fix the README too.', '-proposal: no space', '- : no kind'],
    });
  });
});

describe('readQuestion', () => {
  let dir = '';
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'elvaria handover '));
  });
  afterAll(() => rm(dir, RM_TEMP));

  it('reads the letter after the session', async () => {
    const file = path.join(dir, 'handover.md');
    await writeFile(file, withQuestion('Which branch?'), 'utf8');
    expect(await readQuestion(file)).toBe('Which branch?');
  });

  it('asks nothing without a letter, or without one expected', async () => {
    expect(await readQuestion(path.join(dir, 'missing.md'))).toBeUndefined();
    expect(await readQuestion(undefined)).toBeUndefined();
  });

  it('asks nothing when a folder on the way is a file, on every OS (ENOENT on Windows, ENOTDIR on POSIX)', async () => {
    const blocker = path.join(dir, 'a-file');
    await writeFile(blocker, 'not a folder', 'utf8');
    expect(await readQuestion(path.join(blocker, 'handover.md'))).toBeUndefined();
  });

  it('lets any other read error through', async () => {
    await expect(readQuestion(dir)).rejects.toMatchObject({ code: 'EISDIR' });
  });
});

describe('prompts/handover.md', () => {
  it('has exactly the headings the runner reads, in order', async () => {
    const template = await readFile(path.join(PROMPTS_DIR, 'handover.md'), 'utf8');
    const headings = [...template.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
    expect(headings).toEqual([...HANDOVER_SECTIONS]);
  });

  it('asks nothing when the character leaves the template as it is', async () => {
    expect(questionOf(await readFile(path.join(PROMPTS_DIR, 'handover.md'), 'utf8'))).toBeUndefined();
  });
});
