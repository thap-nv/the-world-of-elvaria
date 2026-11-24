// The words of the Steward's minimal letter (P1-55, gap 23 of the PS-07 report): the letter after a refused hook keeps
// the text P1-55 wrote, word for word; any other cut says its trip, where the work is and the files the plot changed.
import { describe, expect, it } from 'vitest';

import { cutLetterOf, letterDiffOf, stopLeftOf, stopLetterOf } from './stop-letter.ts';
import type { QuestId } from '@elvaria/domain';
import type { Refusal } from './stop-letter.ts';

const QUEST = { id: 'q-20261114-abc' as QuestId };
const ODO = { character: 'odo', trip: 'time' };

const REFUSAL: Refusal = {
  status: 'refused',
  detail: 'lint failed: src/app.ts\n1 error',
  head: { lines: [], total_lines: 2, errors: 1 },
  patch: '.runs/q-1/wip.patch',
  files: ['src/app.ts', 'src/b.ts'],
};

/** The headings of the handover template, in order, ending on an empty Question. */
const HEADINGS =
  /## Where I am[\s\S]*## Done[\s\S]*## Not done[\s\S]*## Tried and failed[\s\S]*## Decisions taken[\s\S]*## Next step\n\n[^\n]+\n\n## Question\n$/;

describe('the letter after a refused hook (P1-55)', () => {
  it('keeps its words', () => {
    expect(stopLetterOf(QUEST, ODO, REFUSAL)).toBe(
      [
        '# Handover · q-20261114-abc',
        '',
        '<!-- Written by the Steward, not by odo: its session ended (time) before a letter was written. -->',
        '',
        '## Where I am',
        '',
        "The session ended (time) and the territory's commit hook refused the work it left. That work is in the plot, staged and not committed. A copy of it as a patch is in .runs/q-1/wip.patch (sessions cannot read it).",
        '',
        '## Done',
        '',
        'Nothing was committed. The plot holds changes to 2 file(s):',
        '',
        '- src/app.ts',
        '- src/b.ts',
        '',
        '## Not done',
        '',
        'Not known: read the quest, then the changes in the plot (`git status`, `git diff --cached`).',
        '',
        '## Tried and failed',
        '',
        "The territory's commit hook refused the commit. The end of its output:",
        '',
        '```text',
        'lint failed: src/app.ts',
        '1 error',
        '```',
        '',
        '## Decisions taken',
        '',
        'None recorded: the session was cut before it wrote any.',
        '',
        '## Next step',
        '',
        'Fix what the hook complains about in the files above, or finish the work first, then write this letter in full.',
        '',
        '## Question',
        '',
      ].join('\n'),
    );
    const { patch: _patch, files: _files, ...withoutCopy } = REFUSAL;
    const bare = stopLetterOf(QUEST, ODO, withoutCopy);
    expect(bare).toContain('Nothing was committed. The plot holds the changes of the cut session.');
    expect(bare).not.toContain('A copy of it');
  });

  it('names commands.setup and its log when setup, run again before the commit, failed (fix/plot-setup-on-lockfile)', () => {
    const setup = { detail: 'pnpm install: ended with 1', log: '.runs/q-setup.log' };
    const letter = stopLetterOf(QUEST, ODO, {
      status: 'refused',
      detail:
        'commands.setup failed before the commit (pnpm install: ended with 1); its log: .runs/q-setup.log',
      head: { lines: [], total_lines: 1, errors: 0 },
      setup,
    });
    expect(letter).toContain(
      'commands.setup, run again before the commit since the work changed a file it reads, failed. That work is in the plot, not committed.',
    );
    expect(letter).toContain('commands.setup failed before the commit; its log is .runs/q-setup.log:');
    expect(letter).toContain(
      'Fix the files commands.setup reads (a lockfile, a package.json) until it passes',
    );
    expect(letter).not.toContain('commit hook');
  });
});

describe('the letter after any other cut (gap 23 of PS-07)', () => {
  it('names the WIP commit and the files the plot changed, under the template headings', () => {
    const files = Array.from({ length: 32 }, (_, index) => `src/f${String(index).padStart(2, '0')}.ts`);
    const letter = cutLetterOf(
      QUEST,
      { character: 'odo', trip: 'tokens' },
      { status: 'committed', sha: 'abc1234' },
      files,
    );
    expect(letter).toMatch(HEADINGS);
    expect(letter).toContain('Written by the Steward, not by odo: its session ended (tokens)');
    expect(letter).toContain("committed the work it left as WIP abc1234 on the quest's branch");
    expect(letter).toContain('in 32 file(s), committed or not:\n\n- src/f00.ts\n');
    expect(letter).toContain('- src/f29.ts\n- … and 2 more\n');
    expect(letter).toContain('The journal of the quest tells what it did.');
  });

  it('says where the work is for every other end of the WIP commit, and when git cannot list the files', () => {
    const letter = (left: Parameters<typeof cutLetterOf>[2], files?: readonly string[]) =>
      cutLetterOf(QUEST, ODO, left, files);
    expect(letter({ status: 'clean' }, [])).toContain('It left nothing uncommitted in the plot.');
    expect(letter({ status: 'clean' }, [])).toContain('No file differs from where the quest started.');
    expect(letter({ status: 'no_git' })).toContain('The plot has no git');
    expect(letter({ status: 'no_git' })).toContain('Not known: git could not list the changes of the plot.');
    const forbidden = letter({ status: 'forbidden', paths: ['.env'] }, ['.env', 'src/app.ts']);
    expect(forbidden).toContain(
      'laws.forbidden_paths, so the Steward committed nothing. That work is in the plot',
    );
    expect(forbidden).toContain('The work changed these forbidden paths:\n\n- .env\n');
    expect(forbidden).toContain('The owner looks at the plot first.');
    const patch = letter({ status: 'patch_refused', detail: 'it touches docs/a.md' }, ['src/app.ts']);
    expect(patch).toContain('could not apply the patch it left, so nothing was committed');
    expect(patch).toContain('The patch was refused: it touches docs/a.md');
    for (const text of [forbidden, patch]) expect(text).toMatch(HEADINGS);
  });
});

describe("the branch's diff in the letter after a cut (fix/stop-letter, (213))", () => {
  const COMMITTED = { status: 'committed', sha: 'abc1234' } as const;
  const DIFF = [
    ' src/app.ts | 2 +-',
    ' 1 file changed, 1 insertion(+), 1 deletion(-)',
    '',
    'diff --git a/src/app.ts b/src/app.ts',
    '-export const app = 1;',
    '+export const app = 2;',
    '',
  ].join('\n');

  it('follows the files under Done, and Not done says to weigh it against the quest first', () => {
    const letter = cutLetterOf(QUEST, ODO, COMMITTED, ['src/app.ts'], DIFF);
    expect(letter).toMatch(HEADINGS);
    expect(letter).toContain(
      [
        'committed or not:',
        '',
        '- src/app.ts',
        '',
        "The branch's commits since the quest started (work not committed is not in them):",
        '',
        '```diff',
        ' src/app.ts | 2 +-',
        ' 1 file changed, 1 insertion(+), 1 deletion(-)',
        '',
        'diff --git a/src/app.ts b/src/app.ts',
        '-export const app = 1;',
        '+export const app = 2;',
        '```',
        '',
        '## Not done',
        '',
        'The Steward cannot tell. Compare the quest with the diff under Done before you read anything else:',
      ].join('\n'),
    );
    expect(letter).not.toContain('Not known: read the quest');
    // No diff, or one of blanks: the letter of before.
    for (const diff of [undefined, ' \n'])
      expect(cutLetterOf(QUEST, ODO, { status: 'clean' }, [], diff)).toContain(
        '## Done\n\nNo file differs from where the quest started.\n\n## Not done\n\nNot known: read the quest',
      );
  });

  it('is fenced longer than any run of backticks it quotes', () => {
    const markdown = 'diff --git a/README.md b/README.md\n+```ts\n+const a = 1;\n+```\n';
    expect(cutLetterOf(QUEST, ODO, COMMITTED, ['README.md'], markdown)).toContain(
      '````diff\ndiff --git a/README.md b/README.md\n+```ts\n+const a = 1;\n+```\n````\n',
    );
  });

  it('is cut at a line end, saying where the rest is', () => {
    // 100 lines of 50 characters: 5 099 with the line ends between them, more than a letter carries.
    const long = Array.from(
      { length: 100 },
      (_, index) => `+${String(index).padStart(3, '0')} ${'y'.repeat(45)}`,
    );
    const letter = cutLetterOf(QUEST, ODO, COMMITTED, ['src/app.ts'], long.join('\n'));
    expect(letter).toContain(
      `${long[77] ?? ''}\n[diff cut at 4000 characters: the files listed above hold the rest]\n\`\`\`\n`,
    );
    expect(letter).not.toContain('+078 ');
    // Whole when it fits, its last line end aside; one character more and its last line goes.
    expect(letterDiffOf('+a\n+b\n', 5)).toBe('+a\n+b');
    expect(letterDiffOf('+abc\n+def\n', 6)).toBe(
      '+abc\n[diff cut at 6 characters: the files listed above hold the rest]',
    );
  });
});

describe('what a cut session left', () => {
  it('is its WIP commit, else the commit its trip already was, else nothing', () => {
    const committed = { status: 'committed', sha: 'abc1234' } as const;
    expect(stopLeftOf(committed, { refused: REFUSAL })).toBe(committed);
    expect(stopLeftOf(undefined, { refused: REFUSAL })).toBe(REFUSAL);
    expect(stopLeftOf(undefined, { patch: 'why' })).toEqual({ status: 'patch_refused', detail: 'why' });
    expect(stopLeftOf(undefined, { paths: ['.env'] })).toEqual({ status: 'forbidden', paths: ['.env'] });
    expect(stopLeftOf(undefined, {})).toBeUndefined();
  });
});
