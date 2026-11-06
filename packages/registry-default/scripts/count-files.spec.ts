import { afterEach, describe, expect, it } from 'vitest';

import { countLines, run } from './count-files.mjs';
import { makePlot, runScript } from './test-plot.ts';
import type { Plot } from './test-plot.ts';

let plot: Plot | undefined;
afterEach(() => plot?.remove());

describe('countLines', () => {
  it.each([
    ['', 0],
    ['one', 1],
    ['one\n', 1],
    ['one\ntwo', 2],
    ['one\r\ntwo\r\n', 2],
    ['\n\n', 2],
  ])('counts %j as %i lines', (content, lines) => {
    expect(countLines(Buffer.from(content))).toBe(lines);
  });
});

describe('count-files', () => {
  it('counts files and lines per folder, folders in code-unit order', () => {
    plot = makePlot({
      'README.md': 'a\nb\n',
      'src/a.ts': '1\n2\n3',
      'src/b.ts': '1\n',
      'src/Z/c.ts': '1\n',
      'node_modules/x/index.ts': 'skipped\n',
    });
    expect(run({ globs: ['**/*.ts', '*.md'] }, {}, plot.dir)).toEqual({
      summary: '4 files, 7 lines in 3 folders',
      data: {
        files: 4,
        lines: 7,
        folders: {
          '.': { files: 1, lines: 2 },
          src: { files: 2, lines: 4 },
          'src/Z': { files: 1, lines: 1 },
        },
      },
    });
  });

  it('runs as a process', () => {
    plot = makePlot({ 'a.txt': 'x\n' });
    const result = runScript('count-files.mjs', ['--params', '{"globs":["*.txt"]}'], plot.dir);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ data: { files: 1, lines: 1 } });
  });
});
