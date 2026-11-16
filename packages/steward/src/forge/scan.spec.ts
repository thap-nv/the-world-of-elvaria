// The secret scan before a push (PS-08c): a treasury value or a specific shape on an added line stops the push, a
// shared pattern only warns, and only what the branch adds counts.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { REDACT_PATTERNS } from '@elvaria/eventlog';
import { describe, expect, it } from 'vitest';

import { SHARED_PATTERN_COUNT, scanDiff } from './scan.ts';

const PATTERNS_FILE = path.join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'eventlog',
  'src',
  'redact-patterns.json',
);

/** Built in parts, so no scanner of this repo takes the spec for a leak. */
const ANTHROPIC_KEY = ['sk-ant-', 'api03-', 'A1b2C3d4E5f6G7h8I9j0K1l2'].join('');
const TREASURY_VALUE = ['plain', '-FAKE-', 'treasury-value-77'].join('');
const ASSIGNMENT = 'const token = "abcdefghijklmnop";';

/** A `git diff -U0` of one file: its headers, then each line of `hunk` as given (`+…`, `-…`). */
const fileDiff = (file: string, hunk: readonly string[], from = `a/${file}`, to = `b/${file}`) => [
  `diff --git a/${file} b/${file}`,
  `index 1111111..2222222 100644`,
  `--- ${from}`,
  `+++ ${to}`,
  '@@ -1,0 +2 @@',
  ...hunk,
];

const diffOf = (...files: readonly (readonly string[])[]): string => `${files.flat().join('\n')}\n`;

describe('redact-patterns.json, as the scan splits it', () => {
  it('lists the three shared patterns last, and REDACT_PATTERNS keeps every one in file order', () => {
    const file = JSON.parse(readFileSync(PATTERNS_FILE, 'utf8')) as { patterns: { id: string }[] };
    const ids = file.patterns.map(({ id }) => id);
    expect(ids.slice(-SHARED_PATTERN_COUNT)).toEqual([
      'bearer_token',
      'url_credentials',
      'secret_assignment',
    ]);
    expect(ids).toHaveLength(REDACT_PATTERNS.length);
  });
});

describe('scanDiff', () => {
  it('names a file that adds a specific shape or a treasury value as a secret', () => {
    const diff = diffOf(
      fileDiff('src/key.ts', [`+export const key = '${ANTHROPIC_KEY}';`]),
      fileDiff('config/npm.ts', [`+export const npm = '${TREASURY_VALUE}';`]),
      fileDiff('src/clean.ts', ['+export const clean = 1;']),
    );
    expect(scanDiff(diff, [TREASURY_VALUE])).toEqual({
      secrets: ['config/npm.ts', 'src/key.ts'],
      warnings: [],
    });
  });

  it('only warns of a shared pattern, and a file with a secret too counts as a secret alone', () => {
    const diff = diffOf(
      fileDiff('src/auth.spec.ts', [`+${ASSIGNMENT}`]),
      fileDiff('src/both.ts', [`+${ASSIGNMENT}`, `+const key = '${ANTHROPIC_KEY}';`]),
      fileDiff('src/later.ts', [`+const key = '${ANTHROPIC_KEY}';`, `+${ASSIGNMENT}`]),
    );
    expect(scanDiff(diff, [])).toEqual({
      secrets: ['src/both.ts', 'src/later.ts'],
      warnings: ['src/auth.spec.ts'],
    });
  });

  it('reads no removed line and no header, but an added line that starts with ++ is added', () => {
    const removed = diffOf(
      fileDiff('src/old.ts', [`-const key = '${ANTHROPIC_KEY}';`, `-${ASSIGNMENT}`], `a/${ANTHROPIC_KEY}.ts`),
      fileDiff(`${ANTHROPIC_KEY}.ts`, ['+export const renamed = 1;']),
    );
    expect(scanDiff(removed, [])).toEqual({ secrets: [], warnings: [] });
    const plusPlus = diffOf(fileDiff('notes.md', [`+++ ${ASSIGNMENT}`, `+++ b/${TREASURY_VALUE}`]));
    expect(scanDiff(plusPlus, [TREASURY_VALUE])).toEqual({ secrets: ['notes.md'], warnings: [] });
  });

  it('gives a deletion no file, so nothing under it is put on the file before', () => {
    const diff = diffOf(
      fileDiff('src/kept.ts', ['+export const kept = 1;']),
      fileDiff(
        'src/gone.ts',
        [`+${ASSIGNMENT}`, `+const key = '${ANTHROPIC_KEY}';`],
        'a/src/gone.ts',
        '/dev/null',
      ),
    );
    expect(scanDiff(diff, [])).toEqual({ secrets: [], warnings: [] });
  });

  it("names a path with a space without git's closing tab, and a quoted path by its own name", () => {
    const spaced = fileDiff('src/my file.ts', [`+${ASSIGNMENT}`], 'a/src/my file.ts\t', 'b/src/my file.ts\t');
    const quoted = fileDiff(
      'src/say.ts',
      [`+const key = '${ANTHROPIC_KEY}';`],
      '/dev/null',
      String.raw`"b/src/say \"hi\"\tnow\\\001.ts"`,
    );
    expect(scanDiff(diffOf(spaced, quoted), [])).toEqual({
      secrets: ['src/say "hi"\tnow\\\u0001.ts'],
      warnings: ['src/my file.ts'],
    });
  });

  it('ignores an empty treasury value, which every line holds', () => {
    const diff = diffOf(fileDiff('src/clean.ts', ['+export const clean = 1;']));
    expect(scanDiff(diff, [''])).toEqual({ secrets: [], warnings: [] });
  });
});
