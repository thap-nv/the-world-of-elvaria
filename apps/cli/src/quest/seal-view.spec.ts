// The delegation of the seal in the owner's words (PS-08b): `quest show` says a quest was spared the seal or why the
// machine raised it, the digest names a merge without the seal with the line that undoes it, `elvaria metrics` counts
// the merges without the seal per territory, and `elvaria doctor` names a kind the delegation lists that the registry
// lacks.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { EVENT_VERSION, EventSchema, metricsOf } from '@elvaria/domain';
import type { AttentionItem, QuestId } from '@elvaria/domain';
import { translator } from '@elvaria/i18n';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, printed, run, tempDir, testIo } from '../../test/cli.ts';
import { digestMarkdown } from '../digest/markdown.ts';
import { unsealedSection } from '../metrics/view-delegation.ts';
import { sealText } from './seal-view.ts';
import type { TempDir } from '../../test/cli.ts';

const t = translator('en');
const Q = 'q_20261118_aaaaa1' as QuestId;
const SHA = 'abcdef1234567890abcdef1234567890abcdef12';

describe('sealText', () => {
  it('says a quest was spared the seal, or why the machine raised it, else yes or no', () => {
    expect(sealText(t, { seal_required: false, seal_delegated: true })).toBe(
      'no (spared by the delegation of the seal)',
    );
    expect(
      sealText(t, { seal_required: true, seal_delegated: true, seal_raised: ['diff_size', 'objection'] }),
    ).toBe(
      "yes, raised by the machine: its diff is over the delegation's line ceiling (or could not be measured); its review answered an objection",
    );
    expect(sealText(t, { seal_required: true })).toBe(t('cli.yes'));
    expect(sealText(t, { seal_required: false })).toBe(t('cli.no'));
  });
});

describe('digestMarkdown under the delegation of the seal', () => {
  const merged: AttentionItem = {
    kind: 'merged_unsealed',
    group: 'can_wait',
    advice: 'read_or_revert',
    command: ['quest', 'show', Q],
    quest: Q,
    title: 'Rooms API',
    territory: 'dc1' as AttentionItem['territory'] & string,
    url: 'https://github.com/o/r/pull/7',
    commit: SHA,
    revert: ['git', 'revert', '-m', '1', SHA],
  };
  const raised: AttentionItem = {
    kind: 'awaiting_seal',
    group: 'must',
    advice: 'seal_or_return',
    command: ['seal', Q],
    quest: Q,
    title: 'Rooms API',
    rank: 'D',
    raised: ['machine_judge'],
  };

  it('names the merge without the seal, its pull request and commit, and the git line that undoes it', () => {
    const text = digestMarkdown(t, { day: '2026-11-18', name: 'Bình Minh', items: [merged] });
    expect(text).toContain(
      `- The Steward merged quest ${Q} «Rooms API» into the base branch of dc1 without the royal seal, by the delegation of the seal (pull request https://github.com/o/r/pull/7, commit abcdef123456).`,
    );
    expect(text).toContain(`  \`elvaria quest show ${Q}\`\n  Undo: \`git revert -m 1 ${SHA}\`\n`);
  });

  it('says why the machine raised the seal of a quest that waits for it', () => {
    const text = digestMarkdown(t, { day: '2026-11-18', name: 'Bình Minh', items: [raised] });
    expect(text).toContain('The machine raised the seal: the machine judged it alone.');
    expect(text).not.toContain('Undo:');
  });
});

describe('unsealedSection', () => {
  it('counts the merges and those without the seal per territory', () => {
    const merged = (sealed: boolean, serial: number) =>
      EventSchema.parse({
        v: EVENT_VERSION,
        id: `01JF${String(serial).padStart(22, '0')}`,
        ts: '2026-11-18T09:00:00+07:00',
        type: 'delivery.merged',
        actor: { kind: 'steward' },
        quest: Q,
        data: {
          quest: Q,
          territory: 'dc1',
          branch: `quest/${Q}`,
          head: SHA,
          pr: { number: serial, url: `https://github.com/o/r/pull/${serial}` },
          merge_sha: SHA,
          method: 'squash',
          sealed,
          branch_deleted: true,
        },
      });
    const metrics = metricsOf({
      events: [merged(false, 1), merged(true, 2)],
      quests: [],
      verdicts: [],
      commands: [],
    });
    expect(unsealedSection(t, metrics)).toMatchObject({
      table: {
        header: ['Territory', 'Merged', 'Without the seal', 'Of them, named by an escape'],
        rows: [['dc1', '2', '1', '0']],
      },
    });
  });
});

describe('elvaria doctor: the kinds of the delegation of the seal', () => {
  let dir: TempDir;
  beforeEach(async () => {
    dir = await tempDir();
  });
  afterEach(() => dir.remove());

  // The kingdom speaks Vietnamese, the default of `init`.
  it('warns of a kind the registry lacks, and says nothing of the kinds it has', async () => {
    const kingdom = await foundKingdom(dir.root);
    const file = path.join(kingdom, 'kingdom.json');
    const json = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
    const seal = { max_rank: 'D', kinds: ['fix', 'potion'] };
    await writeFile(file, JSON.stringify({ ...json, delegation: { seal } }));
    const io = testIo();
    await run(io, 'doctor', '--kingdom', kingdom);
    const lines = printed(io)
      .split('\n')
      .filter((line) => line.includes('delegation.seal'));
    expect(lines).toEqual([
      '! kingdom.delegation.seal.kinds nêu dạng mà registry không có: potion; quest của dạng đó không bao giờ được miễn dấu.',
    ]);
  });
});
