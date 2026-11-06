import { describe, expect, it } from 'vitest';

import { linkProblems, linksOf, resolveLink } from './docs-links.mjs';

describe('linksOf', () => {
  it('finds inline links, images, titles, angle-bracket targets and reference definitions', () => {
    const text = [
      'See [plan](implementation-plan.md) and ![map](img/map.png "Map").',
      'A [spaced](<my file.md>) link.',
      '[adr]: adr/0001-x.md',
    ].join('\n');
    expect(linksOf(text)).toEqual([
      { target: 'implementation-plan.md', line: 1 },
      { target: 'img/map.png', line: 1 },
      { target: 'my file.md', line: 2 },
      { target: 'adr/0001-x.md', line: 3 },
    ]);
  });

  it('skips code fences and code spans', () => {
    const text = ['```md', '[a](gone.md)', '```', 'Text `[b](gone.md)` and [c](here.md)'].join('\n');
    expect(linksOf(text)).toEqual([{ target: 'here.md', line: 4 }]);
  });
});

describe('resolveLink', () => {
  it('resolves against the linking file, dropping anchors, queries and a trailing slash', () => {
    expect(resolveLink('docs/adr/0001.md', '../implementation-plan.md#12-x')).toBe(
      'docs/implementation-plan.md',
    );
    expect(resolveLink('docs/glossary.md', 'schemas/')).toBe('docs/schemas');
    expect(resolveLink('CLAUDE.md', 'docs/a%20b.md?raw=1')).toBe('docs/a b.md');
    expect(resolveLink('docs/x.md', '/CLAUDE.md')).toBe('CLAUDE.md');
  });

  it('does not follow the web, mail or anchors in the same file', () => {
    for (const target of ['https://example.com', 'mailto:a@b.c', '//cdn.example.com/x', '#section']) {
      expect(resolveLink('docs/x.md', target)).toBeUndefined();
    }
  });

  it('keeps a malformed escape as written', () => {
    expect(resolveLink('docs/x.md', 'a%zz.md')).toBe('docs/a%zz.md');
  });
});

describe('linkProblems', () => {
  const files = ['CLAUDE.md', 'docs/glossary.md', 'docs/schemas/quest.schema.json', 'design/README.md'];
  const texts: Record<string, string> = {
    'CLAUDE.md': '[ok](docs/glossary.md) [dir](docs/schemas/) [root](./) [gone](docs/missing.md)',
    'docs/glossary.md': '[up](../CLAUDE.md) [out](../../outside.md) [web](https://x.y)',
    'design/README.md': '[handoff links stay as delivered](nowhere.md)',
  };

  it('reports every relative link that reaches no file or folder, outside design/', () => {
    expect(linkProblems(files, (file) => texts[file])).toEqual([
      'CLAUDE.md:1: broken link docs/missing.md',
      'docs/glossary.md:1: broken link ../../outside.md',
    ]);
  });

  it('treats an unreadable file as having no links', () => {
    expect(linkProblems(['a.md'], () => undefined)).toEqual([]);
  });
});
