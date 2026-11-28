import { describe, expect, it } from 'vitest';

import { pathProblems } from './docs-paths.mjs';

const check = (texts: Record<string, string>) => pathProblems(Object.keys(texts), (file) => texts[file]);

describe('pathProblems', () => {
  it('accepts exact and suffix paths, but reports missing files with their lines', () => {
    const texts = {
      'README.md': '`packages/a/src/here.ts` and `a/src/here.ts`\n`src/here.ts`\n`src/gone.ts`',
      'packages/a/src/here.ts': '',
      'CLAUDE.md': '`src/also-gone.ts`',
      '.claude/rules/runner.md': '`src/old.ts`',
    };
    expect(check(texts)).toEqual([
      'README.md:3: missing file src/gone.ts',
      'CLAUDE.md:1: missing file src/also-gone.ts',
      '.claude/rules/runner.md:1: missing file src/old.ts',
    ]);
  });

  it('skips fences, globs, placeholders and spans that are not whole file paths', () => {
    const text = [
      '```ts',
      '`src/fenced.ts`',
      '```',
      '~~~',
      '`src/fenced-again.ts`',
      '~~~',
      '`src/*.ts` `<root>/a.ts` `src/{name}.ts` `$root/a.ts` `see src/a.ts` `a.ts` `src/folder/`',
      '`src/real-missing.ts`',
    ].join('\n');
    expect(check({ 'README.md': text })).toEqual(['README.md:8: missing file src/real-missing.ts']);
  });

  it('skips paths written outside the repo', () => {
    const text = [
      '.agents',
      '.docker',
      'coverage',
      'dist',
      '.state',
      '.runs',
      'registry',
      'characters',
      'quests',
      'territories',
      'memos',
      'inbox',
      'events',
      'temple',
      'chronicle',
      '~',
      'infra',
      'apps/api',
    ]
      .map((prefix) => `\`${prefix}/missing.json\``)
      .join('\n');
    expect(check({ 'README.md': text })).toEqual([]);
  });

  it('checks package READMEs but leaves historical docs and excluded trees alone', () => {
    const texts = {
      'packages/a/README.md': '`src/gone.ts`',
      'docs/guides/example.md': '`src/gone.ts`',
      'design/README.md': '`src/gone.ts`',
      'node_modules/a/README.md': '`src/gone.ts`',
      'packages/a/node_modules/b/README.md': '`src/gone.ts`',
    };
    expect(check(texts)).toEqual(['packages/a/README.md:1: missing file src/gone.ts']);
  });

  it('treats an unreadable document as empty', () => {
    expect(pathProblems(['README.md'], () => undefined)).toEqual([]);
  });
});
