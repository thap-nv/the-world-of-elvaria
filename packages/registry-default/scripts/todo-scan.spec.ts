import { afterEach, describe, expect, it } from 'vitest';

import { run, scanText } from './todo-scan.mjs';
import { makePlot, runScript } from './test-plot.ts';
import type { Plot } from './test-plot.ts';

let plot: Plot | undefined;
afterEach(() => plot?.remove());

describe('scanText', () => {
  it('finds markers as whole upper-case words, one item each', () => {
    const lines = ['// TODO: a', 'ok', '/* FIXME and HACK */', 'todos, Todo, TODOS, XXXX', 'x // XXX\r'];
    expect(scanText(lines.join('\n'))).toEqual([
      { line: 1, kind: 'TODO' },
      { line: 3, kind: 'FIXME' },
      { line: 3, kind: 'HACK' },
      { line: 5, kind: 'XXX' },
    ]);
  });
});

describe('todo-scan', () => {
  it('lists markers by file and line, with totals per kind', () => {
    plot = makePlot({
      'b.ts': '// TODO one\n\n// TODO two\n',
      'src/a.ts': '// FIXME x\n// HACK y // XXX z\n',
      'clean.ts': 'nothing\n',
      'skip.md': 'TODO not globbed\n',
      'bin.ts': 'TODO\0binary',
      'node_modules/x/index.ts': '// TODO skipped\n',
    });
    expect(run({ globs: ['**/*.ts'] }, {}, plot.dir)).toEqual({
      summary: '5 markers in 2 of 4 files',
      data: {
        files: 4,
        total: 5,
        by_kind: { TODO: 2, FIXME: 1, HACK: 1, XXX: 1 },
        items: [
          { file: 'b.ts', line: 1, kind: 'TODO' },
          { file: 'b.ts', line: 3, kind: 'TODO' },
          { file: 'src/a.ts', line: 1, kind: 'FIXME' },
          { file: 'src/a.ts', line: 2, kind: 'HACK' },
          { file: 'src/a.ts', line: 2, kind: 'XXX' },
        ],
      },
    });
  });

  it('reports zero markers with every kind present', () => {
    plot = makePlot({ 'a.txt': 'fine\n' });
    expect(run({ globs: ['*.txt'] }, {}, plot.dir)).toEqual({
      summary: '0 markers in 0 of 1 files',
      data: { files: 1, total: 0, by_kind: { TODO: 0, FIXME: 0, HACK: 0, XXX: 0 }, items: [] },
    });
  });

  it('runs as a process; bad params exit 2, a glob outside the plot exits 2', () => {
    plot = makePlot({ 'a.txt': '# TODO\n' });
    const ok = runScript('todo-scan.mjs', ['--params', '{"globs":["*.txt"]}'], plot.dir);
    expect(ok.status).toBe(0);
    expect(JSON.parse(ok.stdout)).toMatchObject({ data: { total: 1 } });
    expect(runScript('todo-scan.mjs', ['--params', '{}'], plot.dir).status).toBe(2);
    expect(runScript('todo-scan.mjs', ['--params', '{"globs":["../*"]}'], plot.dir).status).toBe(2);
  });
});
