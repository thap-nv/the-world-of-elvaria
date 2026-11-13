// The quest template (implementation-plan §3.16.6, owner 2026-11-12, PS-06): the description of every session quest
// the Chancellor or a mage drafts has the sections of QUEST_TEMPLATE_SECTIONS, and ranks F to D list their steps in
// order. One template for every tribe: how much it says follows the rank, never the tribe (ADR 0021). Quests the owner
// writes (`elvaria quest add`) and those the Steward makes are not held to it. A check of the territory that "Done
// when" names by id (check `<id>`) must exist.
import { REGISTRY_ID_PATTERN } from '../core/ids.ts';
import { RANKS } from '../schema/common.ts';
import { QUEST_TEMPLATE_SECTIONS, STEPS_REQUIRED_UP_TO } from './constants.ts';
import { sectionKeyOf, sectionsOf } from './sections.ts';
import type { Rank } from '../schema/common.ts';
import type { Tier } from '../schema/quest/shared.ts';
import type { QuestTemplateSection } from './constants.ts';

export type TemplateIssue =
  /** The section is not there, or holds nothing. */
  | { readonly code: 'missing_section'; readonly section: QuestTemplateSection }
  /** Ranks F to D: `## Steps` has no numbered item. */
  | { readonly code: 'unordered_steps' }
  /** "Done when" names a check its territory does not have. */
  | { readonly code: 'unknown_check'; readonly check: string };

/** What the template reads of a draft. */
export interface TemplateSubject {
  readonly description: string;
  readonly rank: Rank;
  readonly tier: Tier;
}

const ORDERED_ITEM = /^\s*\d+[.)]\s+\S/m;
const NAMED_CHECK = /\bcheck\s+`([^`]+)`/gi;

const stepsRequired = (rank: Rank): boolean => RANKS.indexOf(rank) <= RANKS.indexOf(STEPS_REQUIRED_UP_TO);

/** The ids "Done when" names as check `<id>`; a command in backquotes (with a space) is not an id. */
function namedChecks(doneWhen: string): string[] {
  const ids = [...doneWhen.matchAll(NAMED_CHECK)].map((match) => String(match[1]));
  return [...new Set(ids.filter((id) => REGISTRY_ID_PATTERN.test(id)))];
}

/**
 * What the description lacks of the template, none for a script-tier draft (a catalog script runs it). `checks`: the
 * ids of the territory's checks; undefined when the territory is unknown, and then no named check is held against it.
 */
export function templateIssuesOf(subject: TemplateSubject, checks?: readonly string[]): TemplateIssue[] {
  if (subject.tier !== 'session') return [];
  const sections = sectionsOf(subject.description);
  const textOf = (heading: string): string => sections.get(sectionKeyOf(heading)) ?? '';
  const required = stepsRequired(subject.rank);
  const missing: TemplateIssue[] = QUEST_TEMPLATE_SECTIONS.filter(
    ({ id, heading }) => (id !== 'steps' || required) && textOf(heading) === '',
  ).map(({ id }) => ({ code: 'missing_section', section: id }));
  const steps = textOf('Steps');
  const unordered: TemplateIssue[] =
    required && steps !== '' && !ORDERED_ITEM.test(steps) ? [{ code: 'unordered_steps' }] : [];
  const unknown: TemplateIssue[] = namedChecks(textOf('Done when'))
    .filter((id) => checks !== undefined && !checks.includes(id))
    .map((check) => ({ code: 'unknown_check', check }));
  return [...missing, ...unordered, ...unknown];
}

const HEADINGS = Object.fromEntries(
  QUEST_TEMPLATE_SECTIONS.map(({ id, heading }) => [id, heading]),
) as Readonly<Record<QuestTemplateSection, string>>;

/** The issue in English, for the subquests check's log, the Chancellor's second try and `elvaria say`. */
export function templateIssueLine(issue: TemplateIssue): string {
  if (issue.code === 'missing_section') return `no "## ${HEADINGS[issue.section]}" section, or it is empty`;
  if (issue.code === 'unordered_steps')
    return `"## Steps" has no numbered step: ranks ${RANKS[0]} to ${STEPS_REQUIRED_UP_TO} list their steps in order`;
  return `"Done when" names check \`${issue.check}\`, which its territory does not have`;
}
