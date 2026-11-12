// AGENTS.override.md (spike Codex 2026-11-12 §1.6): the system prompt, the territory's law copied in, and what this
// CLI's tools are for the class; written for a session and taken out after it, a territory's own file never touched.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { check } from 'prettier';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runContextOf, toolPolicyOf } from '@elvaria/runner-core';

import { TERRITORY, openWorld, request } from './__fixtures__/codex.ts';
import {
  CONTEXT_FILE,
  CONTEXT_HEADER,
  FORMAT_IGNORE_END,
  FORMAT_IGNORE_START,
  READ_LINE,
  closeFences,
  codexNote,
  contextFileText,
} from './context-file.ts';
import { removeRunFiles, writeRunFiles } from './run-files.ts';
import type { World } from './__fixtures__/codex.ts';

let world: World;
beforeEach(async () => {
  world = await openWorld();
});
afterEach(() => world.remove());

describe('codexNote', () => {
  it('sends a class with a shell to read with it, and a writing one to apply_patch', () => {
    const note = codexNote({ tools: ['Read', 'Edit', 'Bash'] }, true);
    expect(note).toMatch(/read, list and search files with read-only commands of your shell/);
    expect(note).toMatch(/only with the apply_patch tool/);
    expect(note).toMatch(/git add and git commit fail/);
    expect(note).toMatch(/Do not start sub-agents/);
  });

  it('gives a class without a shell the search commands and the read line, and a judge no write line', () => {
    const note = codexNote(
      { tools: ['Read', 'Glob', 'Grep'], search_commands: ['git grep', 'git ls-files'] },
      false,
    );
    expect(note).toContain('your shell runs only git grep and git ls-files');
    expect(note).toContain(READ_LINE);
    expect(note).not.toMatch(/apply_patch|git commit fail/);
    expect(codexNote({ tools: [] }, false)).not.toMatch(/Read, Glob/);
  });
});

describe('contextFileText', () => {
  it('puts the system part first, then each law file under its path, then the note', () => {
    const files = [
      { path: 'CLAUDE.md', text: '# Law\n\nNo push.\n' },
      { path: 'empty.md', text: '  \n' },
    ];
    const text = contextFileText('# Who you are\n', files, '# Your tools in Codex CLI');
    expect(
      text.startsWith(
        `${CONTEXT_HEADER}\n\n${FORMAT_IGNORE_START}\n# Who you are\n\n# Territory law and rules\n\n## CLAUDE.md\n\n# Law`,
      ),
    ).toBe(true);
    expect(text).not.toContain('empty.md');
    expect(text.endsWith(`# Your tools in Codex CLI\n${FORMAT_IGNORE_END}\n`)).toBe(true);
    expect(contextFileText('S', [], 'N')).toBe(
      `${CONTEXT_HEADER}\n\n${FORMAT_IGNORE_START}\nS\n\nN\n${FORMAT_IGNORE_END}\n`,
    );
  });

  it("is what Prettier would write, whatever the law files hold and the territory's settings (P1-12e)", async () => {
    // Badly formatted Markdown, and a law file cut inside a code fence at runner-core's limit.
    const files = [
      { path: 'CLAUDE.md', text: '#  Law\n* one\n+ two\n\n| a | b |\n|---|---|\n| long cell | x |\n' },
      { path: 'docs/cut.md', text: '## Commands\n\n```bash\npnpm   test\n' },
    ];
    const note = codexNote({ tools: ['Read', 'Edit', 'Bash'] }, true);
    const text = contextFileText('You  are   *Ember*.\n', files, note);
    for (const options of [{}, { proseWrap: 'always', printWidth: 40 } as const]) {
      expect(await check(text, { parser: 'markdown', endOfLine: 'lf', ...options })).toBe(true);
    }
    expect(await check(text.replace(FORMAT_IGNORE_START, ''), { parser: 'markdown' })).toBe(false);
  });
});

describe('closeFences', () => {
  it('closes a fence left open, with its own marker, and leaves closed ones alone', () => {
    expect(closeFences('```bash\npnpm test')).toBe('```bash\npnpm test\n```');
    expect(closeFences('~~~~\n```\nstill code')).toBe('~~~~\n```\nstill code\n~~~~');
    expect(closeFences('````\ncode\n````\ntext')).toBe('````\ncode\n````\ntext');
    expect(closeFences('```\ncode\n``` not a close\n```')).toBe('```\ncode\n``` not a close\n```');
    expect(closeFences('plain\n')).toBe('plain\n');
  });
});

describe('the run files', () => {
  it("copy AGENTS.md, CLAUDE.md and the territory's rules into the override, then go", async () => {
    await mkdir(path.join(world.plot, '.claude', 'rules'), { recursive: true });
    await writeFile(path.join(world.plot, 'AGENTS.md'), 'Agents law.\n', 'utf8');
    await writeFile(path.join(world.plot, 'CLAUDE.md'), 'Claude law.\n', 'utf8');
    await writeFile(path.join(world.plot, '.claude', 'rules', 'api.md'), 'API rule.\n', 'utf8');
    const req = request(world);
    const files = await writeRunFiles(req, runContextOf(req));
    const text = await readFile(files.context, 'utf8');
    expect(text.indexOf('## AGENTS.md')).toBeLessThan(text.indexOf('## CLAUDE.md'));
    expect(text).toContain('## .claude/rules/api.md\n\nAPI rule.');
    expect(text).toContain('You are Ember, a Knight.');
    expect(files.schema).toBeUndefined();
    const policy = JSON.parse(await readFile(files.policy, 'utf8')) as {
      tools: string[];
      search_commands?: string[];
    };
    expect(policy.search_commands).toEqual(['git grep', 'git ls-files']);
    await removeRunFiles(world.plot);
    expect(existsSync(files.context)).toBe(false);
    await removeRunFiles(world.plot);
  });

  it("leave a territory's own override where it is", async () => {
    const own = path.join(world.plot, CONTEXT_FILE);
    await writeFile(own, 'mine\n', 'utf8');
    await removeRunFiles(world.plot);
    expect(await readFile(own, 'utf8')).toBe('mine\n');
  });

  it('write the schema of a judge, whose note has no write line', async () => {
    const judge = toolPolicyOf({
      role: 'verifier',
      characterClass: { tools: { allow: ['Read', 'Glob', 'Grep', 'Bash(git diff:*)'], deny: [] } },
      territory: TERRITORY,
      cli_search: false,
    });
    const req = request(world, {}, { role: 'verifier', permissions: judge, structured: { type: 'object' } });
    const files = await writeRunFiles(req, runContextOf(req));
    expect(files.schema).toBeDefined();
    expect(await readFile(files.context, 'utf8')).not.toMatch(/apply_patch/);
  });
});
