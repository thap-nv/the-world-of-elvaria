import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  childEnv,
  EXIT,
  execute,
  globFiles,
  insidePlot,
  readArgs,
  stringList,
  text,
  UsageError,
} from './common.mjs';
import { makePlot } from './test-plot.ts';
import type { Plot } from './test-plot.ts';

let plot: Plot | undefined;
afterEach(() => plot?.remove());

describe('readArgs', () => {
  it('reads --params and --context as JSON objects, and defaults them to {}', () => {
    expect(readArgs(['--params', '{"a":1}', '--context', '{"b":2}'])).toEqual({
      params: { a: 1 },
      context: { b: 2 },
    });
    expect(readArgs([])).toEqual({ params: {}, context: {} });
  });

  it.each([
    [['--params'], '--params needs a JSON object'],
    [['--params', '{oops'], '--params is not valid JSON'],
    [['--context', '[1]'], '--context must be a JSON object'],
  ])('refuses %j', (argv, message) => {
    expect(() => readArgs(argv)).toThrow(new UsageError(message));
  });
});

describe('execute', () => {
  it('prints the result as one JSON line and exits 0', async () => {
    expect(await execute(() => ({ pass: true }), [], '.')).toEqual({
      code: EXIT.ok,
      stdout: '{"pass":true}\n',
      stderr: '',
    });
  });

  it('exits 2 for a usage error and 1 for anything else, with the reason on stderr', async () => {
    const usage = await execute(() => Promise.reject(new UsageError('bad params')), [], '.');
    expect(usage).toEqual({ code: EXIT.usage, stdout: '', stderr: 'bad params\n' });
    const broken = await execute(
      () => {
        throw new Error('disk on fire');
      },
      [],
      '.',
    );
    expect(broken.code).toBe(EXIT.broken);
    expect((await execute(() => Promise.reject(new TypeError('x')), [], '.')).code).toBe(EXIT.broken);
  });
});

describe('params', () => {
  it('reads non-empty string lists and strings, with a fallback', () => {
    expect(stringList({ globs: ['a', 'b'] }, 'globs')).toEqual(['a', 'b']);
    expect(text({}, 'head', 'HEAD')).toBe('HEAD');
    for (const bad of [undefined, [], [''], [1], 'a'])
      expect(() => stringList({ globs: bad }, 'globs')).toThrow(UsageError);
    for (const bad of [undefined, '', 3]) expect(() => text({ base: bad }, 'base')).toThrow(UsageError);
  });
});

describe('plot paths', () => {
  it('resolves paths inside the plot and refuses the rest', () => {
    plot = makePlot();
    expect(insidePlot(plot.dir, 'data/a.json')).toBe(path.join(plot.dir, 'data', 'a.json'));
    for (const bad of ['../secret.json', '..', path.resolve(plot.dir, 'a.json')]) {
      expect(() => insidePlot(plot?.dir ?? '', bad)).toThrow(UsageError);
    }
  });

  it('globs files only, sorted with /, never inside node_modules', () => {
    plot = makePlot({ 'docs/b.md': 'b', 'a.md': 'a', 'node_modules/x/c.md': 'c', 'docs/sub/d.txt': 'd' });
    expect(globFiles(plot.dir, ['**/*.md', 'docs', 'a.md'])).toEqual(['a.md', 'docs/b.md']);
  });

  it('refuses globs that leave the plot', () => {
    for (const bad of ['../**/*.md', 'docs/../../x', path.resolve('/tmp/*.md')]) {
      expect(() => globFiles('.', [bad])).toThrow(UsageError);
    }
  });
});

describe('childEnv', () => {
  it('passes what toolchains need and drops everything else', () => {
    expect(childEnv({ PATH: '/bin', HOME: '/home/me', GITHUB_TOKEN: 'secret', NPM_TOKEN: 'x' })).toEqual({
      PATH: '/bin',
      HOME: '/home/me',
    });
  });
});
