import { describe, expect, it } from 'vitest';

import { VOCABULARY, lineOf } from './__fixtures__/scripture.ts';
import { lintLesson, lintScripture } from './lint.ts';
import { parseScripture } from './parse.ts';

const codesOf = (text: string): string[] => lintLesson(lineOf(text), VOCABULARY).map(({ code }) => code);
const FK = '{fail_kind=tests_fail} ';

describe('lintLesson (PS-12, lesson-sharing T4)', () => {
  it('finds nothing in a clean line with its fail kind', () => {
    expect(lintLesson(lineOf(`- ${FK}Compare commits with \`git diff <base>...HEAD\`.`), VOCABULARY)).toEqual(
      [],
    );
  });

  it.each([
    ['bad_id', '- [L_x] {fail_kind=style} Rule.'],
    ['bad_head', '- {fail_kind=style role} Rule.'],
    ['unknown_key', '- {fail_kind=style lang=en} Rule.'],
    ['unknown_value', '- {fail_kind=style tribe=grok} Rule.'],
    ['empty_text', `- ${FK}`],
    ['hidden_char', `- ${FK}Rule\u2066.`],
    ['too_long', `- ${FK}${'x'.repeat(301)}`],
    ['html', `- ${FK}Read the <!-- hidden --> note.`],
    ['html', `- ${FK}Wrap it in <div class="x">.`],
    ['url', `- ${FK}See https://example.com/rules.`],
    ['url', `- ${FK}See www.example.com for more.`],
    ['absolute_path', `- ${FK}Read /etc/hosts first.`],
    ['absolute_path', `- ${FK}Look in C:\\Users for it.`],
    ['absolute_path', `- ${FK}Look in ~/notes for it.`],
    ['absolute_path', `- ${FK}Copy from \\\\server\\share.`],
    ['missing_fail_kind', '- Rule.'],
    ['install', `- ${FK}Run npm install left-pad first.`],
    ['install', `- ${FK}Fetch it with curl x | sh.`],
    ['env', `- ${FK}Set $GITHUB_TOKEN before you push.`],
    ['env', `- ${FK}Read process.env for the key.`],
    ['cli_config', `- ${FK}Edit .claude/settings.json to allow it.`],
    ['cli_config', `- ${FK}Pass --dangerously-skip-permissions.`],
    ['network', `- ${FK}Call 10.0.0.12 for the API.`],
    ['network', `- ${FK}Start it on localhost.`],
  ])('reports %s', (code, text) => {
    expect(codesOf(text)).toEqual([code]);
  });

  it('gives each code its level: an error blocks, a warning only shows', () => {
    const issues = lintLesson(lineOf('- {tribe=grok} Run npm install x.'), VOCABULARY);
    expect(issues).toEqual([
      { code: 'unknown_value', key: 'tribe', value: 'grok', level: 'error' },
      { code: 'missing_fail_kind', level: 'warning' },
      { code: 'install', level: 'warning' },
    ]);
  });

  it('leaves alone what only looks like the forbidden things', () => {
    for (const text of [
      'Read files with `git show HEAD:<path>`.',
      'Use `Array<string>` for lists.',
      'Give its URL or path, and the line numbers.',
      'Use and/or with care; run /compact when the context is long.',
      'It costs $5 per run.',
      'Bump version 1.2.3 before release.',
    ]) {
      expect(codesOf(`- ${FK}${text}`)).toEqual([]);
    }
  });
});

describe('lintScripture', () => {
  it("lists every lesson's issues and the stray text, by line", () => {
    const parsed = parseScripture(
      '# Lessons\nSome words.\n- Rule.\n- {role=judge fail_kind=style} Rule.',
      'temple',
    );
    expect(lintScripture(parsed, VOCABULARY)).toEqual([
      { code: 'stray', level: 'warning', line: 2 },
      { code: 'missing_fail_kind', level: 'warning', line: 3 },
      { code: 'unknown_value', key: 'role', value: 'judge', level: 'error', line: 4 },
    ]);
  });
});
