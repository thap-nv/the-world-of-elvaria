// GEMINI.md (implementation-plan §3.8): the system part, then embeds of CLAUDE.md and the territory's rules.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openWorld } from './__fixtures__/agy.ts';
import { CONTEXT_HEADER, contextFileText, contextFilesIn, isElvariaContext } from './context-file.ts';
import type { World } from './__fixtures__/agy.ts';

let world: World;
beforeEach(async () => {
  world = await openWorld();
  const rules = path.join(world.plot, '.claude', 'rules');
  await mkdir(rules, { recursive: true });
  await Promise.all(
    ['CLAUDE.md', 'README.md', '.claude/rules/api.md', '.claude/rules/web.md', '.claude/rules/notes.txt'].map(
      (file) => writeFile(path.join(world.plot, file), `# ${file}\n`, 'utf8'),
    ),
  );
});
afterEach(() => world.remove());

describe('contextFilesIn', () => {
  it('finds the default context files of a territory, sorted, with `/`', async () => {
    const files = await contextFilesIn(world.plot, ['CLAUDE.md', 'README.md', '.claude/rules/*.md']);
    expect(files).toEqual(['.claude/rules/api.md', '.claude/rules/web.md', 'CLAUDE.md', 'README.md']);
  });

  it('skips what is missing, and a wildcard before the last segment', async () => {
    expect(
      await contextFilesIn(world.plot, ['AGENTS.md', 'docs/*.md', '**/rules/*.md', '.claude\\rules\\w?b.MD']),
    ).toEqual(['.claude/rules/web.md']);
  });
});

describe('contextFileText', () => {
  it('opens with the header and the system part, then embeds the law and the rules, not the README', () => {
    const text = contextFileText('# Who you are\n\nYou are Quill.\n', [
      '.claude/rules/api.md',
      'CLAUDE.md',
      'README.md',
      'docs/my rules.md',
    ]);
    expect(text).toBe(
      [
        CONTEXT_HEADER,
        '',
        '# Who you are\n\nYou are Quill.',
        '',
        '# Territory law and rules',
        '',
        '@[Territory law](./CLAUDE.md)',
        '@[rule](./.claude/rules/api.md)',
        '',
      ].join('\n'),
    );
    expect(isElvariaContext(text)).toBe(true);
    expect(isElvariaContext('# The territory GEMINI.md\n')).toBe(false);
  });

  it('is the system part alone in a folder without law', () => {
    expect(contextFileText('Chancellor.', [])).toBe(`${CONTEXT_HEADER}\n\nChancellor.\n`);
  });
});
