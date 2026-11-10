// A fake quest carries the ceilings the Steward would give the same draft (P1-46, (a) of P1-45): the sandbox asks
// the domain's questBudgetOf, the one questFromCommand uses, instead of a formula of its own without the rank's floor.
import { CreateQuestPayloadSchema, RANKS, questFromCommand } from '@elvaria/domain';
import type { Kingdom, QuestId } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { KINGDOM, REGISTRY, kingdomOf } from './__fixtures__/kingdom.ts';
import { questOf } from './cast.ts';
import { SCENARIOS } from './scenarios.ts';

const ID = 'q_20261106_7k3m2a' as QuestId;
const AT = '2026-11-06T09:00:00+07:00';
const TEMPLATE = SCENARIOS.busy.templates.find(({ script }) => script === undefined)!;

/** The quest the Steward writes when the Chancellor's draft of the same quest arrives. */
function stewardsQuest(kingdom: Kingdom, quest: ReturnType<typeof questOf>) {
  const payload = CreateQuestPayloadSchema.parse({
    draft: true,
    title: quest.title,
    description: quest.description,
    kind: quest.kind,
    rank: quest.rank,
    territory: quest.territory,
    class_required: quest.class_required,
    tags: quest.tags,
    estimate: quest.estimate,
    created_by: 'chancellor',
  });
  return questFromCommand(payload, {
    id: ID,
    at: AT,
    breakers: kingdom.breakers,
    registry: REGISTRY,
    territories: [{ id: quest.territory, secrets_allowed: [] }],
    quests: [],
  });
}

describe('questOf', () => {
  const multiplied = kingdomOf({ breakers: { mana_multiplier: 1.5 } });
  it.each(RANKS.flatMap((rank) => [KINGDOM, multiplied].map((kingdom) => ({ rank, kingdom }))))(
    'gives a rank $rank quest the ceilings the Steward gives it',
    ({ rank, kingdom }) => {
      const arrival = { minute: 0, template: TEMPLATE, rank, title: TEMPLATE.titles[0]! };
      const quest = questOf(arrival, ID, AT, { kingdom, registry: REGISTRY, locale: 'en' });
      const steward = stewardsQuest(kingdom, quest);
      expect(steward.ok && steward.value.budget).toEqual(quest.budget);
    },
  );

  it("floors the Chancellor's low estimate with the rank's share of the context budget (P1-45)", () => {
    const arrival = { minute: 0, template: TEMPLATE, rank: 'F' as const, title: TEMPLATE.titles[0]! };
    const quest = questOf(arrival, ID, AT, { kingdom: KINGDOM, registry: REGISTRY, locale: 'en' });
    // F's estimate (40 000) is below its share of the context budget, all of it: the floor, not the estimate.
    const { context_budget_tokens: context, mana_multiplier: multiplier } = KINGDOM.breakers;
    expect(quest.estimate.tokens).toBeLessThan(context);
    expect(quest.budget.max_tokens).toBe(Math.round(context * multiplier));
  });
});
