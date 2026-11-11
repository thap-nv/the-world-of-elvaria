// The search lines of a tribe without a search tool (P1-53): git grep options that run a program or reach past the
// tracked files are refused under every spelling git 2.56 accepts (abbreviations, short options run together), and
// a class without a shell runs only lines that PowerShell and bash both read as plain words.
import { describe, expect, it } from 'vitest';

import { grepOptionViolation, plainLineProblem, plainSearchReason, searchCommandOf } from './search.ts';

const SEARCH = ['git grep', 'git ls-files'];
const refused = (command: string) =>
  /^git grep (\S+) is refused/.exec(grepOptionViolation(command) ?? '')?.[1];

describe('grepOptionViolation', () => {
  it.each([
    ['git grep -O vim x', '-O'],
    ['git grep -Ovim x', '-O'],
    ['git grep -nOecho hello', '-O'],
    ['git grep -n5O x', '-O'],
    ['git grep x --open-files-in-pager', '--open-files-in-pager'],
    ['git grep --open-files-in-pager=code x', '--open-files-in-pager'],
    ['git grep --open x', '--open-files-in-pager'],
    ['git grep --no-index SECRET', '--no-index'],
    ['git grep --no-ind SECRET', '--no-index'],
    ['git grep --untracked SECRET', '--untracked'],
    ['git grep --untr SECRET', '--untracked'],
    ['git grep --textconv x', '--textconv'],
    ['git grep --textc x', '--textconv'],
    // Quotes, escapes and PowerShell's array comma hide nothing.
    ['git grep "--no-index" SECRET', '--no-index'],
    ["git grep '-O' x", '-O'],
    ['git grep --no-`index SECRET', '--no-index'],
    ['git grep \\-O x', '-O'],
    ['git grep x,-O', '-O'],
    // git's own path and options before the subcommand.
    ['"C:\\Program Files\\Git\\cmd\\git.exe" grep -O x', '-O'],
    ['git -C . grep --no-index x', '--no-index'],
    ['git status; git grep -O x', '-O'],
    // A value spelled like a refused option: refused, since no quoting rule both shells share tells them apart.
    ["git grep -e '--no-index'", '--no-index'],
  ])('%s → %s', (command, option) => {
    expect(refused(command)).toBe(option);
  });

  it.each([
    "git grep -n -e 'P1-53' -- 'docs/implementation-plan.md'",
    'git grep -niw -C 3 Open',
    'git grep -eOpen',
    'git grep -A3 -B2 -m 1 x',
    'git grep --text --no-textconv --index --no-untracked x',
    'git grep --or --only-matching --null --name-only x',
    'git grep --no-open-files-in-pager x',
    'git log --grep x --untracked',
    'git ls-files --others --ignored -o',
    'pnpm test -O',
    'grep -O x',
  ])('lets %s through', (command) => {
    expect(grepOptionViolation(command)).toBeUndefined();
  });

  it('names what the option would do', () => {
    expect(grepOptionViolation('git grep --no-index x')).toMatch(/reaches files git does not track/);
  });
});

describe('plainLineProblem', () => {
  it.each([
    "git grep -n -e 'P1-53' -- 'docs/*.md'",
    "git grep -nE 'a|b$' -- 'src/(x)/{y}'",
    'git grep -n "plain words" docs\\plan.md',
    "git grep -F 'it''s'",
    "git ls-files --format='%(path)' docs/",
  ])('takes %s', (command) => {
    expect(plainLineProblem(command)).toBeUndefined();
  });

  it.each([
    ['git grep x; Remove-Item src', '; outside quotes'],
    ['git grep x | Out-File notes.md', '| outside quotes'],
    ['git grep x > notes.md', '> outside quotes'],
    ['git grep x && rm -rf src', '& outside quotes'],
    ['git grep $(Remove-Item src)', '$ outside quotes'],
    ['git grep (Remove-Item src)', '( outside quotes'],
    ['git grep $env:API_KEY', '$ outside quotes'],
    ['git grep @args', '@ outside quotes'],
    ['git grep `whoami`', '` outside quotes'],
    ['git grep a,-O', ', outside quotes'],
    ['git grep x -- *.md', '* outside quotes'],
    ['git grep "$(Remove-Item src)"', '$ inside double quotes'],
    ['git grep "a`"; rm x"', '` inside double quotes'],
    ['git grep "a\\" ; rm -rf src ; "\\""', 'a backslash before a quote'],
    ["git grep 'x", 'a quote left open'],
    ['git grep x\ngit status', 'a line break'],
    ['git grep \u201cx\u201d', 'a typographic quote'],
  ])('refuses %s: %s', (command, problem) => {
    expect(plainLineProblem(command)).toBe(problem);
  });
});

describe('searchCommandOf', () => {
  it('reads the command the line starts with, as a prefix rule does', () => {
    expect(searchCommandOf("git grep -n 'x'", SEARCH)).toBe('git grep');
    expect(searchCommandOf('  git ls-files', SEARCH)).toBe('git ls-files');
    expect(searchCommandOf('git grep\t-n x', SEARCH)).toBe('git grep');
    expect(searchCommandOf('git grepx', SEARCH)).toBeUndefined();
    expect(searchCommandOf('git status', SEARCH)).toBeUndefined();
    expect(searchCommandOf('git grep x', [])).toBeUndefined();
  });

  it('says what a class without a shell may run', () => {
    expect(plainSearchReason('; outside quotes', SEARCH)).toBe(
      'your class has no shell, only git grep and git ls-files, each alone on its line with its patterns and paths in single quotes; this line has ; outside quotes',
    );
  });
});
