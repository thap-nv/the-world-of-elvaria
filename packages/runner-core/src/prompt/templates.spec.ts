import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { RITUAL_STEPS } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { RM_TEMP } from '../__fixtures__/temp.ts';
import {
  PROMPTS_DIR,
  PROMPT_TEMPLATES,
  fenced,
  fill,
  joinBlocks,
  loadPromptTemplates,
  sectionsOf,
} from './templates.ts';

describe('loadPromptTemplates', () => {
  it('loads every file of prompts/ and nothing else', async () => {
    const files = (await readdir(PROMPTS_DIR)).filter((file) => file.endsWith('.md'));
    expect(files.map((file) => file.slice(0, -'.md'.length)).toSorted()).toEqual(
      [...PROMPT_TEMPLATES].toSorted(),
    );
  });

  it('drops the maintainer notes and normalises line ends', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'elvaria prompts '));
    try {
      await Promise.all(
        PROMPT_TEMPLATES.map((name) =>
          writeFile(path.join(dir, `${name}.md`), `<!-- note\nfor people -->\r\n\r\n# ${name}\r\n`),
        ),
      );
      const templates = await loadPromptTemplates(dir);
      expect(templates.decree).toBe('# decree');
      expect(Object.values(templates).every((text) => !text.includes('<!--') && !text.includes('\r'))).toBe(
        true,
      );
    } finally {
      await rm(dir, RM_TEMP);
    }
  });
});

describe('fill', () => {
  it('fills placeholders once: a value is never read as a template', () => {
    expect(fill('Hi {{name}}, {{name}}.', { name: '{{name}}' })).toBe('Hi {{name}}, {{name}}.');
  });

  it('removes a placeholder alone on its line when its value is empty', () => {
    expect(fill('a\n\n{{extra}}\n\nb\n\n{{last}}\n', { extra: '', last: ' ' })).toBe('a\n\nb');
    expect(fill('a\n\n{{extra}}\n\nb', { extra: 'x' })).toBe('a\n\nx\n\nb');
  });

  it('throws on a placeholder without a value: a bug in the template', () => {
    expect(() => fill('{{missing}}', {})).toThrow('no value for {{missing}}');
  });
});

describe('joinBlocks and fenced', () => {
  it('leaves empty blocks out', () => {
    expect(joinBlocks(['a\n', '', '  ', 'b'])).toBe('a\n\nb');
  });

  it('fences with more backticks than the text holds', () => {
    expect(fenced('x')).toBe('```\nx\n```');
    expect(fenced('a ```js\nb\n```\n', 'markdown')).toBe('````markdown\na ```js\nb\n```\n````');
  });
});

describe('sectionsOf and prompts/ritual-steps.md', () => {
  it('splits a template on its `## <id>` headings', () => {
    expect(sectionsOf('intro\n## one\n\nFirst.\n\n## two')).toEqual(
      new Map([
        ['one', 'First.'],
        ['two', ''],
      ]),
    );
  });

  it('has one section for every step of the domain, and only those', async () => {
    const steps = sectionsOf((await loadPromptTemplates())['ritual-steps']);
    expect([...steps.keys()]).toEqual([...RITUAL_STEPS]);
    expect([...steps.values()].every((text) => text.length > 0)).toBe(true);
  });
});
