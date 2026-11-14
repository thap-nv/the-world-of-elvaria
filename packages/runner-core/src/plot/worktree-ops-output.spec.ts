import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RM_TEMP } from '../__fixtures__/temp.ts';
import { commitWorktree } from './worktree-ops.ts';
import type { Git } from './git.ts';

let root = '';
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'elvaria hook output '));
});
afterAll(() => rm(root, RM_TEMP));

/** Git's captured streams, without starting a shell: persistence is tested independently of hook execution. */
function refusedGit(stderr: string, stdout: string): Git {
  return (_cwd, args) => {
    if (args[0] === 'commit') return Promise.resolve({ code: 1, stderr, stdout });
    if (args[0] === 'rev-parse' || args.includes('--quiet'))
      return Promise.resolve({ code: 1, stderr: '', stdout: '' });
    const out = args.includes('--name-only') ? 'src/app.ts\0' : '';
    return Promise.resolve({ code: 0, stderr: '', stdout: out });
  };
}

describe('commitWorktree captured hook output', () => {
  it('saves all 300 lines in stderr/stdout order, redacts secrets and summarizes whole words', async () => {
    const lines = Array.from({ length: 300 }, (_, i) =>
      `${i % 2 === 0 ? 'Error' : 'ERROR'} ${i}: ${'word '.repeat(50)}`.trimEnd(),
    );
    lines[0] = 'Error password=keep-this-secret';
    const expected = [...lines];
    expected[0] = 'Error password=[redacted]';
    const stderr = lines.slice(0, 150).join('\n');
    const stdout = lines.slice(150).join('\n');
    const dir = path.join(root, 'run');
    const outcome = await commitWorktree(refusedGit(stderr, stdout), root, 'submit', { dir });
    expect(outcome.status).toBe('refused');
    if (outcome.status !== 'refused') throw new Error('expected refusal');
    expect(outcome.head).toMatchObject({ errors: 300, total_lines: 300 });
    expect(outcome.head.lines).toHaveLength(5);
    expect(outcome.head.lines[0]).toBe(expected[0]);
    expect(outcome.head.lines.every((line) => line.length <= 200)).toBe(true);
    expect(outcome.head.lines.slice(1).every((line) => line.endsWith('word…'))).toBe(true);
    expect(outcome.detail).toBe(outcome.head.lines.join('\n'));
    expect(outcome.log).toBe('pre-commit.log');
    expect(await readFile(path.join(dir, outcome.log!), 'utf8')).toBe(expected.join('\n'));
  });

  it('returns an empty head and no log reference without rescue', async () => {
    expect(await commitWorktree(refusedGit('', ''), root, 'submit')).toEqual({
      status: 'refused',
      head: { lines: [], errors: 0, total_lines: 0 },
      detail: '',
    });
  });
});
