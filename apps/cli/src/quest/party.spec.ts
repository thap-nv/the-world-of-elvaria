// `quest list` and `quest show` of a party's members (P1-21 (c)): the role tells apart the contract, the merge quest and
// the acceptance part, which share one title, and the party's stage comes from its quests, in the owner's language.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../../test/cli.ts';
import { questFixture, plantQuests } from '../../test/quest.ts';
import type { TempDir } from '../../test/cli.ts';

const CONTRACT_ID = 'q_20261109_c0c0c0';
const API_ID = 'q_20261109_a1a1a1';
const TESTS_ID = 'q_20261109_t2t2t2';
const MERGE_ID = 'q_20261109_m3m3m3';
const STRAY_ID = 'q_20261109_s4s4s4';
const CONTRACT_FILE = 'apps/api/openapi.json';

const member = (status: 'done' | 'open', id: string, role: string, extra: Record<string, unknown> = {}) =>
  questFixture(status, id, {
    title: 'Xuất kết quả ra CSV',
    party_id: CONTRACT_ID,
    party_role: role,
    ...(role === 'contract' ? { kind: 'plan', class_required: 'mage' } : { contract: CONTRACT_FILE }),
    ...extra,
  });

describe('elvaria quest list and show of a party (P1-21 (c))', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    await plantQuests(
      kingdom,
      member('done', CONTRACT_ID, 'contract'),
      member('done', API_ID, 'part', { title: 'API xuất CSV', depends_on: [CONTRACT_ID] }),
      member('open', TESTS_ID, 'acceptance', { depends_on: [CONTRACT_ID] }),
      member('open', MERGE_ID, 'merge', { depends_on: [API_ID, TESTS_ID] }),
    );
  });
  afterEach(() => dir.remove());

  it('names each member by its role and where the party stands on the board', async () => {
    const io = testIo();
    expect(await run(io, 'quest', 'list', '--kingdom', kingdom)).toBe(0);
    const rowOf = (id: string) => io.printed.out.find((line) => line.startsWith(id)) ?? '';
    expect(rowOf(CONTRACT_ID)).toContain('Quest hợp đồng · đang làm các phần');
    expect(rowOf(API_ID)).toContain('Phần · đang làm các phần');
    expect(rowOf(TESTS_ID)).toContain('Test chấp nhận · đang làm các phần');
    expect(rowOf(MERGE_ID)).toContain('Quest ghép · đang làm các phần');
  });

  it('shows the party, the role, the contract and the merge quest of a member', async () => {
    const io = testIo();
    expect(await run(io, 'quest', 'show', TESTS_ID, '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    const text = io.printed.out.join('\n');
    expect(text).toMatch(new RegExp(`Party\\s+${CONTRACT_ID}: parts in progress, 1 of 2 parts done`));
    expect(text).toMatch(/Role in the party\s+Acceptance tests \(acceptance\)/);
    expect(text).toMatch(new RegExp(`Contract\\s+${CONTRACT_FILE}`));
    expect(text).toMatch(new RegExp(`Merge quest\\s+${MERGE_ID}`));

    const vi = testIo();
    expect(await run(vi, 'quest', 'show', CONTRACT_ID, '--kingdom', kingdom)).toBe(0);
    expect(vi.printed.out.join('\n')).toMatch(/Vai trong đội\s+Quest hợp đồng \(contract\)/);
  });

  it('says when the contract quest cannot be read, and nothing of a party for a quest outside one', async () => {
    await plantQuests(
      kingdom,
      questFixture('open', STRAY_ID, {
        party_id: 'q_20261109_x9x9x9',
        party_role: 'part',
        contract: CONTRACT_FILE,
      }),
    );
    const io = testIo();
    expect(await run(io, 'quest', 'show', STRAY_ID, '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    const text = io.printed.out.join('\n');
    expect(text).toMatch(/Party\s+q_20261109_x9x9x9: the contract quest cannot be read/);
    expect(text).toMatch(/Merge quest\s+—/);
    const list = testIo();
    expect(await run(list, 'quest', 'list', '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    expect(list.printed.out.find((line) => line.startsWith(STRAY_ID))).toMatch(/Build\s+Part\s+do-an/);
  });
});
