// git's line of `doctor` (PS-09): the merge queue needs `git merge-tree --write-tree` (2.38) once a territory names hot
// files, so an older git warns there and only there.
import { translator } from '@elvaria/i18n';
import { describe, expect, it } from 'vitest';

import { gitFinding, olderThan } from './check-kingdom.ts';

const t = translator('en');

describe('olderThan', () => {
  it('compares versions part by part, as numbers, whatever follows the third part', () => {
    expect(olderThan('2.37.9', '2.38.0')).toBe(true);
    expect(olderThan('2.9.0', '2.38.0')).toBe(true);
    expect(olderThan('2.38.0', '2.38.0')).toBe(false);
    expect(olderThan('2.56.0.windows.4', '2.38.0')).toBe(false);
    expect(olderThan('3', '2.38.0')).toBe(false);
  });
});

describe('gitFinding', () => {
  it('warns of a git too old for the merge queue only when a territory names hot files', () => {
    const old = gitFinding(t, '2.37.1', ['elvaria', 'dc1']);
    expect(old.level).toBe('warn');
    expect(old.text).toContain('git 2.37.1 is older than 2.38.0');
    expect(old.text).toContain('elvaria, dc1');
    expect(gitFinding(t, '2.37.1', []).level).toBe('ok');
    expect(gitFinding(t, '2.56.0', ['elvaria'])).toMatchObject({ level: 'ok', text: 'git 2.56.0.' });
    expect(gitFinding(t, undefined, ['elvaria']).level).toBe('error');
  });
});
