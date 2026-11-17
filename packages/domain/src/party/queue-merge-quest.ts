// The merge quest of the merge queue (implementation-plan §3.13, §3.16.7, ADR 0023; PS-09b, K5): when the queue's
// update of a done quest's branch stops on a conflict no rule of the territory's shared_paths resolves, or on checks
// red after the base branch merged cleanly, the Steward opens this quest for a knight instead of leaving the owner to
// resolve it by hand. It is marked as a party's merge quest (`party_role: 'merge'`, the party of the quest it stands
// for, or that quest's own id outside a party), so the merge quest's way runs it unchanged (PS-08e): its plot starts on
// the quest's branch, the machine's first run merges the base branch in, a conflict is left in progress for the knight
// of the next run, every check runs, a judge from outside the party reads it, and it always waits for the seal. Done,
// it goes through the queue itself, and the quest it stands for goes into the base branch with it.
import { MERGE_CLASS, MERGE_KIND } from './merge-quest.ts';
import { clipTitle } from './party-quest.ts';
import type { Kingdom } from '../schema/kingdom.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Registry } from '../schema/registry.ts';
import type { PartyQuest } from './party-quest.ts';

/** A red check of the queue's update: its id and the end of its log, redacted by the Steward. */
export interface QueueRedCheck {
  readonly name: string;
  readonly tail?: string;
}

/** Where the queue's update stopped: files no rule resolves, or checks red on the merged branch. */
export type QueueStop =
  | { readonly reason: 'conflict'; readonly paths: readonly string[] }
  | { readonly reason: 'checks_red'; readonly checks: readonly QueueRedCheck[] };

export interface QueueMergeInput {
  /** The done quest whose delivery stopped at `update`. */
  readonly origin: Quest;
  readonly stop: QueueStop;
  /** The territory's base branch and the commit of it the update merged. */
  readonly base: { readonly branch: string; readonly commit: string };
  readonly kinds: Registry['kinds'];
  /** `kingdom.owner.locale`: the title names the quest's kind in the owner's language, as a follow-up's does. */
  readonly locale: Kingdom['owner']['locale'];
}

const SHORT_SHA = 7;

/**
 * A merge quest of the queue, not a party's (PS-09b): the Steward makes it from a delivery, as a patrol's finding,
 * where a party's comes from its council. Every reader that counts a party's one merge quest leaves it out.
 */
export const isQueueMerge = (quest: Pick<Quest, 'party_role' | 'created_by'>): boolean =>
  quest.party_role === 'merge' && quest.created_by === 'patrol';

function stopLines(stop: QueueStop, base: string): string[] {
  if (stop.reason === 'conflict')
    return [
      `Merging ${base} stopped on files no rule of the territory's shared_paths resolves:\n${stop.paths.map((path) => `- ${path}`).join('\n')}`,
    ];
  return [
    [
      `${base} merged cleanly, then these checks of the territory failed on the merged branch:`,
      ...stop.checks.map(({ name, tail }) =>
        tail === undefined || tail === ''
          ? `- ${name}`
          : `- ${name}, the end of its log:\n\`\`\`\n${tail}\n\`\`\``,
      ),
    ].join('\n'),
  ];
}

/** What a fresh session of the merge quest reads: English, like every brief the Steward writes itself. */
function descriptionOf({ origin, stop, base }: QueueMergeInput): string {
  const at = `${base.branch} (${base.commit.slice(0, SHORT_SHA)})`;
  return [
    `The merge quest of quest ${origin.id} («${origin.title}»): its work was judged and sealed, but the merge queue could not bring its branch quest/${origin.id} up to ${at} before delivering it.`,
    ...stopLines(stop, base.branch),
    `This branch starts from quest/${origin.id}, and the Steward merges ${base.branch} into it as it is now before every run; a merge that stops is left in progress: \`git status\` names the conflicted files. Keep the changes of both sides, the work of quest ${origin.id} and what ${base.branch} brought; \`git add\` the files and \`git commit\` to conclude the merge.`,
    'Then make every check of the territory pass on the merged branch: they all run before your judge. Change only what the merge needs; a verdict that sent the quest back is in front of you.',
    `Once this quest is sealed and in ${base.branch}, quest ${origin.id} goes with it.`,
  ].join('\n\n');
}

/** The quest's scope and the conflicted files, or none when the quest had none: it could change any file. */
function scopeOf({ origin, stop }: QueueMergeInput): string[] {
  if (origin.scope_paths === undefined || origin.scope_paths.length === 0) return [];
  return [...new Set([...origin.scope_paths, ...(stop.reason === 'conflict' ? stop.paths : [])])];
}

/**
 * The `create_quest` payload of the queue's merge quest for `origin` and its place, for questFromCommand: open at
 * once, a child of `origin` that waits for it (done already: its branch is what the plot starts on and the party's
 * check finds merged), on its territory, rank, tags and secrets, always sealed (K5). Its party is `origin`'s, or
 * `origin` itself outside a party, so `origin`'s workers never judge it (partyOf).
 */
export function queueMergeQuestOf(input: QueueMergeInput): PartyQuest {
  const { origin, kinds, locale } = input;
  const kind = kinds.find(({ id }) => id === MERGE_KIND);
  const name = kind === undefined ? MERGE_KIND : locale === 'vi' ? kind.name_vi : kind.name_en;
  const scope = scopeOf(input);
  return {
    payload: {
      draft: false,
      title: clipTitle(`${name}: ${origin.title}`),
      description: descriptionOf(input),
      kind: MERGE_KIND,
      rank: origin.rank,
      territory: origin.territory,
      tier: 'session',
      class_required: MERGE_CLASS,
      tags: [...origin.tags],
      seal_required: true,
      ...(origin.secrets_required.length === 0 ? {} : { secrets_required: [...origin.secrets_required] }),
      ...(scope.length === 0 ? {} : { scope_paths: scope }),
      depends_on: [origin.id],
      parent_id: origin.id,
      ...(typeof origin.campaign_id === 'string' ? { campaign_id: origin.campaign_id } : {}),
      // What the machine finds while it delivers: the Steward opens it, as a patrol's finding (isQueueMerge).
      created_by: 'patrol',
    },
    party: {
      id: origin.party_id ?? origin.id,
      role: 'merge',
      ...(origin.contract === undefined ? {} : { contract: origin.contract }),
    },
  };
}
