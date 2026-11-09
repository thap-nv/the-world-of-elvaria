// The blind trial's acceptance part (implementation-plan §3.15, ADR 0022; P1-21). On a territory with
// blind_trial.enabled, a party whose contract quest or one of its parts is of blind_trial.min_rank or above gets one
// more part, which the Steward makes beside the others when the contract is delivered: another character writes
// acceptance tests from the contract and the owner's description alone. Its worktree starts on the contract's branch
// (plotBaseOf), so the parts' work is in neither its prompt nor its plot, and the party's bars keep its writer apart
// from the parts' assignees (party-bars.ts). The merge quest merges it with the parts and runs every check of the
// territory on the result: both sets of tests run there.
import { RANKS } from '../schema/common.ts';
import { clipTitle, contractPathOf, highestRank, unionOf } from './party-quest.ts';
import type { ClassId, KindId, TagId } from '../core/ids.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Territory } from '../schema/territory.ts';
import type { Parts, PartyQuest } from './party-quest.ts';

/** §3.15: writing tests is writing code, a knight's build; the knight with the best `e2e` reputation takes it. */
export const ACCEPTANCE_KIND = 'build' as KindId;
export const ACCEPTANCE_CLASS = 'knight' as ClassId;
export const ACCEPTANCE_TAG = 'e2e' as TagId;

/** Whether the party of `contract` and `parts` gets a blind trial on `territory`: on, and the work is weighty enough. */
export function blindTrialDue(
  territory: Pick<Territory, 'blind_trial'>,
  contract: Quest,
  parts: readonly Quest[],
): boolean {
  const { enabled, min_rank: least } = territory.blind_trial;
  return enabled && [contract, ...parts].some(({ rank }) => RANKS.indexOf(rank) >= RANKS.indexOf(least));
}

/** What the acceptance part needs besides the party: the territory's checks, the kingdom's tags. */
export interface AcceptanceContext {
  readonly territory: Pick<Territory, 'checks'>;
  /** The registry's tags: the part carries `e2e` when the kingdom has that tag. */
  readonly tags: readonly TagId[];
}

const quoted = (text: string): string =>
  text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');

/** Where the tests go: next to the checks that will run them, once the merge quest has them all on one branch. */
function checksLine(territory: Pick<Territory, 'checks'>): string {
  if (territory.checks.length === 0)
    return 'The territory names no check, so say in your letter how to run the tests.';
  const checks = territory.checks.map(({ id, run }) => `\`${id}\` (\`${run}\`)`).join(', ');
  return `Put them where one of the territory's checks runs them: ${checks}.`;
}

/** What a fresh session of the acceptance part reads: English, like every brief the Steward writes itself. */
function descriptionOf(contract: Quest, parts: Parts, path: string, territory: Pick<Territory, 'checks'>) {
  return [
    `The blind trial of party ${contract.id} («${contract.title}»): write acceptance tests for the work of the party from the owner's description below and the contract (\`${path}\`) on this branch, and from nothing else. ${parts.length} other part(s) build the work on their own branches, each by another character; never read their work: no other branch, no other worktree of the repository. Tests by the authors share the authors' blind spots: yours are the second opinion.`,
    `The owner's description of the work:\n\n${quoted(contract.description)}`,
    `Test what the contract and the description promise, through the interfaces the contract names, not how a part builds it. ${checksLine(territory)}`,
    'Nothing of the work is on this branch, so the tests cannot pass here: no check of the territory runs before your judge, who reads them against the contract and the description. The merge quest merges them with the parts and runs every check of the territory on the result, where they must pass.',
  ].join('\n\n');
}

/**
 * The `create_quest` payload of the party's acceptance part and its place in the party, for questFromCommand. It is
 * open at once, a child of the contract quest that waits for it alone; its rank and secrets are the parts' (the
 * highest rank, every secret: the tests run where the parts do).
 */
export function acceptanceQuestOf(contract: Quest, parts: Parts, context: AcceptanceContext): PartyQuest {
  const path = contractPathOf(parts);
  const secrets = unionOf(parts.map((part) => part.secrets_required));
  return {
    payload: {
      draft: false,
      title: clipTitle(contract.title),
      description: descriptionOf(contract, parts, path, context.territory),
      kind: ACCEPTANCE_KIND,
      rank: highestRank(parts),
      territory: contract.territory,
      tier: 'session',
      class_required: ACCEPTANCE_CLASS,
      tags: context.tags.includes(ACCEPTANCE_TAG) ? [ACCEPTANCE_TAG] : [],
      seal_required: false,
      ...(secrets.length === 0 ? {} : { secrets_required: secrets }),
      depends_on: [contract.id],
      parent_id: contract.id,
      ...(typeof contract.campaign_id === 'string' ? { campaign_id: contract.campaign_id } : {}),
      created_by: 'council',
    },
    party: { id: contract.id, role: 'acceptance', contract: path },
  };
}
