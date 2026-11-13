import { DelegationSchema, InboxCommandSchema } from '@elvaria/domain';
import type { MemoId, TriageDecision } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { BUSY, DOCS, SOURCE, WEB, draftOf, memoOf, sourceOf, triageOf } from './__fixtures__/memos.ts';
import { screenDrafts } from './screen.ts';
import { CONTEXT, DC1 } from './__fixtures__/kingdom.ts';
import { triageCommands } from './triage-commands.ts';

const DELEGATION = DelegationSchema.parse({});
const LINK = memoOf('m_20261112_aaaaaa', 'docs/guide.md có link chết.', ['docs/guide.md']);
const TWIN = memoOf('m_20261112_bbbbbb', 'Link chết trong docs/guide.md.', ['docs/guide.md']);
const WEBMEMO = memoOf('m_20261112_cccccc', 'apps/web chưa có favicon.', ['apps/web/public/favicon.ico']);
const RENAME = memoOf('m_20261112_dddddd', 'Đổi tên trường kingdom.bell.desktop.', ['docs/kingdom.md']);
const MEMOS = [LINK, TWIN, WEBMEMO, RENAME];
const QUESTS = [SOURCE, DOCS, WEB, BUSY];

const decision = (memo: MemoId, action: TriageDecision['action'], fields: Partial<TriageDecision> = {}) => ({
  memo,
  action,
  ask: [],
  note: `Vì ${memo}.`,
  ...fields,
});

function commandsOf(
  decisions: readonly unknown[],
  drafts: readonly unknown[] = [],
  delegation = DELEGATION,
  { memos = MEMOS, territories = CONTEXT.territories } = {},
) {
  const reply = triageOf(decisions, drafts);
  const { commands, outcomes } = triageCommands({
    reply: { decisions: reply.decisions, drafts: screenDrafts(reply.drafts, CONTEXT) },
    memos,
    quests: QUESTS,
    territories,
    delegation,
    source: sourceOf(),
  });
  // Every command is one the Steward reads.
  const parsed = commands.map((command) => InboxCommandSchema.parse(command));
  return { commands: parsed, outcomes, kinds: parsed.map(({ kind }) => kind) };
}

describe('triageCommands: within the delegation', () => {
  it('merges duplicates into one open quest with one edit that closes both', () => {
    const merge = { quest: DOCS.id };
    const { commands, outcomes } = commandsOf([
      decision(LINK.id, 'merge', { ...merge, addendum: 'Sửa link chết trong docs/guide.md.' }),
      decision(TWIN.id, 'merge', merge),
    ]);
    expect(commands).toEqual([
      expect.objectContaining({
        kind: 'edit_quest',
        source: 'chancellor',
        payload: {
          quest: DOCS.id,
          expected_updated_at: DOCS.updated_at,
          changes: { description: `${DOCS.description}\n\nSửa link chết trong docs/guide.md.` },
          memos: [LINK.id, TWIN.id],
        },
      }),
    ]);
    expect(outcomes).toEqual([
      { memo: LINK.id, action: 'merge', delegated: true, holds: [], quest: DOCS.id },
      { memo: TWIN.id, action: 'merge', delegated: true, holds: [], quest: DOCS.id },
    ]);
  });

  it('merges the memos’ own words when no addendum came, and widens the scope when same_scope is off', () => {
    const open = { ...DELEGATION, same_scope: false, max_rank: 'B' as const };
    const { commands } = commandsOf([decision(WEBMEMO.id, 'merge', { quest: DOCS.id })], [], open);
    expect(commands[0]?.payload).toMatchObject({
      changes: {
        description: `${DOCS.description}\n\napps/web chưa có favicon.`,
        scope_paths: ['docs/**', 'README.md', 'apps/web/public/favicon.ico'],
      },
    });
  });

  it('makes a new quest open, closing its memo, and sets a memo aside', () => {
    const { commands, kinds, outcomes } = commandsOf(
      [decision(LINK.id, 'new_quest', { draft_ref: 'd1' }), decision(TWIN.id, 'shelve')],
      [draftOf('d1', { scope_paths: ['docs/guide.md'] })],
    );
    expect(kinds).toEqual(['create_quest', 'decide_memo']);
    expect(commands[0]?.payload).toMatchObject({ draft: false, memos: [LINK.id], created_by: 'chancellor' });
    expect(commands[1]?.payload).toEqual({ memo: TWIN.id, decision: 'shelved', note: `Vì ${TWIN.id}.` });
    expect(outcomes[0]).toEqual({
      memo: LINK.id,
      action: 'new_quest',
      delegated: true,
      holds: [],
      quest: 'q_20261113_new001',
    });
  });
});

describe('triageCommands: beyond the delegation', () => {
  // dc1-se-team, the territory of the memos' quest, protects its guide and every CLAUDE.md (PS-03b (a), ADR 0026).
  const GUARDED = [{ ...DC1, laws: { ...DC1.laws, protected_paths: ['docs/guide.md', 'CLAUDE.md'] } }];

  it('sends up a memo whose files the territory protects, though the Chancellor flagged nothing', () => {
    const LINES = memoOf('m_20261112_eeeeee', 'Luật cũ trong sub/CLAUDE.md.', ['sub/CLAUDE.md:12-14']);
    const { kinds, outcomes } = commandsOf(
      [decision(LINK.id, 'merge', { quest: DOCS.id }), decision(LINES.id, 'shelve')],
      [],
      DELEGATION,
      { memos: [...MEMOS, LINES], territories: GUARDED },
    );
    expect(kinds).toEqual(['escalate_memo', 'escalate_memo']);
    expect(outcomes).toEqual([
      { memo: LINK.id, action: 'merge', delegated: false, holds: ['protected_paths'], quest: DOCS.id },
      { memo: LINES.id, action: 'shelve', delegated: false, holds: ['protected_paths'] },
    ]);
    // Without the protected paths, or with the matter given to the world, the merge goes in as before.
    expect(commandsOf([decision(LINK.id, 'merge', { quest: DOCS.id })]).kinds).toEqual(['edit_quest']);
    const given = { ...DELEGATION, ask: ['decision_change' as const] };
    const kept = commandsOf([decision(LINK.id, 'merge', { quest: DOCS.id })], [], given, {
      territories: GUARDED,
    });
    expect(kept.kinds).toEqual(['edit_quest']);
  });

  it('sends a merge above the rank up with its advice, and changes no quest', () => {
    const { commands } = commandsOf([
      decision(WEBMEMO.id, 'merge', { quest: WEB.id, addendum: 'Thêm favicon.' }),
    ]);
    expect(commands).toEqual([
      expect.objectContaining({
        kind: 'escalate_memo',
        payload: {
          memo: WEBMEMO.id,
          action: 'merge',
          quest: WEB.id,
          addendum: 'Thêm favicon.',
          holds: ['above_rank'],
          note: `Vì ${WEBMEMO.id}.`,
        },
      }),
    ]);
  });

  it('drafts a new quest for the owner before sending its memo up, naming the draft', () => {
    const { commands, kinds } = commandsOf(
      [decision(LINK.id, 'new_quest', { draft_ref: 'd1', ask: ['decision_change'] })],
      [draftOf('d1')],
    );
    expect(kinds).toEqual(['create_quest', 'escalate_memo']);
    expect(commands[0]?.payload).toMatchObject({ draft: true, memos: [LINK.id] });
    expect(commands[1]?.payload).toMatchObject({
      action: 'new_quest',
      quest: 'q_20261113_new001',
      holds: ['decision_change'],
    });
    expect(commands.map(({ id }) => id)).toEqual(commands.map(({ id }) => id).toSorted());
  });

  it('sends up what only the owner decides, a shelving the owner keeps, and work with no quest or draft', () => {
    const { commands, outcomes } = commandsOf(
      [
        decision(RENAME.id, 'owner', { ask: ['contract_change'] }),
        decision(TWIN.id, 'shelve', { ask: ['contract_change'] }),
        decision(LINK.id, 'merge', { quest: BUSY.id }),
        decision(WEBMEMO.id, 'new_quest', { draft_ref: 'd1' }),
      ],
      [draftOf('d1', { tags: ['ui'] })],
    );
    expect(commands.map(({ kind, payload }) => [kind, payload])).toEqual([
      [
        'escalate_memo',
        expect.objectContaining({ action: 'owner', holds: ['contract_change', 'chancellor_asks'] }),
      ],
      ['escalate_memo', expect.objectContaining({ action: 'shelve', holds: ['contract_change'] })],
      ['escalate_memo', expect.objectContaining({ action: 'merge', holds: ['chancellor_asks'] })],
      ['escalate_memo', expect.objectContaining({ action: 'new_quest', holds: ['chancellor_asks'] })],
    ]);
    expect(commands[2]?.payload).toMatchObject({ quest: BUSY.id });
    expect(commands[3]?.payload).not.toHaveProperty('quest');
    expect(outcomes.every(({ delegated }) => !delegated)).toBe(true);
  });

  it('keeps the advice of merged duplicates within a letter’s length', () => {
    const long = 'x'.repeat(1500);
    const merge = { quest: WEB.id };
    const { commands } = commandsOf([
      decision(WEBMEMO.id, 'merge', { ...merge, addendum: long }),
      decision(LINK.id, 'merge', { ...merge, addendum: long }),
    ]);
    expect(commands.map(({ payload }) => (payload as { addendum: string }).addendum.length)).toEqual([
      2000, 2000,
    ]);
  });

  it('sends up a draft with a question, which only the owner answers', () => {
    const { commands } = commandsOf(
      [decision(LINK.id, 'new_quest', { draft_ref: 'd1' })],
      [draftOf('d1', { question: 'Sửa cả bản tiếng Anh?' })],
    );
    expect(commands[0]?.payload).toMatchObject({ draft: true, question: 'Sửa cả bản tiếng Anh?' });
    expect(commands[1]?.payload).toMatchObject({ holds: ['chancellor_asks'] });
  });
});
