import { afterEach, describe, expect, it } from 'vitest';

import { findLinks, run } from './link-check.mjs';
import { makePlot, runScript } from './test-plot.ts';
import type { Plot } from './test-plot.ts';

let plot: Plot | undefined;
afterEach(() => plot?.remove());

const README = [
  '# Title',
  'See [the guide](docs/guide.md#install), [gone](docs/gone.md) and ![logo](img/logo.png "Logo").',
  'External: [site](https://example.com), [mail](mailto:a@b.c), [here](#title), [cdn](//cdn.x/y.js).',
  'Code: `[not a link](nope.md)`',
  '```md',
  '[inside a fence](also-nope.md)',
  '```',
  '[spaced](<docs/my file.md>) [escaped](docs/my%20file.md) [odd](docs/100%.md)',
  '[root](/docs/guide.md) [up](../outside.md) [folder](docs)',
  '[ref]: docs/guide.md "Guide"',
].join('\n');

describe('findLinks', () => {
  it('finds inline, image and reference links outside code, with their line', () => {
    const links = findLinks('README.md', README).map((link) => `${link.line} ${link.target}`);
    expect(links).toEqual([
      '2 docs/guide.md#install',
      '2 docs/gone.md',
      '2 img/logo.png',
      '3 https://example.com',
      '3 mailto:a@b.c',
      '3 #title',
      '3 //cdn.x/y.js',
      '8 docs/my file.md',
      '8 docs/my%20file.md',
      '8 docs/100%.md',
      '9 /docs/guide.md',
      '9 ../outside.md',
      '9 docs',
      '10 docs/guide.md',
    ]);
  });

  it('keeps a longer fence open until a fence of the same kind closes it', () => {
    const markdown = [
      '````',
      '```',
      '[hidden](a.md)',
      '````',
      '~~~',
      '[hidden](b.md)',
      '~~~',
      '[seen](c.md)',
    ].join('\n');
    expect(findLinks('x.md', markdown).map((link) => link.target)).toEqual(['c.md']);
  });
});

describe('link-check', () => {
  const files = {
    'README.md': README,
    'docs/guide.md': '# Guide\n[back](../README.md)\n',
    'docs/my file.md': 'spaces\n',
    'img/logo.png': 'png',
  };

  it('makes one unit per relative link: done when the target exists, not_done otherwise', () => {
    plot = makePlot(files);
    const { units } = run({ globs: ['**/*.md'] }, {}, plot.dir) as {
      units: { id: string; label: string; outcome: string }[];
    };
    const outcomes = units.map((unit) => `${unit.outcome} ${unit.label}`);
    expect(outcomes).toEqual([
      'done README.md:2 -> docs/guide.md#install',
      'not_done README.md:2 -> docs/gone.md',
      'done README.md:2 -> img/logo.png',
      'done README.md:8 -> docs/my file.md',
      'done README.md:8 -> docs/my%20file.md',
      'not_done README.md:8 -> docs/100%.md',
      'done README.md:9 -> /docs/guide.md',
      'not_done README.md:9 -> ../outside.md (outside the territory)',
      'done README.md:9 -> docs',
      'done README.md:10 -> docs/guide.md',
      'done docs/guide.md:2 -> ../README.md',
    ]);
    for (const unit of units) expect(unit.id).toMatch(/^link-[0-9a-f]{12}$/);
    expect(new Set(units.map((unit) => unit.id)).size).toBe(units.length);
  });

  it('gives a link the same unit id on every run', () => {
    plot = makePlot(files);
    const ids = () =>
      (run({ globs: ['README.md'] }, {}, plot?.dir ?? '') as { units: { id: string }[] }).units[0]?.id;
    expect(ids()).toBe(ids());
  });

  it('runs as a process: units on stdout and exit 0, or exit 2 without globs', () => {
    plot = makePlot(files);
    const ok = runScript('link-check.mjs', ['--params', '{"globs":["docs/*.md"]}'], plot.dir);
    expect(ok.status).toBe(0);
    expect(JSON.parse(ok.stdout)).toEqual({ units: [expect.objectContaining({ outcome: 'done' })] });
    const bad = runScript('link-check.mjs', ['--params', '{}'], plot.dir);
    expect(bad.status).toBe(2);
    expect(bad.stderr).toContain('params.globs');
  });
});
