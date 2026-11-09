// territory.context_files in the prompt (implementation-plan §3.14 `context: prompt`, P1-33): the files the globs name
// in the plot, in order, each once, cut at the size agy embeds; their block in the system part.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { QUEST, REGISTRY, SABLE, TERRITORY, THORN } from '../__fixtures__/world.ts';
import { buildPrompt } from './build-prompt.ts';
import {
  CONTEXT_FILE_MAX_CHARS,
  contextFilesBlock,
  contextPathsIn,
  readContextFiles,
} from './context-files.ts';
import { loadPromptTemplates } from './templates.ts';

const templates = await loadPromptTemplates();

let plot: string;
beforeEach(async () => {
  plot = await mkdtemp(path.join(tmpdir(), 'elvaria context '));
  await mkdir(path.join(plot, '.claude', 'rules'), { recursive: true });
  await mkdir(path.join(plot, 'node_modules', 'x'), { recursive: true });
  await writeFile(path.join(plot, 'CLAUDE.md'), '# Law\n\nNo push.\n');
  await writeFile(path.join(plot, 'README.md'), 'x'.repeat(CONTEXT_FILE_MAX_CHARS + 10));
  await writeFile(path.join(plot, '.claude', 'rules', 'b.md'), 'Rule b.');
  await writeFile(path.join(plot, '.claude', 'rules', 'a.md'), 'Rule a.');
  await writeFile(path.join(plot, '.claude', 'rules', 'empty.md'), '  \n');
  await writeFile(path.join(plot, 'node_modules', 'x', 'CLAUDE.md'), 'not ours');
});
afterEach(() => rm(plot, { recursive: true, force: true, maxRetries: 5 }));

describe('context files (§3.14 context: prompt)', () => {
  it('names the files the globs match in the plot, in the globs’ order, once each', async () => {
    expect(
      await contextPathsIn(plot, ['CLAUDE.md', '.claude/rules/*.md', './CLAUDE.md', '**/CLAUDE.md']),
    ).toEqual(['CLAUDE.md', '.claude/rules/a.md', '.claude/rules/b.md', '.claude/rules/empty.md']);
    expect(await contextPathsIn(path.join(plot, 'gone'), ['docs/*.md'])).toEqual([]);
  });

  it('reads them, cuts a large one, and leaves out one that is not there', async () => {
    const files = await readContextFiles(plot, ['CLAUDE.md', 'README.md', 'AGENTS.md', '.claude/rules/a.md']);
    expect(files.map(({ path: file }) => file)).toEqual(['CLAUDE.md', 'README.md', '.claude/rules/a.md']);
    expect(files[1]?.text).toHaveLength(CONTEXT_FILE_MAX_CHARS + '\n[… cut]'.length);
    expect(files[1]?.text.endsWith('\n[… cut]')).toBe(true);
  });

  it('gives each file a section of the block, and no block without a file worth reading', async () => {
    const files = await readContextFiles(plot, ['CLAUDE.md', '.claude/rules/*.md']);
    const block = contextFilesBlock(TERRITORY, files, templates);
    expect(block).toContain(`# Law and rules of ${TERRITORY.name}`);
    expect(block).toContain('## CLAUDE.md\n\n```markdown\n# Law\n\nNo push.\n```');
    expect(block).toContain('## .claude/rules/a.md\n\n```markdown\nRule a.\n```');
    expect(block).not.toContain('empty.md');
    expect(contextFilesBlock(TERRITORY, undefined, templates)).toBe('');
    expect(contextFilesBlock(TERRITORY, [{ path: 'x.md', text: ' ' }], templates)).toBe('');
  });

  it("puts them in the system part of either role's prompt, after the craft of the class", async () => {
    const context_files = await readContextFiles(plot, ['CLAUDE.md']);
    const base = {
      locale: 'en',
      decree: null,
      quest: QUEST,
      territory: TERRITORY,
      registry: REGISTRY,
      scriptures: [],
      gazetteer: null,
      class_prompt: null,
      context_files,
    } as const;
    const assignee = buildPrompt(
      { ...base, role: 'assignee', character: THORN, skills: [], handover_path: 'h.md', continuation: null },
      templates,
    );
    const verifier = buildPrompt(
      { ...base, role: 'verifier', character: SABLE, handover: null, diff: null, checks: [], partial: null },
      templates,
    );
    for (const prompt of [assignee, verifier]) {
      expect(prompt.system.endsWith('```markdown\n# Law\n\nNo push.\n```')).toBe(true);
      expect(prompt.user).not.toContain('No push.');
    }
  });
});
