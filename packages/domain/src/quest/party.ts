// Invariants of a party (implementation-plan §3.13, ADR 0020) that span several quest files, so neither the quest
// schema nor transition() can see them. The Steward checks them on the quests of a party after every change,
// and the sandbox checks every generated day.
import type { CharacterId, QuestId } from '../core/ids.ts';
import type { Quest } from '../schema/quest/quest.ts';

/** Stable codes, so the CLI can translate an issue through i18n; `message` is the English text for logs. */
export type PartyIssueCode =
  | 'missing_contract'
  | 'territory_mismatch'
  | 'part_without_contract'
  | 'merge_missing_part'
  | 'many_merges'
  | 'member_verifies';

export interface PartyIssue {
  /** party_id: the id of the party's contract quest. */
  readonly party: QuestId;
  /** The quest at fault (the missing contract's own id for `missing_contract`). */
  readonly quest: QuestId;
  readonly code: PartyIssueCode;
  readonly message: string;
}

interface Party {
  readonly id: QuestId;
  readonly members: readonly Quest[];
}

type Rule = (party: Party, contract: Quest) => PartyIssue[];

const issue = (party: Party, quest: QuestId, code: PartyIssueCode, message: string): PartyIssue => ({
  party: party.id,
  quest,
  code,
  message,
});

/** Parts and the merge quest branch from the contract branch, in the contract's repository (§3.3). */
const sameTerritory: Rule = (party, contract) =>
  party.members
    .filter((quest) => quest.territory !== contract.territory)
    .map((quest) =>
      issue(
        party,
        quest.id,
        'territory_mismatch',
        `party member in ${quest.territory}, contract in ${contract.territory}`,
      ),
    );

/** A part starts once the contract is delivered: it depends on the contract quest (§3.13 step 3). */
const partsNeedContract: Rule = (party) =>
  party.members
    .filter((quest) => quest.party_role === 'part' && !quest.depends_on.includes(party.id))
    .map((quest) => issue(party, quest.id, 'part_without_contract', 'a part depends on the contract quest'));

/** One merge quest per party, and it waits for every part (§3.13 step 3). */
const oneMergeAfterParts: Rule = (party) => {
  const merges = party.members.filter((quest) => quest.party_role === 'merge');
  const parts = party.members.filter((quest) => quest.party_role === 'part');
  return [
    ...merges.slice(1).map((merge) => issue(party, merge.id, 'many_merges', 'a party has one merge quest')),
    ...merges.flatMap((merge) =>
      parts
        .filter((part) => !merge.depends_on.includes(part.id))
        .map((part) =>
          issue(party, merge.id, 'merge_missing_part', `the merge quest does not wait for ${part.id}`),
        ),
    ),
  ];
};

const charactersIn = (quest: Quest, role: 'assignee' | 'verifier'): CharacterId[] => {
  const holder = quest[role];
  return [
    ...quest.attempt_log.flatMap((entry) =>
      entry.role === role && entry.character !== null ? [entry.character] : [],
    ),
    ...(typeof holder === 'string' ? [holder] : []),
  ];
};

/**
 * Whoever worked on any quest of a party never verifies a quest of that party (ADR 0020), so the two sets of
 * characters stay apart, whichever came first.
 */
const membersNeverJudge: Rule = (party) => {
  const assignees = new Set(party.members.flatMap((quest) => charactersIn(quest, 'assignee')));
  return party.members.flatMap((quest) =>
    [...new Set(charactersIn(quest, 'verifier'))]
      .filter((verifier) => assignees.has(verifier))
      .map((verifier) =>
        issue(
          party,
          quest.id,
          'member_verifies',
          `${verifier} worked on this party and verifies ${quest.id}`,
        ),
      ),
  );
};

const RULES: readonly Rule[] = [sameTerritory, partsNeedContract, oneMergeAfterParts, membersNeverJudge];

function partiesOf(quests: readonly Quest[]): Party[] {
  const members = new Map<QuestId, Quest[]>();
  for (const quest of quests) {
    if (quest.party_id !== undefined)
      members.set(quest.party_id, [...(members.get(quest.party_id) ?? []), quest]);
  }
  return [...members].map(([id, list]) => ({ id, members: list }));
}

/**
 * Every broken party invariant among `quests`, which must hold all quests of the parties they touch (all quests
 * of the kingdom will do; quests outside a party are ignored).
 */
export function partyIssues(quests: readonly Quest[]): PartyIssue[] {
  return partiesOf(quests).flatMap((party) => {
    const contract = party.members.find((quest) => quest.id === party.id);
    if (contract === undefined)
      return [issue(party, party.id, 'missing_contract', 'the contract quest of this party is missing')];
    return RULES.flatMap((rule) => rule(party, contract));
  });
}
