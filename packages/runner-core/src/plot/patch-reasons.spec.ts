import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterEach, describe, expect, it } from 'vitest';

import { applyPatchIn, PATCH_FILE } from './patch.ts';
import type { Git } from './git.ts';

let temp: TempDir;
afterEach(async () => temp.remove());

async function patchAt() {
  temp = await tempDir('patch reasons');
  await writeFile(path.join(temp.root, PATCH_FILE), 'patch text');
  return temp.root;
}

describe('coded patch refusals (LL-07)', () => {
  it.each([
    ['--numstat', 'breaker:patch_unreadable', 'git cannot read it as a patch:'],
    ['--check', 'breaker:patch_conflict', 'it does not apply:'],
    [PATCH_FILE, 'breaker:patch_apply_failed', 'git apply failed:'],
  ])('separates git text when %s fails', async (stage, code, sentence) => {
    const root = await patchAt();
    const git: Git = (_cwd, args) => {
      const fails =
        stage === PATCH_FILE
          ? !args.includes('--numstat') && !args.includes('--check')
          : args.includes(stage);
      return Promise.resolve({
        code: fails ? 1 : 0,
        stdout: args.includes('--numstat') ? '1\t0\t.husky/pre-push\0' : '',
        stderr: fails ? '  error: hunk failed\n  at line 3\n' : '',
      });
    };
    expect(await applyPatchIn(git, root, ['.husky/**'])).toEqual({
      status: 'refused',
      reason: { code, params: { file: 'elvaria.patch' } },
      text: 'error: hunk failed\n  at line 3',
      detail: `${sentence} error: hunk failed\n  at line 3`,
    });
    expect(await readFile(path.join(root, PATCH_FILE), 'utf8')).toBe('patch text');
  });

  it.each([
    ['/absolute', 'patch_absolute', 'an absolute path', {}],
    ['../outside', 'patch_outside_plot', 'outside the plot', {}],
    ['.git/config', 'patch_git_folder', "git's own folder", {}],
    ['src/app.ts', 'patch_outside_laws', 'outside laws.patch_paths (.husky/**)', { globs: '.husky/**' }],
  ])('codes the scope refusal for %s with exactly its parameters', async (name, code, sentence, params) => {
    const root = await patchAt();
    const git: Git = () => Promise.resolve({ code: 0, stdout: `1\t0\t${name}\0`, stderr: '' });
    expect(await applyPatchIn(git, root, ['.husky/**'])).toEqual({
      status: 'refused',
      reason: { code: `breaker:${code}`, params: { file: 'elvaria.patch', path: name, ...params } },
      detail: `it touches ${name}, ${sentence}`,
    });
  });

  it('clips only the captured git text at its existing ceiling', async () => {
    const root = await patchAt();
    const git: Git = () => Promise.resolve({ code: 1, stdout: '', stderr: `  ${'x'.repeat(2100)}\n` });
    const result = await applyPatchIn(git, root, ['.husky/**']);
    expect(result.status === 'refused' && result.text).toBe('x'.repeat(2000));
  });

  it('omits outside text when git said nothing', async () => {
    const root = await patchAt();
    const git: Git = () => Promise.resolve({ code: 1, stdout: '', stderr: '' });
    expect(await applyPatchIn(git, root, ['.husky/**'])).toEqual({
      status: 'refused',
      reason: { code: 'breaker:patch_unreadable', params: { file: 'elvaria.patch' } },
      detail: 'git cannot read it as a patch: ',
    });
  });
});
