// The steps of a probe (CM-04, ADR 0032, plans/check-modes.md "Tuần tra sau mỗi merge và phép dò"): the commits of a
// default branch, along its first parents, from the latest green head of the red checks (excluded) to the red head,
// each named by the quest whose merge it is. Git lists the commits (`rev-list --parents <red> ^<green>`); which commit
// is whose comes from the log alone: the Steward's merges (`delivery.merged.merge_sha`), or a merge whose second parent
// is a quest branch's pushed head (merged by hand). Pure: no git here, the Steward hands the lists in.
import { isEventOf } from '../schema/event/event.ts';
import type { QuestId, TerritoryId } from '../core/ids.ts';
import type { Event } from '../schema/event/event.ts';
import type { PatrolRanData } from '../schema/event/patrol-data.ts';
import { SETUP_CHECK } from './health.ts';

/** A commit and its parents, as `git rev-list --parents` lists it. */
export interface CommitLink {
  readonly commit: string;
  readonly parents: readonly string[];
}

/** A quest branch as the log knows it: its pushed head, and the commit its merge left when the Steward merged it. */
export interface QuestTip {
  readonly quest: QuestId;
  readonly head: string;
  readonly merge_sha?: string;
}

/** A commit of the default branch the probe may run on; a quest's merge names the quest and its branch. */
export interface ProbeStep {
  readonly commit: string;
  /** The branch before this commit: the base side of a merge. */
  readonly parent?: string;
  readonly quest?: QuestId;
  /** The quest branch's head that went in (delivery.*.head). */
  readonly head?: string;
}

/** The quest branches pushed or merged into `territory`, by the log: a later line of a quest replaces an earlier. */
export function questTipsOf(events: readonly Event[], territory: TerritoryId): QuestTip[] {
  const tips = new Map<QuestId, QuestTip>();
  for (const event of events) {
    if (isEventOf(event, 'delivery.merged') && event.data.territory === territory) {
      const { quest, head, merge_sha: merge } = event.data;
      tips.set(quest, { quest, head, merge_sha: merge });
    } else if (isEventOf(event, 'delivery.pushed') && event.data.territory === territory) {
      const { quest, head } = event.data;
      tips.set(quest, { quest, head });
    }
  }
  return [...tips.values()];
}

/** Whether a patrol line found every one of `checks` passing (`setup` for commands.setup). */
const greenFor = (data: PatrolRanData, checks: readonly string[]) =>
  data.plot_failure === undefined &&
  checks.every((check) =>
    check === SETUP_CHECK
      ? data.setup === null || data.setup.pass
      : data.checks.some(({ id, pass }) => id === check && pass),
  );

/** The head of the latest patrol of `territory` that found every one of `checks` green; undefined when none did. */
export function greenHeadOf(
  events: readonly Event[],
  territory: TerritoryId,
  checks: readonly string[],
): string | undefined {
  let green: string | undefined;
  for (const event of events)
    if (isEventOf(event, 'patrol.ran') && event.data.territory === territory && event.data.head !== null)
      if (greenFor(event.data, checks)) green = event.data.head;
  return green;
}

/** The quest whose branch `link` took in: its merge's commit, or its pushed head as the second parent. */
function stepOf(link: CommitLink, tips: readonly QuestTip[]): ProbeStep {
  const [parent, second] = link.parents;
  const base = { commit: link.commit, ...(parent === undefined ? {} : { parent }) };
  const tip =
    tips.find(({ merge_sha: merge }) => merge === link.commit) ??
    (second === undefined ? undefined : tips.find(({ head }) => head === second));
  return tip === undefined ? base : { ...base, quest: tip.quest, head: tip.head };
}

/**
 * The steps from `green` (excluded) to `red`, oldest first, along `red`'s first parents through `links` (the commits
 * `red` has and `green` has not). undefined when `green` is not on that line: the branch was rewritten, or green was
 * never its head; the probe then cannot say.
 */
export function probeStepsOf(
  links: readonly CommitLink[],
  ends: { readonly green: string; readonly red: string },
  tips: readonly QuestTip[],
): ProbeStep[] | undefined {
  const byCommit = new Map(links.map((link) => [link.commit, link]));
  const steps: ProbeStep[] = [];
  let current: string | undefined = ends.red;
  for (let link = byCommit.get(current); link !== undefined; link = byCommit.get(current ?? '')) {
    steps.push(stepOf(link, tips));
    current = link.parents[0];
  }
  return current === ends.green ? steps.toReversed() : undefined;
}

/**
 * The quest's own head before its newest merge of the base branch (step 4 of the probe): along `head`'s first parents
 * through `links` (the commits `head` has and the base side has not), the first parent of the first merge whose
 * second parent the base side has; `head` itself when none, its branch then took in nothing newer before the merge.
 * The merge queue's update (PS-09) merges the base branch into the quest's branch, its generators' commit on top.
 */
export function questHeadOf(links: readonly CommitLink[], head: string): string {
  const byCommit = new Map(links.map((link) => [link.commit, link]));
  for (let link = byCommit.get(head); link !== undefined; link = byCommit.get(link.parents[0] ?? '')) {
    const [first, second] = link.parents;
    if (first !== undefined && second !== undefined && !byCommit.has(second)) return first;
  }
  return head;
}
