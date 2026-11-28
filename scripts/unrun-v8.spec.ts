import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { toolEnv } from './check-changed.mjs';
import { paint, readRuns, relativeOf } from './unrun-v8.mjs';

const REL = 'packages/demo/src/demo.ts';
// Types the stripper blanks before and inside the code: the offsets V8 reports must still be the file's.
const SOURCE = [
  'interface Shape {',
  '  readonly size: number;',
  '}',
  'export function grow(shape: Shape, by: number): number {',
  '  if (by < 0) {',
  '    return shape.size;',
  '  }',
  '  return shape.size + by;',
  '}',
  'export function never(): string {',
  "  return 'never';",
  '}',
  'grow({ size: 1 } as Shape, 2);',
  '',
].join('\n');

describe('relativeOf', () => {
  const known = new Map([[REL, {}]]);
  const urlOf = (...parts: string[]) => pathToFileURL(join(tmpdir(), ...parts)).href;

  it('finds the repo path of a copy in a checkout or a build, and drops what the tests do not know', () => {
    expect(relativeOf(urlOf('repo', ...REL.split('/')), known)?.rel).toBe(REL);
    const built = relativeOf(urlOf('packages', 'k', '.builds', 'abc', ...REL.split('/')), known);
    expect(built?.rel).toBe(REL);
    expect(built?.file).toBe(join(tmpdir(), 'packages', 'k', '.builds', 'abc', ...REL.split('/')));
    expect(relativeOf(urlOf('repo', 'node_modules', ...REL.split('/')), known)).toBeUndefined();
    expect(
      relativeOf(urlOf('repo', '.elvaria', 'worktrees', 'q1', ...REL.split('/')), known),
    ).toBeUndefined();
    expect(relativeOf(urlOf('repo', 'packages', 'demo', 'dist', 'demo.js'), known)).toBeUndefined();
    expect(relativeOf('node:internal/main', known)).toBeUndefined();
  });
});

describe('paint', () => {
  it('lets the innermost range hold, cuts what lies past the file and keeps what another process ran', () => {
    const ran = new Uint8Array(18);
    paint(
      {
        url: 'file:///x.ts',
        functions: [
          {
            ranges: [
              { startOffset: 0, endOffset: 20, count: 1 },
              { startOffset: 5, endOffset: 10, count: 0 },
            ],
          },
          { ranges: [{ startOffset: 12, endOffset: 15, count: 0 }] },
        ],
      },
      ran,
    );
    expect([...ran].join('')).toBe('111110000011000111');
    paint(
      { url: 'file:///x.ts', functions: [{ ranges: [{ startOffset: 6, endOffset: 8, count: 2 }] }] },
      ran,
    );
    expect([...ran].join('')).toBe('111110110011000111');
  });
});

describe('readRuns', () => {
  let temp: TempDir;
  let coverage: string;
  let file: string;
  beforeEach(async () => {
    temp = await tempDir('unrun v8');
    coverage = join(temp.root, 'v8 out');
    file = join(temp.root, ...REL.split('/'));
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(join(temp.root, 'package.json'), '{ "type": "module" }\n');
    writeFileSync(file, SOURCE);
    execFileSync(process.execPath, [file], {
      env: { ...toolEnv(), NODE_V8_COVERAGE: coverage },
      stdio: 'pipe',
    });
  });
  afterEach(async () => {
    await temp.remove();
  });

  it('marks what a real process ran, at the offsets of the typed source', () => {
    writeFileSync(join(coverage, 'notes.json'), '{}');
    writeFileSync(join(coverage, 'coverage-0-0-0.json'), '{}');
    const runs = readRuns([coverage], new Map([[REL, { text: SOURCE }]]));
    expect(runs.processes).toBe(2);
    expect(runs.differs.size).toBe(0);
    const ran = runs.ran.get(REL);
    const at = (code: string) => ran?.[SOURCE.indexOf(code)];
    expect(at('return shape.size + by')).toBe(1);
    expect(at('grow({ size')).toBe(1);
    expect(at('return shape.size;')).toBe(0);
    expect(at("return 'never'")).toBe(0);
  });

  it('compares nothing in a file whose run copy is not the tests’ copy, or is gone', () => {
    const edited = readRuns([coverage], new Map([[REL, { text: `${SOURCE}// edited\n` }]]));
    expect([...edited.differs]).toEqual([REL]);
    expect(edited.ran.size).toBe(0);
    rmSync(file);
    expect([...readRuns([coverage], new Map([[REL, { text: SOURCE }]])).differs]).toEqual([REL]);
  });
});
