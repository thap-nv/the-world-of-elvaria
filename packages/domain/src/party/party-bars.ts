// Who may not take a quest of a party, and whom its taker should differ from (implementation-plan §3.13, §3.15;
// ADR 0020, 0022; P1-21). A party's judges and assignees are two sets whichever came first, so whoever judged a quest
// of the party never works on it ((b): partyIssues' `member_verifies` from the other side). In a blind trial the
// acceptance part's writer and the parts' assignees are two sets too, or the tests would share the author's blind
// spots; each side prefers a model family the other side has not.
import { charactersIn } from '../quest/characters-in.ts';
import type { CharacterId } from '../core/ids.ts';
import type { Quest } from '../schema/quest/quest.ts';

export interface PartyBars {
  /** Characters who may not take the quest: they judged a quest of its party, or work the other side of its trial. */
  readonly barred: ReadonlySet<CharacterId>;
  /** The other side of the blind trial, whose model families the taker had better not share; empty outside one. */
  readonly rivals: ReadonlySet<CharacterId>;
}

type Side = 'acceptance' | 'part';

/** The quest's side of a blind trial: the acceptance part against the parts; none for the contract and the merge. */
const sideOf = (quest: Pick<Quest, 'party_role'>): Side | undefined =>
  quest.party_role === 'acceptance' || quest.party_role === 'part' ? quest.party_role : undefined;

/**
 * The bars on `quest` from `party`, the other quests of its party (partyOf); none outside a party. Its own judges
 * count too: a quest a judge failed, open again, never goes to that judge.
 */
export function partyBarsOf(quest: Quest, party: readonly Quest[]): PartyBars {
  const judges = [quest, ...party].flatMap((member) => charactersIn(member, 'verifier'));
  const side = sideOf(quest);
  const across = party.filter((member) => {
    const other = sideOf(member);
    return side !== undefined && other !== undefined && other !== side;
  });
  const rivals = new Set(across.flatMap((member) => charactersIn(member, 'assignee')));
  return { barred: new Set([...judges, ...rivals]), rivals };
}
