// The forge repo of a territory's remote (PS-08, (K) of the plan): owner and name from vcs.remote, github.com alone.
import { describe, expect, it } from 'vitest';

import { credentialPathOf, forgeRepoOf } from './remote.ts';

const REPO = { forge: 'github', host: 'github.com', owner: 'thap-nv', name: 'the-world-of-elvaria' };

describe('forgeRepoOf', () => {
  it.each([
    'https://github.com/thap-nv/the-world-of-elvaria.git',
    'https://github.com/thap-nv/the-world-of-elvaria',
    'https://github.com/thap-nv/the-world-of-elvaria/',
    'https://GitHub.com/thap-nv/the-world-of-elvaria.git',
    'http://github.com/thap-nv/the-world-of-elvaria.git',
    'git@github.com:thap-nv/the-world-of-elvaria.git',
    'github.com:thap-nv/the-world-of-elvaria',
    'ssh://git@github.com/thap-nv/the-world-of-elvaria.git',
    'ssh://git@github.com:22/thap-nv/the-world-of-elvaria',
    ' https://github.com/thap-nv/the-world-of-elvaria.git\n',
  ])('reads %j', (remote) => {
    expect(forgeRepoOf(remote, 'github')).toEqual(REPO);
  });

  it('keeps dots in a repo name', () => {
    expect(forgeRepoOf('https://github.com/owner/site.github.io.git', 'github')?.name).toBe('site.github.io');
  });

  it.each([
    'https://gitlab.com/thap-nv/the-world-of-elvaria.git',
    'https://github.com.evil.example/thap-nv/repo.git',
    'https://github.com/thap-nv',
    'https://github.com/thap-nv/repo/tree/main',
    'https://github.com/-bad-/repo.git',
    'https://github.com/owner/...',
    'C:/Dummy/Tool - Personal/repo',
    'D:\\repos\\elvaria',
    '../elvaria.git',
    'file:///srv/git/elvaria.git',
    '',
  ])('names no forge repo for %j', (remote) => {
    expect(forgeRepoOf(remote, 'github')).toBeUndefined();
  });

  it('asks git for the repo path a helper keys credentials by when credential.useHttpPath is on', () => {
    expect(credentialPathOf(REPO as never)).toBe('thap-nv/the-world-of-elvaria.git');
  });
});
