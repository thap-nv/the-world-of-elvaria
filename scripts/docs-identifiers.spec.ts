import { describe, expect, it } from 'vitest';

import {
  ALLOWED,
  bannedIdentifierProblems,
  codeTokens,
  dataIdProblems,
  jsonTokens,
  scansIdentifiers,
  wordsOf,
} from './docs-identifiers.mjs';

const BANNED = [
  { word: 'dispatcher', use: 'steward', scan: true },
  { word: 'worker', use: 'assignee', scan: true },
  { word: 'team', use: 'party', scan: true },
  { word: 'budget', use: 'mana', scan: false },
];

describe('wordsOf', () => {
  it('splits camelCase, PascalCase, snake_case, kebab-case and dotted names into lowercase words', () => {
    expect(wordsOf('dispatcherQueue')).toEqual(['dispatcher', 'queue']);
    expect(wordsOf('HTTPDispatcher')).toEqual(['http', 'dispatcher']);
    expect(wordsOf('worker_id.v2-final')).toEqual(['worker', 'id', 'v2', 'final']);
  });

  it('drops the names third parties fix before splitting', () => {
    expect(ALLOWED.has('projectService')).toBe(true);
    expect(wordsOf('projectService')).toEqual([]);
    expect(wordsOf('repo/dc1-se-team/src')).toEqual(['repo', 'src']);
    expect(wordsOf('${CLAUDE_PROJECT_DIR}/.claude/hooks/x.mjs')).toEqual(['claude', 'hooks', 'x', 'mjs']);
  });
});

describe('codeTokens', () => {
  it('keeps identifiers and id-shaped strings, drops comments and prose strings', () => {
    const source = [
      '// the dispatcher in a comment is prose',
      'const queue = { kind: "steward" };',
      'const note = "a sentence with spaces";',
      '/** @param {string} url */',
      'export function send(url) { return `${url}` + "https://example.com/x"; }',
    ].join('\n');
    expect(codeTokens('a.mjs', source)).toEqual([
      { text: 'queue', line: 2 },
      { text: 'kind', line: 2 },
      { text: 'steward', line: 2 },
      { text: 'note', line: 3 },
      { text: 'send', line: 5 },
      { text: 'url', line: 5 },
      { text: 'url', line: 5 },
    ]);
  });

  it('reads TypeScript types and private names', () => {
    const tokens = codeTokens('a.ts', 'type Queue = { slot: number };\nclass A { #slot = 1 }');
    expect(tokens.map((token) => token.text)).toEqual(['Queue', 'slot', 'A', '#slot']);
  });
});

describe('jsonTokens', () => {
  it('keeps keys and id-shaped values with the line they first appear on', () => {
    const text = '{\n  "kind": "fix",\n  "name_en": "Build it",\n  "tags": ["fix", "Upper"]\n}';
    expect(jsonTokens(text)).toEqual([
      { text: 'kind', line: 2 },
      { text: 'fix', line: 2 },
      { text: 'name_en', line: 3 },
      { text: 'tags', line: 4 },
    ]);
  });

  it('keeps only keys when the values are display strings', () => {
    expect(jsonTokens('{"messages": {"a.b": "steward"}}', true).map((token) => token.text)).toEqual([
      'messages',
      'a.b',
    ]);
  });
});

describe('scansIdentifiers', () => {
  it('scans shipped code and data, not tests, fixtures, tool config, docs or the glossary itself', () => {
    expect(scansIdentifiers('packages/steward/src/tick.ts')).toBe(true);
    expect(scansIdentifiers('scripts/docs-check.mjs')).toBe(true);
    expect(scansIdentifiers('packages/registry-default/kinds.json')).toBe(true);
    for (const path of [
      'packages/steward/src/tick.spec.ts',
      'packages/config/__fixtures__/repo/a.ts',
      'packages/domain/vitest.config.mjs',
      'docs/schemas/quest.schema.json',
      'design/project/app.js',
      'packages/i18n/src/glossary.json',
      'README.md',
    ]) {
      expect(scansIdentifiers(path), path).toBe(false);
    }
  });
});

describe('bannedIdentifierProblems', () => {
  it('fails a deliberate `dispatcher` identifier, with the word to use instead', () => {
    const problems = bannedIdentifierProblems(
      'packages/steward/src/tick.ts',
      'export const dispatcher = 1;',
      BANNED,
    );
    expect(problems).toEqual([
      'packages/steward/src/tick.ts:1: "dispatcher" uses the banned word "dispatcher"; use steward',
    ]);
  });

  it('catches the word inside longer names, in plural, as JSON keys and id-shaped values', () => {
    const code = 'const x = { worker_ids: [], kind: "dispatchers" };';
    expect(bannedIdentifierProblems('packages/a/src/x.ts', code, BANNED)).toHaveLength(2);
    const json = '{\n  "id": "team-lead"\n}';
    expect(bannedIdentifierProblems('packages/registry-default/x.json', json, BANNED)).toEqual([
      'packages/registry-default/x.json:2: "team-lead" uses the banned word "team"; use party',
    ]);
  });

  it('ignores words with scan off, allowed names, prose, and files it does not scan', () => {
    expect(
      bannedIdentifierProblems('packages/a/src/x.ts', 'const budgetUsd = "dc1-se-team";', BANNED),
    ).toEqual([]);
    expect(bannedIdentifierProblems('packages/a/src/x.ts', 'const s = "the dispatcher";', BANNED)).toEqual(
      [],
    );
    expect(bannedIdentifierProblems('packages/a/src/x.spec.ts', 'const dispatcher = 1;', BANNED)).toEqual([]);
  });

  it('reads only the keys of the locale files', () => {
    const text = '{"version": 1, "messages": {"worker.name": "dispatcher"}}';
    expect(bannedIdentifierProblems('packages/i18n/src/locales/en.json', text, BANNED)).toEqual([
      'packages/i18n/src/locales/en.json:1: "worker.name" uses the banned word "worker"; use assignee',
    ]);
  });
});

describe('dataIdProblems', () => {
  it('fails a data id outside [a-z0-9_-] in the registry, themes and the UI kit', () => {
    const text =
      '{\n  "kinds": [\n    { "id": "tru-ta" },\n    { "id": "Trừ tà", "ritual_id": "a.b" }\n  ]\n}';
    expect(dataIdProblems('packages/registry-default/kinds.json', text)).toEqual([
      'packages/registry-default/kinds.json:4: id "Trừ tà" has characters outside [a-z0-9_-] (ADR 0014)',
      'packages/registry-default/kinds.json:4: id "a.b" has characters outside [a-z0-9_-] (ADR 0014)',
    ]);
    expect(dataIdProblems('themes/fantasy/kinds.json', '{"id": "Fix"}')).toHaveLength(1);
  });

  it('leaves tool config and other folders alone', () => {
    expect(dataIdProblems('packages/registry-default/package.json', '{"id": "X"}')).toEqual([]);
    expect(dataIdProblems('packages/domain/examples/quest.json', '{"id": "X"}')).toEqual([]);
    expect(dataIdProblems('packages/registry-default/kinds.ts', '')).toEqual([]);
  });
});
