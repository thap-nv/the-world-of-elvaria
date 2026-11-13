// A run that ends on the doer's amendment (PS-22b, ADR 0024): the quest waits as on a question, with no status of its
// own; `blocked` keeps which memo it waits on and who decides it, and the answer that lets it go on keeps both.
import { describe, expect, it } from 'vitest';

import { at, eventOf, questIn } from './__fixtures__/quests.ts';
import { transition } from './transition.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { QuestActor, QuestEventType } from './events.ts';

const fire = (quest: Quest, type: QuestEventType, actor: QuestActor, extra: object = {}) =>
  transition(quest, { ...eventOf(type, quest, at(50)), ...extra }, actor);

const value = (result: ReturnType<typeof transition>): Quest => {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
};

describe('an ask on an amendment', () => {
  it('keeps the amendment a run ends on, and the quest waits as on a question', () => {
    const amendment = { memo: 'm_20261106_4k2pqz', by: 'author' } as const;
    const asked = value(fire(questIn('working'), 'ask', 'runner', { amendment }));
    expect(asked).toMatchObject({ status: 'blocked', blocked: { amendment } });
    const answered = value(fire(asked, 'answer', 'user', { answer: 'Accepted: the file moved.' }));
    expect(answered.blocked).toMatchObject({ amendment, answer: 'Accepted: the file moved.' });
  });
});
