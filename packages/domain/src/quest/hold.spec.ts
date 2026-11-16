// The owner's hold on a quest no session has started (fix/quest-hold): a field the quest keeps with its status, its
// description, its dependencies and its named assignee, refused where a session or a verdict already holds it.
import { describe, expect, it } from 'vitest';

import { QuestSchema } from '../schema/quest/quest.ts';
import { ELLA, LEVEL, at, questIn, walk } from './__fixtures__/quests.ts';
import { holdQuest, holdRefusal, isHeld, unholdQuest, unholdRefusal } from './hold.ts';
import { transition } from './transition.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { QuestStatus } from '../schema/quest/shared.ts';

const held = (quest: Quest, reason?: string): Quest => {
  const result = holdQuest(quest, { at: at(40), reason });
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
};

describe('holdQuest', () => {
  it('holds an open quest with why, and keeps everything else', () => {
    const open = { ...questIn('open'), depends_on: [] };
    const quest = held(open, 'Waits for PS-09 on main.');
    expect(quest.held).toEqual({ at: at(40), reason: 'Waits for PS-09 on main.' });
    expect(quest).toMatchObject({ status: 'open', description: open.description, updated_at: at(40) });
    expect(isHeld(quest)).toBe(true);
    expect(QuestSchema.safeParse(quest).success).toBe(true);
  });

  it('keeps the character the owner named on a claimed quest (quest add --to)', () => {
    const named = transition(
      questIn('open'),
      { type: 'reassign', at: at(5), assignee: ELLA, level: LEVEL },
      'user',
    );
    if (!named.ok) throw new Error(named.error.code);
    expect(held(named.value)).toMatchObject({ status: 'claimed', assignee: ELLA, held: { at: at(40) } });
  });

  it('writes no reason when the owner gives none, or only blanks', () => {
    expect(held(questIn('open')).held).toEqual({ at: at(40) });
    expect(held(questIn('open'), '  ').held).toEqual({ at: at(40) });
  });

  it.each<QuestStatus>([
    'draft',
    'working',
    'review',
    'returned',
    'blocked',
    'infirmary',
    'done',
    'archived',
  ])('refuses a quest that is %s: a session, a verdict or the owner already holds it', (status) => {
    const quest = questIn(status);
    expect(holdRefusal(quest)).toEqual({ code: 'not_holdable', status });
    expect(holdQuest(quest, { at: at(40) })).toEqual({ ok: false, error: { code: 'not_holdable', status } });
  });

  it('refuses a quest held already', () => {
    expect(holdQuest(held(questIn('open')), { at: at(41) })).toEqual({
      ok: false,
      error: { code: 'already_held' },
    });
  });
});

describe('unholdQuest', () => {
  it('removes the field and stamps the quest; it moves no status', () => {
    const quest = held(questIn('claimed'), 'later');
    const result = unholdQuest(quest, at(50));
    if (!result.ok) throw new Error(result.error.code);
    expect(result.value).not.toHaveProperty('held');
    expect(result.value).toMatchObject({ status: 'claimed', updated_at: at(50) });
    expect(isHeld(result.value)).toBe(false);
  });

  it('refuses a quest that is not held', () => {
    expect(unholdRefusal(questIn('open'))).toEqual({ code: 'not_held' });
    expect(unholdQuest(questIn('open'), at(50))).toEqual({ ok: false, error: { code: 'not_held' } });
  });
});

describe('a held quest and the table', () => {
  it('keeps its hold through the owner moves the table allows while it waits, and through a cancel', () => {
    const quest = held(questIn('open'));
    expect(walk(quest, ['reassign']).held).toEqual({ at: at(40) });
    expect(walk(quest, ['cancel'])).toMatchObject({ status: 'archived', held: { at: at(40) } });
  });
});
