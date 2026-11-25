// The two words the pre-push hook takes besides the full stamp of `pnpm check` (RC-01, docs/plans/recheck.md
// §2.4): the Steward's ELVARIA_CHECKED_HEAD for its quest and train branches, and the narrow stamp of
// `pnpm check:changed` for a push that does not update main. Pure verdicts; check-stamp.spec.ts runs them in git.
import { describe, expect, it } from 'vitest';

import { verdictOf } from './check-stamp.mjs';

const ZERO = '0'.repeat(40);
const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const QUEST = 'refs/heads/quest/q-1';
const FEAT = 'refs/heads/feat/rc-01';

/** The hook's stdin for a push of `sha` to `ref` (githooks(5)). */
const pushOf = (sha: string, ref = 'refs/heads/main'): string => `${ref} ${sha} ${ref} ${ZERO}\n`;

describe('verdictOf', () => {
  const noWorktree = () => {
    throw new Error('the worktree was read');
  };

  it("takes the Steward's word for its quest and train branches without reading the worktree", () => {
    expect(verdictOf(pushOf(SHA, QUEST), noWorktree, SHA)).toMatchObject({ skip: true });
    const both = `${pushOf(SHA, QUEST)}${pushOf(SHA, 'refs/heads/train/t-1')}`;
    expect(verdictOf(both, noWorktree, SHA).skip).toBe(true);
  });

  it("does not take the Steward's word for another branch, alone or beside a quest branch", () => {
    const unstamped = () => ({ head: SHA, clean: true, stamp: undefined });
    for (const ref of [FEAT, 'refs/heads/main', 'refs/heads/quest-1', 'refs/tags/quest/v1']) {
      expect(verdictOf(pushOf(SHA, ref), unstamped, SHA).skip).toBe(false);
    }
    expect(verdictOf(`${pushOf(SHA, QUEST)}${pushOf(SHA, FEAT)}`, unstamped, SHA).skip).toBe(false);
  });

  it("does not take the Steward's word for a commit it does not name", () => {
    const unstamped = () => ({ head: SHA, clean: true, stamp: undefined });
    expect(verdictOf(pushOf(SHA, QUEST), unstamped, OTHER).skip).toBe(false);
    expect(verdictOf(pushOf(SHA, QUEST), unstamped, '').skip).toBe(false);
    const two = `${pushOf(SHA, QUEST)}${pushOf(OTHER, 'refs/heads/quest/q-2')}`;
    expect(verdictOf(two, unstamped, SHA).skip).toBe(false);
  });

  it('takes the narrow stamp of check:changed for a push to an ordinary branch', () => {
    const narrow = () => ({ head: SHA, clean: true, stamp: `changed ${SHA}` });
    expect(verdictOf(pushOf(SHA, FEAT), narrow)).toMatchObject({ skip: true });
    expect(verdictOf(pushOf(SHA, QUEST), narrow).skip).toBe(true);
  });

  it('runs check:fast for a narrow stamp when the push updates main, under any local name', () => {
    const narrow = () => ({ head: SHA, clean: true, stamp: `changed ${SHA}` });
    expect(verdictOf(pushOf(SHA), narrow).skip).toBe(false);
    expect(verdictOf(`${pushOf(SHA, FEAT)}${pushOf(SHA)}`, narrow).skip).toBe(false);
    expect(verdictOf(`${FEAT} ${SHA} refs/heads/main ${ZERO}\n`, narrow).reason).toMatch(/updates main/);
    const full = () => ({ head: SHA, clean: true, stamp: SHA });
    expect(verdictOf(pushOf(SHA), full).skip).toBe(true);
  });

  it('runs check:fast for a narrow stamp on a changed tree or of another commit', () => {
    const dirty = () => ({ head: SHA, clean: false, stamp: `changed ${SHA}` });
    expect(verdictOf(pushOf(SHA, FEAT), dirty).reason).toMatch(/changes since pnpm check:changed/);
    const older = () => ({ head: SHA, clean: true, stamp: `changed ${OTHER}` });
    expect(verdictOf(pushOf(SHA, FEAT), older).skip).toBe(false);
    const elsewhere = () => ({ head: SHA, clean: true, stamp: `changed ${SHA}` });
    expect(verdictOf(pushOf(OTHER, FEAT), elsewhere).skip).toBe(false);
  });
});
