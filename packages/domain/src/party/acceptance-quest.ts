// The blind trial's acceptance part (implementation-plan §3.15, ADR 0022; P1-21). On a territory with
// blind_trial.enabled, a party whose contract quest or one of its parts is of blind_trial.min_rank or above gets one
// more part, which the Steward makes beside the others when the contract is delivered: another character writes
// acceptance tests from the contract and the owner's description alone. Its worktree starts on the contract's branch
// (plotBaseOf), so the parts' work is in neither its prompt nor its plot, and the party's bars keep its writer apart
// from the parts' assignees (party-bars.ts). Every part waits for it (P1-37 (iii)), so no part's branch holds work
// while it is written. The merge quest merges it with the parts and runs every check of the territory on the result:
// both sets of tests run there.
import { RANKS } from '../schema/common.ts';
import { clipTitle, contractPathOf, highestRank, unionOf } from './party-quest.ts';
import type { ClassId, KindId, QuestId, TagId } from '../core/ids.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Territory } from '../schema/territory.ts';
import type { Parts, PartyQuest } from './party-quest.ts';

/** §3.15: writing tests is writing code, a knight's build; the knight with the best `e2e` reputation takes it. */
export const ACCEPTANCE_KIND = 'build' as KindId;
export const ACCEPTANCE_CLASS = 'knight' as ClassId;
export const ACCEPTANCE_TAG = 'e2e' as TagId;

/**
 * The line that ends the work in a contract quest's description (P1-37 (n)): what follows it is for the party's lead
 * alone (how to write the contract, how to split the work), and the acceptance part never quotes it.
 */
export const LEAD_MARK = '---';

/**
 * Whether the party of `contract` and `parts` gets a blind trial on `territory`: on, and the work is weighty enough.
 * Ranks alone decide, so the Steward asks it of the lead's drafts before any part is made.
 */
export function blindTrialDue(
  territory: Pick<Territory, 'blind_trial'>,
  contract: Pick<Quest, 'rank'>,
  parts: readonly Pick<Quest, 'rank'>[],
): boolean {
  const { enabled, min_rank: least } = territory.blind_trial;
  return enabled && [contract, ...parts].some(({ rank }) => RANKS.indexOf(rank) >= RANKS.indexOf(least));
}

/**
 * What a part of the party waits for (P1-37 (iii)): the contract quest, and in a blind trial the acceptance part too.
 * Every session of the tests' writer then ends before any part's branch holds work: a worktree shares its refs with
 * the repository and the knight's allowlist has `git diff`, so a part that ran first could be read. The order of
 * the quests is the fence, not a rule of the hooks.
 */
export const partWaitsFor = (contract: QuestId, acceptance: QuestId | undefined): QuestId[] =>
  acceptance === undefined ? [contract] : [contract, acceptance];

/** The owner's description of the work, before LEAD_MARK; null when it has no mark, or nothing before it. */
export function workOf(description: string): string | null {
  const lines = description.split('\n');
  const mark = lines.findIndex((line) => line.trim() === LEAD_MARK);
  const work = mark === -1 ? '' : lines.slice(0, mark).join('\n').trim();
  return work === '' ? null : work;
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
  // A check runs one command or several in turn (P1-20).
  const commands = (run: string | readonly string[]) =>
    [run]
      .flat()
      .map((command) => `\`${command}\``)
      .join(' then ');
  const checks = territory.checks.map(({ id, run }) => `\`${id}\` (${commands(run)})`).join(', ');
  return `Put them where one of the territory's checks runs them: ${checks}.`;
}

/**
 * The owner's words on the work (P1-37 (n)): what comes before LEAD_MARK; without a mark the whole description, and
 * the writer is told that what it says to the lead is no work to test.
 */
function workLines(description: string): string {
  const work = workOf(description);
  if (work !== null) return `The owner's description of the work:\n\n${quoted(work)}`;
  return `The owner's description of the work:\n\n${quoted(description)}\n\nWhat it tells the party's lead (writing the contract, splitting the work into parts) is no work to test: test what the work must do.`;
}

/**
 * Where the tests go, under a name of their own (P1-37 (l)): a part naming its tests after the same endpoint would
 * otherwise add the same file, and the merge quest would stop on an add/add conflict.
 */
const NAMING_LINE =
  'Give every test file you add `.acceptance` right before its test suffix (for example `rooms.acceptance.spec.ts`, `rooms.acceptance.int-spec.ts`): the check still runs it, and no file of a part has its name when the merge quest merges your branch with theirs.';

/** What a fresh session of the acceptance part reads: English, like every brief the Steward writes itself. */
function descriptionOf(contract: Quest, parts: Parts, path: string, territory: Pick<Territory, 'checks'>) {
  return [
    `The blind trial of party ${contract.id} («${contract.title}»): write acceptance tests for the work of the party from the owner's description below and the contract (\`${path}\`) on this branch, and from nothing else. ${parts.length} part(s) of the party build the work once your tests are judged, each on its own branch and by another character; never read another branch or another worktree of the repository. Tests by the authors share the authors' blind spots: yours are the second opinion.`,
    workLines(contract.description),
    `Test what the contract and the description promise, through the interfaces the contract names, not how a part builds it. ${checksLine(territory)} ${NAMING_LINE}`,
    'Nothing of the work is on this branch, so the tests cannot pass here: no check of the territory runs before your judge, who reads them against the contract and the description. The merge quest merges them with the parts and runs every check of the territory on the result, where they must pass.',
  ].join('\n\n');
}

/**
 * The `create_quest` payload of the party's acceptance part and its place in the party, for questFromCommand. It is
 * open at once, a child of the contract quest that waits for it alone; its rank and secrets are the parts' (the
 * highest rank, every secret: the tests run where the parts do), its scope the contract's (PS-05).
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
      ...(contract.scope_paths === undefined ? {} : { scope_paths: contract.scope_paths }),
      depends_on: [contract.id],
      parent_id: contract.id,
      ...(typeof contract.campaign_id === 'string' ? { campaign_id: contract.campaign_id } : {}),
      created_by: 'council',
    },
    party: { id: contract.id, role: 'acceptance', contract: path },
  };
}
