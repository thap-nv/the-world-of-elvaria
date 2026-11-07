import { describe, expect, it } from 'vitest';

import { QUEST_TITLE_MAX_LENGTH } from '../constants.ts';
import { InboxCommandSchema } from '../schema/command/inbox-command.ts';
import { SCRIPT, questIn } from '../quest/__fixtures__/quests.ts';
import { followUpOf } from './follow-up.ts';
import type { CatalogScript } from '../schema/registry-entries.ts';

const LINK_CHECK = {
  id: 'link-check',
  name_vi: 'Kiểm tra link',
  name_en: 'Link check',
  follow_up: { kind: 'document', class: 'scribe' },
} as unknown as CatalogScript;

const parent = questIn('review', SCRIPT);
const NOTES =
  '✗ link_check: .runs/q-1/script.log\n\n2 units: 1 done, 1 not_done\n- link-1 (not_done): README.md:3 -> gone.md';

describe('followUpOf', () => {
  it("opens one session quest of the catalog's kind and class for what a failed run found", () => {
    const payload = followUpOf({ parent, script: LINK_CHECK, verdict: { notes: NOTES }, locale: 'vi' });
    expect(payload).toEqual({
      draft: false,
      title: `Kiểm tra link: ${parent.title}`,
      description: expect.stringContaining(NOTES) as string,
      kind: 'document',
      rank: parent.rank,
      territory: parent.territory,
      tier: 'session',
      class_required: 'scribe',
      tags: parent.tags,
      parent_id: parent.id,
      created_by: 'battle',
    });
    expect(payload?.description).toMatch(/^The catalog script link-check found work in quest /);
    // It is a create_quest the inbox takes as it is.
    const command = {
      version: 1,
      id: '01JC0000000000000000000000',
      ts: parent.created_at,
      kind: 'create_quest',
    };
    expect(InboxCommandSchema.safeParse({ ...command, source: 'cli', payload }).success).toBe(true);
  });

  it("names the script in the owner's language, keeps the title short, and works without notes", () => {
    const long = { ...parent, title: 't'.repeat(QUEST_TITLE_MAX_LENGTH) };
    const payload = followUpOf({ parent: long, script: LINK_CHECK, verdict: {}, locale: 'en' });
    expect(payload?.title.startsWith('Link check: ttt')).toBe(true);
    expect(payload?.title).toHaveLength(QUEST_TITLE_MAX_LENGTH);
    expect(payload?.title.endsWith('…')).toBe(true);
    expect(payload?.description).not.toContain('\n\n');
  });

  it('opens nothing for a script whose catalog entry names no follow-up', () => {
    const quiet = { ...LINK_CHECK, follow_up: undefined };
    expect(followUpOf({ parent, script: quiet, verdict: { notes: NOTES }, locale: 'en' })).toBeUndefined();
  });
});
