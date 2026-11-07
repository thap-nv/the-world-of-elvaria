import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LETTER } from '../__fixtures__/world.ts';
import { PROMPTS_DIR } from '../prompt/templates.ts';
import { HANDOVER_SECTIONS, questionOf, readQuestion, sectionOf } from './handover.ts';

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

describe('readQuestion', () => {
  let dir = '';
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'elvaria handover '));
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it('reads the letter after the session', async () => {
    const file = path.join(dir, 'handover.md');
    await writeFile(file, withQuestion('Which branch?'), 'utf8');
    expect(await readQuestion(file)).toBe('Which branch?');
  });

  it('asks nothing without a letter, or without one expected', async () => {
    expect(await readQuestion(path.join(dir, 'missing.md'))).toBeUndefined();
    expect(await readQuestion(undefined)).toBeUndefined();
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
