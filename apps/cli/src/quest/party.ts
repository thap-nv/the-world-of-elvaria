// What `quest list` and `quest show` say of a quest's party (implementation-plan §3.13, P1-21 (c)): its role, and where
// the party stands (the domain's partyStatusOf, derived from the quests, never stored), in the owner's language. The
// merge quest and the blind trial's acceptance part carry the contract's title: the role tells the three apart.
import { partyStatusOf } from '@elvaria/domain';
import type { PartyStatus, Quest } from '@elvaria/domain';
import type { MessageKey } from '@elvaria/i18n';

import { PARTY_ROLE_LABEL, PARTY_STAGE_LABEL } from '../labels.ts';
import { NONE } from '../listing.ts';
import type { KingdomContext } from '../kingdom-context.ts';

/** The quest's party among `quests`, when it is in one and its contract quest could be read. */
const statusOf = (quest: Quest, quests: readonly Quest[]): PartyStatus | undefined =>
  quest.party_id === undefined ? undefined : partyStatusOf(quest.party_id, quests);

/** The board's cell: role · stage; a dash outside a party. */
export function partyCell(ctx: KingdomContext, quest: Quest, quests: readonly Quest[]): string {
  if (quest.party_role === undefined) return NONE;
  const role = ctx.t(PARTY_ROLE_LABEL[quest.party_role]);
  const status = statusOf(quest, quests);
  return status === undefined
    ? role
    : ctx.t('cli.quest.party.cell', { role, stage: ctx.t(PARTY_STAGE_LABEL[status.stage]) });
}

/** The lines of `quest show` for a member of a party: the party and its stage, the role, the contract, the merge quest. */
export function partyFields(
  ctx: KingdomContext,
  quest: Quest,
  quests: readonly Quest[],
): [MessageKey, string][] {
  const { party_id: party, party_role: role } = quest;
  if (party === undefined || role === undefined) return [];
  const status = statusOf(quest, quests);
  const line =
    status === undefined
      ? ctx.t('cli.quest.party.unknown', { party })
      : ctx.t('cli.quest.party.line', {
          party,
          stage: ctx.t(PARTY_STAGE_LABEL[status.stage]),
          done: status.parts.done,
          total: status.parts.total,
        });
  return [
    ['cli.quest.field.party', line],
    ['cli.quest.field.party_role', `${ctx.t(PARTY_ROLE_LABEL[role])} (${role})`],
    ['cli.quest.field.contract', quest.contract ?? NONE],
    ['cli.quest.field.merge_quest', status?.merge ?? NONE],
  ];
}
