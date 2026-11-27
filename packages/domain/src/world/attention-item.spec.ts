// The contract of an attention item (P2-04): what the herald sends in `attention`. Every kind's item, with every field
// an item may name, parses; the domain's AttentionItem fits the schema's input; a field the contract does not name and
// a kind outside the table are refused.
import { describe, expect, expectTypeOf, it } from 'vitest';

import { AttentionItemSchema } from './attention-item.ts';
import { itemOf } from './attention-notices.ts';
import { ATTENTION_KINDS } from './attention-table.ts';
import type { CharacterId, MemoId, QuestId, TerritoryId, TribeId } from '../core/ids.ts';
import type { AttentionItem, AttentionSubject } from './attention-table.ts';
import type { z } from 'zod';

const Q1 = 'q_20261127_aaaaa1' as QuestId;
const Q2 = 'q_20261127_aaaaa2' as QuestId;
const THORN = 'thorn' as CharacterId;
const MEMO = 'm_20261127_aaaaa1' as MemoId;

/** One value for each field an item may name. */
const EVERY_FIELD: Required<AttentionSubject> = {
  merges: 2,
  escapes: 1,
  quest: Q1,
  title: 'Fix the "login" page\nsecond line',
  rank: 'B',
  question: 'Which API?',
  class: '<class>',
  judge: THORN,
  held_reason: 'after the release',
  waiting: [Q2],
  holder: Q2,
  overlap: 'apps/web/**',
  gauges: [{ tribe: 'claude' as TribeId, pool: 'default', resets_at: '2026-11-27T23:00:00+07:00' }],
  memo: MEMO,
  memo_kind: 'objection',
  from: THORN,
  triage: 'owner',
  target: Q2,
  holds: ['protected_paths'],
  tribe: 'gemini' as TribeId,
  path: 'C:/agy/agy.exe',
  version: '1.5.7',
  checked_version: '1.5.6',
  pool: 'gemini_models',
  used_pct: 91.5,
  resets_at: '2026-11-27T23:00:00+07:00',
  stage: 'push',
  reason: 'push_refused',
  url: 'https://github.com/o/r/pull/7',
  raised: ['rank_above'],
  revert: ['git', 'revert', '-m', '1', 'abc'],
  cause: 'base_red',
  note: 'a regression',
  merge_quest: Q2,
  pinned: 'a'.repeat(40),
  latest: 'b'.repeat(40),
  commits: 3,
  territory: 'dc1-se-team' as TerritoryId,
  check: 'test',
  error_line: 'FAIL src/a.spec.ts',
  log_path: '.runs/patrol/test.log',
  commit: 'c'.repeat(40),
  since: '2026-11-27T20:00:00+07:00',
  suspects: [Q1, Q2],
  attribution: { cause: 'own_change', commit: 'c'.repeat(40), culprit: Q2 },
  script: 'link-check',
  outcome: 'fail',
  count: 4,
  character: THORN,
  fail_kind: 'tests_fail',
  letters: [MEMO],
  temple_reasons: ['disabled', 'no_monk'],
};

describe('AttentionItemSchema', () => {
  it('takes the item of every kind of the table, with every field an item may name', () => {
    for (const kind of ATTENTION_KINDS) {
      const item = itemOf(kind, EVERY_FIELD);
      expect(AttentionItemSchema.parse(JSON.parse(JSON.stringify(item)))).toEqual(item);
    }
  });

  it('fits the items the domain builds', () => {
    expectTypeOf<AttentionItem>().toExtend<z.input<typeof AttentionItemSchema>>();
  });

  it('refuses a field it does not name, a kind outside the table, and an advice of no kind', () => {
    const item = itemOf('unclaimable', { quest: Q1 });
    expect(AttentionItemSchema.safeParse({ ...item, secret: 'x' }).success).toBe(false);
    expect(AttentionItemSchema.safeParse({ ...item, kind: 'gossip' }).success).toBe(false);
    expect(AttentionItemSchema.safeParse({ ...item, advice: 'panic' }).success).toBe(false);
    expect(AttentionItemSchema.safeParse({ ...item, quest: 'not-a-quest' }).success).toBe(false);
  });
});
