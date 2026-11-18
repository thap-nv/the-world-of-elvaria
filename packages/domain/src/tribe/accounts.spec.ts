import { describe, expect, it } from 'vitest';

import { accountClashesOf } from './accounts.ts';
import type { TribeId } from '../core/ids.ts';
import type { AccountRow } from './accounts.ts';

const CLAUDE = 'claude' as TribeId;
const CLAUDE_2 = 'claude_2' as TribeId;
const CLAUDE_3 = 'claude_3' as TribeId;
const SECOND = 'c:/users/owner/.elvaria/accounts/claude_2';
const THIRD = 'c:/users/owner/.elvaria/accounts/claude_3';

const row = (id: TribeId, more: Partial<AccountRow> = {}): AccountRow => ({
  id,
  adapter: 'claude_code',
  auth: 'login',
  ...more,
});

describe('accountClashesOf (PS-27)', () => {
  it('finds two login tribes of one adapter that both run in the default directory', () => {
    expect(accountClashesOf([row(CLAUDE), row(CLAUDE_2)])).toEqual([
      { code: 'same_config_dir', tribes: [CLAUDE, CLAUDE_2] },
    ]);
  });

  it('finds two tribes in one named directory, and names it', () => {
    expect(
      accountClashesOf([row(CLAUDE, { config_dir: SECOND }), row(CLAUDE_2, { config_dir: SECOND })]),
    ).toEqual([{ code: 'same_config_dir', tribes: [CLAUDE, CLAUDE_2], config_dir: SECOND }]);
  });

  it('says only the shared directory when the account matches as well', () => {
    const rows = [
      row(CLAUDE, { config_dir: SECOND, account: 'a1' }),
      row(CLAUDE_2, { config_dir: SECOND, account: 'a1' }),
    ];
    expect(accountClashesOf(rows).map(({ code }) => code)).toEqual(['same_config_dir']);
  });

  it('finds one account signed in to in two directories', () => {
    const rows = [row(CLAUDE, { account: 'a1' }), row(CLAUDE_2, { config_dir: SECOND, account: 'a1' })];
    expect(accountClashesOf(rows)).toEqual([{ code: 'same_account', tribes: [CLAUDE, CLAUDE_2] }]);
  });

  it('lets two directories with two accounts be, and two without a fingerprint', () => {
    const accounts = [row(CLAUDE, { account: 'a1' }), row(CLAUDE_2, { config_dir: SECOND, account: 'a2' })];
    expect(accountClashesOf(accounts)).toEqual([]);
    expect(accountClashesOf([row(CLAUDE), row(CLAUDE_2, { config_dir: SECOND })])).toEqual([]);
    expect(
      accountClashesOf([row(CLAUDE, { config_dir: SECOND }), row(CLAUDE_2, { config_dir: THIRD })]),
    ).toEqual([]);
  });

  it('weighs only tribes of one adapter', () => {
    const gemini = row('gemini' as TribeId, { adapter: 'antigravity', account: 'a1' });
    expect(accountClashesOf([row(CLAUDE, { account: 'a1' }), gemini])).toEqual([]);
  });

  it('leaves out a tribe signed in with a key from the treasury', () => {
    expect(accountClashesOf([row(CLAUDE), row(CLAUDE_2, { auth: 'api_key' })])).toEqual([]);
  });

  it('reports every pair among three tribes, in their order', () => {
    const rows = [row(CLAUDE), row(CLAUDE_2), row(CLAUDE_3, { config_dir: THIRD })];
    expect(accountClashesOf(rows)).toEqual([{ code: 'same_config_dir', tribes: [CLAUDE, CLAUDE_2] }]);
    const all = [row(CLAUDE), row(CLAUDE_2), row(CLAUDE_3)];
    expect(accountClashesOf(all).map(({ tribes }) => tribes)).toEqual([
      [CLAUDE, CLAUDE_2],
      [CLAUDE, CLAUDE_3],
      [CLAUDE_2, CLAUDE_3],
    ]);
  });
});
