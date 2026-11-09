// The merge quest of a party (implementation-plan §3.13 step 3, ADR 0020): the Steward makes it itself when the
// contract quest is delivered, beside the parts, so a party never depends on its lead remembering it. It waits for
// every part, merges their branches on the contract's (the Steward does the merging, and makes the first run itself,
// machine-merge.ts), runs every check of the territory and always waits for the royal seal: it is what the owner
// merges into the main branch. In a blind trial the acceptance part is one of its parts (§3.15, P1-21).
import { QUEST_TAGS_MAX } from '../constants.ts';
import { clipTitle, contractPathOf, highestRank, unionOf } from './party-quest.ts';
import type { ClassId, KindId } from '../core/ids.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Parts, PartyQuest } from './party-quest.ts';

/** §3.13: a merge is a build, and building is a knight's craft; the owner reassigns it to anyone else by hand. */
export const MERGE_KIND = 'build' as KindId;
export const MERGE_CLASS = 'knight' as ClassId;

export type MergeQuest = PartyQuest;

const branchLine = (part: Quest): string =>
  part.party_role === 'acceptance'
    ? `- quest/${part.id}: the acceptance tests of the blind trial`
    : `- quest/${part.id}: ${part.title}`;

/** What the knight is told of the blind trial's tests, when the party has some. */
function acceptanceNote(parts: Parts): string[] {
  const tests = parts.find((part) => part.party_role === 'acceptance');
  if (tests === undefined) return [];
  return [
    `quest/${tests.id} holds acceptance tests another character wrote from the contract and the owner's description alone, never seeing the parts. When one fails on the merged branch, make the work meet it; change a test only where it contradicts the contract or the description, and say which and why in your letter.`,
  ];
}

/** What a fresh session of the merge quest reads: English, like every brief the Steward writes itself. */
function descriptionOf(contract: Quest, parts: Parts, path: string): string {
  const branches = parts.map(branchLine).join('\n');
  return [
    `The merge quest of party ${contract.id} («${contract.title}»): one branch holding the contract (\`${path}\`) and every part below, checked as a whole. Each part was judged on its own already.`,
    `The Steward merges these part branches into this branch, one by one, before every run:\n${branches}`,
    'When they all merge cleanly the Steward submits the merge itself, and a knight is called only when a merge stops or the checks or the judge fail it. When a merge stops on a conflict it is left in progress: `git status` names the conflicted files. Resolve them so that every part keeps to the contract, `git add` them and `git commit` to conclude the merge. A part not merged yet is merged before your next session.',
    'Then make every check of the territory pass on the merged branch: they all run before your judge, integration and e2e included. Change only what the merge needs; a verdict that sent the quest back is in front of you.',
    ...acceptanceNote(parts),
  ].join('\n\n');
}

/**
 * The `create_quest` payload of the party's merge quest and its place in the party, for questFromCommand. It is open
 * at once, a child of the contract quest on its territory, and depends on every part; its tags and secrets are those
 * of all the parts (tags clipped to the quest's limit), its rank the highest of theirs.
 */
export function mergeQuestOf(contract: Quest, parts: Parts): MergeQuest {
  const path = contractPathOf(parts);
  const secrets = unionOf(parts.map((part) => part.secrets_required));
  return {
    payload: {
      draft: false,
      title: clipTitle(contract.title),
      description: descriptionOf(contract, parts, path),
      kind: MERGE_KIND,
      rank: highestRank(parts),
      territory: contract.territory,
      tier: 'session',
      class_required: MERGE_CLASS,
      tags: unionOf(parts.map((part) => part.tags)).slice(0, QUEST_TAGS_MAX),
      seal_required: true,
      ...(secrets.length === 0 ? {} : { secrets_required: secrets }),
      depends_on: parts.map((part) => part.id),
      parent_id: contract.id,
      ...(typeof contract.campaign_id === 'string' ? { campaign_id: contract.campaign_id } : {}),
      created_by: 'council',
    },
    party: { id: contract.id, role: 'merge', contract: path },
  };
}
