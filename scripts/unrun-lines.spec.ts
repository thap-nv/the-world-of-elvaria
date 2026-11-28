import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { main, spansOf, unrunLines } from './unrun-lines.mjs';

describe('unrunLines', () => {
  // line 1 starts at 0, line 2 at 2, line 3 at 5
  const file = {
    rel: 'packages/a/src/a.ts',
    text: 'a\nbb\nccc\n',
    lines: new Map([
      [1, [0]],
      [2, [1]],
      [3, [0, 2]],
    ]),
  };

  it('keeps a line none of whose statements ran, and every line of a file no run loaded', () => {
    expect(unrunLines(file, Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 1, 0]))).toEqual([2]);
    expect(unrunLines(file, Uint8Array.from([1, 0, 0, 1, 0, 1, 0, 0, 0]))).toEqual([]);
    expect(unrunLines(file, undefined)).toEqual([1, 2, 3]);
  });
});

describe('spansOf', () => {
  it('joins lines not run when no line the tests ran lies between them', () => {
    expect(spansOf([1, 2, 4, 7, 9], [2, 4, 9])).toBe('2-4, 9');
    expect(spansOf([1, 2, 3], [1, 3])).toBe('1, 3');
    expect(spansOf([5], [5])).toBe('5');
  });
});

describe('main', () => {
  let temp: TempDir;
  let lines: string[];
  const print = (line: string) => {
    lines.push(line);
  };
  const write = (rel: string, text: string) => {
    const file = join(temp.root, ...rel.split('/'));
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, text);
    return file;
  };
  const statements = (...at: [line: number, count: number][]) => ({
    statementMap: Object.fromEntries(at.map(([line], id) => [id, { start: { line, column: 0 } }])),
    s: Object.fromEntries(at.map(([, count], id) => [id, count])),
  });
  const script = (file: string, ...ranges: [start: number, end: number, count: number][]) => ({
    url: pathToFileURL(file).href,
    functions: [
      { ranges: ranges.map(([startOffset, endOffset, count]) => ({ startOffset, endOffset, count })) },
    ],
  });

  beforeEach(async () => {
    temp = await tempDir('unrun lines');
    lines = [];
    // packages/alpha: a.ts ran on lines 1 and 3 of 3 (each line 2 characters long), across two processes; b.ts ran
    // only in a quest's plot and as a module a test runner transformed (another length), so the run never loaded it;
    // c.ts ran in no test. apps/gamma: the run's copy is a build of another commit. packages/beta: no test coverage.
    const a = write('packages/alpha/src/a.ts', 'a\nb\nc\n');
    const b = write('packages/alpha/src/b.ts', 'b\n');
    const c = write('packages/alpha/src/c.ts', 'c\n');
    const g = write('apps/gamma/src/g.ts', 'g\n');
    mkdirSync(join(temp.root, 'packages', 'beta'));
    const alpha = {
      [a]: { path: a, ...statements([1, 3], [2, 1], [3, 1]) },
      [b]: { path: b, ...statements([1, 2]) },
      [c]: { path: c, ...statements([1, 0]) },
    };
    write('packages/alpha/coverage/coverage-final.json', JSON.stringify(alpha));
    write(
      'apps/gamma/coverage/coverage-final.json',
      JSON.stringify({ [g]: { path: g, ...statements([1, 1]) } }),
    );
    const build = write('kingdom/.builds/abc/apps/gamma/src/g.ts', 'g2\n');
    const plot = write('territory/.elvaria/worktrees/q1/packages/alpha/src/b.ts', 'b\n');
    const run = [script(a, [0, 6, 1], [2, 4, 0]), script(g, [0, 2, 1]), script(build, [0, 3, 1])];
    write('v8 run/coverage-1-1-0.json', JSON.stringify({ result: run }));
    const tests = [script(a, [0, 6, 1], [0, 4, 0]), script(plot, [0, 2, 1]), script(b, [0, 40, 1])];
    write('v8 run/coverage-2-1-0.json', JSON.stringify({ result: tests }));
  });
  afterEach(async () => {
    await temp.remove();
  });

  it('reports by workspace the lines the tests ran and the runs did not, most first', () => {
    const out = join(temp.root, 'report.md');
    expect(main(['--run', join(temp.root, 'v8 run'), '--out', out], temp.root, print)).toBe(0);
    expect(lines).toEqual([`wrote ${out}`]);
    const report = readFileSync(out, 'utf8');
    expect(report).toContain('(2 coverage files, one per process)');
    expect(report).toContain('none for packages/beta');
    expect(report).toContain(
      [
        '| packages/alpha | 4 | 2 | 50.0 % | 1 / 2 | 0 |',
        '| apps/gamma | 0 | 0 | - | 0 / 0 | 1 |',
        '| **all** | 4 | 2 | 50.0 % | 1 / 2 | 1 |',
      ].join('\n'),
    );
    expect(report).toContain(
      [
        '## packages/alpha',
        '',
        '- `packages/alpha/src/a.ts`: 2',
        '- `packages/alpha/src/b.ts`: not loaded (1 line)',
        '',
        '## apps/gamma',
        '',
        "- `apps/gamma/src/g.ts`: the run's copy differs from the tests', not compared",
      ].join('\n'),
    );
    expect(report).not.toContain('c.ts');
  });

  it('prints only the table with --summary', () => {
    expect(main(['--summary', '--run', join(temp.root, 'v8 run')], temp.root, print)).toBe(0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('| packages/alpha | 4 | 2 |');
    expect(lines[0]).not.toContain('## ');
  });

  it('says what is missing: an argument, the tests’ coverage, a run folder or its files', () => {
    const v8 = join(temp.root, 'v8 run');
    expect(main([], temp.root, print)).toBe(2);
    expect(main(['--run'], temp.root, print)).toBe(2);
    expect(main(['--run', v8, '--deep'], temp.root, print)).toBe(2);
    expect(lines.at(-1)).toContain('unknown or incomplete argument --deep');
    expect(main(['--run', v8], join(temp.root, 'kingdom'), print)).toBe(1);
    expect(lines.at(-1)).toContain('run pnpm test first');
    expect(main(['--run', join(temp.root, 'nowhere')], temp.root, print)).toBe(1);
    mkdirSync(join(temp.root, 'empty'));
    expect(main(['--run', join(temp.root, 'empty')], temp.root, print)).toBe(1);
    expect(lines.at(-1)).toContain('no coverage-*.json in');
  });
});
