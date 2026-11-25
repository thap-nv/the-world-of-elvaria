import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { RITUAL_STEPS } from '@elvaria/domain';
import { tempDir } from '@elvaria/testkit';
import { describe, expect, it } from 'vitest';

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
    const temp = await tempDir('prompts');
    const dir = temp.root;
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
      await temp.remove();
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

  // (156)(b): a judge without the web had to guess the sources it could not open (run (130), gap 7).
  it('has the judge of sources name one it cannot open instead of guessing what it says', async () => {
    const step = sectionsOf((await loadPromptTemplates())['ritual-steps']).get('check_sources');
    expect(step).toContain('When you cannot open a source, name it in your verdict');
    expect(step).toContain('do not guess what it says');
  });
});
