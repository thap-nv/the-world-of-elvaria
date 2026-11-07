import { QuestDraftFileSchema, QuestDraftSchema } from '@elvaria/domain';
import type { QuestDraft } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { DC1, HANDBOOK, REGISTRY, reply } from './__fixtures__/kingdom.ts';
import { screenDrafts } from './screen.ts';

const CONTEXT = { registry: REGISTRY, territories: [DC1, HANDBOOK] };
const draftsOf = (name: string): QuestDraft[] => QuestDraftFileSchema.parse(reply(name)).drafts;
const refs = (drafts: readonly QuestDraft[]) => drafts.map(({ ref }) => ref);

/** A session draft of dc1-se-team that the kingdom accepts, changed by `fields`. */
const draft = (ref: string, fields: Record<string, unknown> = {}): QuestDraft =>
  QuestDraftSchema.parse({
    ref,
    title: `Quest ${ref}`,
    description: 'Something to do.',
    kind: 'build',
    rank: 'D',
    territory: 'dc1-se-team',
    tier: 'session',
    class_required: 'knight',
    tags: ['backend'],
    depends_on_refs: [],
    estimate: { tokens: 30000, minutes: 15 },
    seal_required: false,
    secrets_required: [],
    ...fields,
  });

describe('screenDrafts (§3.11)', () => {
  it('keeps drafts that name only what the kingdom has', () => {
    for (const name of ['link-check', 'split', 'party', 'vague']) {
      const drafts = draftsOf(name);
      expect(screenDrafts(drafts, CONTEXT)).toEqual({ kept: drafts, dropped: [] });
    }
  });

  it('drops a tag outside tags.json, a secret the territory does not allow, and what waits on a dropped draft', () => {
    const { kept, dropped } = screenDrafts(draftsOf('screened'), CONTEXT);
    expect(refs(kept)).toEqual(['d1']);
    expect(dropped).toEqual([
      { ref: 'd2', title: 'Hiện trạng thái đơn hàng trên web', reason: 'unknown_tag', detail: 'web_ui' },
      {
        ref: 'd4',
        title: 'Đồng bộ đơn hàng lên kho lưu trữ',
        reason: 'secret_not_allowed',
        detail: 'aws_secret_access_key',
      },
      { ref: 'd3', title: 'Viết e2e cho trạng thái đơn hàng', reason: 'needs_dropped_draft', detail: 'd2' },
    ]);
  });

  it.each([
    ['unknown_kind', { kind: 'conquer' }, 'conquer'],
    ['unknown_territory', { territory: 'atlas' }, 'atlas'],
    ['class_not_allowed', { class_required: 'scribe' }, 'scribe'],
    ['unknown_script', { tier: 'script', script: { id: 'shine-boots', params: {} } }, 'shine-boots'],
    [
      'script_not_for_kind',
      { tier: 'script', script: { id: 'compare-numbers', params: {} } },
      'compare-numbers',
    ],
    ['party_part', { kind: 'build', party_role: 'part', contract: 'docs/api.yaml' }, undefined],
  ])('drops a draft with %s', (reason, fields, detail) => {
    const { kept, dropped } = screenDrafts([draft('d1', fields)], CONTEXT);
    expect(kept).toEqual([]);
    expect(dropped).toEqual([
      { ref: 'd1', title: 'Quest d1', reason, ...(detail === undefined ? {} : { detail }) },
    ]);
  });

  it('puts each draft after its parent and what it depends on, and drops drafts that wait on each other', () => {
    const drafts = [
      draft('d3', { depends_on_refs: ['d2'], parent_ref: 'd1' }),
      draft('d2', { parent_ref: 'd1' }),
      draft('d1'),
      draft('d4', { depends_on_refs: ['d5'] }),
      draft('d5', { depends_on_refs: ['d4'] }),
      draft('d6', { depends_on_refs: ['d5'] }),
    ];
    const { kept, dropped } = screenDrafts(drafts, CONTEXT);
    expect(refs(kept)).toEqual(['d1', 'd2', 'd3']);
    expect(dropped.map(({ ref, reason }) => [ref, reason])).toEqual([
      ['d4', 'dependency_cycle'],
      ['d5', 'dependency_cycle'],
      ['d6', 'dependency_cycle'],
    ]);
  });
});
