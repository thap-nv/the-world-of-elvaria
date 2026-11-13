// The plan file of a plan quest (implementation-plan §3.16.6, ADR 0028; owner 2026-11-13 after PS-06, (e) and (g)):
// the mage writes it at `plans/<short-topic>.md` in its plot with the headings of PLAN_FILE_SECTIONS, and the Steward's
// subquests check holds it to them before any judge reads the plan. The owner seals the plan on its summary, which
// `elvaria quest show` prints beside the brief the plan quest's description opens with.
import { BRIEF_HEADING, PLAN_FILE_FOLDER, PLAN_FILE_SECTIONS } from './constants.ts';
import { isFence, isSectionHeading, sectionKeyOf, sectionsOf } from './sections.ts';
import type { PlanFileSection } from './constants.ts';

const MARKDOWN = /\.md$/i;
/** The line a party's description puts between the owner's text and the mage's (blind trial, P1-21). */
const RULE = /^\s*---\s*$/;

/** The plan files among `paths` (relative to the plot with `/`, as the plot says what the quest changed), sorted. */
export const planFilesOf = (paths: readonly string[]): string[] =>
  paths.filter((path) => path.startsWith(`${PLAN_FILE_FOLDER}/`) && MARKDOWN.test(path)).toSorted();

/** The sections a plan file lacks, or holds nothing under, in the template's order; none when it follows it. */
export function planFileGapsOf(text: string): PlanFileSection[] {
  const sections = sectionsOf(text);
  return PLAN_FILE_SECTIONS.filter(({ heading }) => (sections.get(sectionKeyOf(heading)) ?? '') === '').map(
    ({ id }) => id,
  );
}

/** The plan file's summary, the page the owner seals the plan on; undefined when it has none. */
export function planSummaryOf(text: string): string | undefined {
  const [summary] = PLAN_FILE_SECTIONS;
  const found = sectionsOf(text).get(sectionKeyOf(summary.heading));
  return found === undefined || found === '' ? undefined : found;
}

export type PlanFileIssue =
  /** The quest changed no `plans/*.md`: its plan has no file. */
  | { readonly code: 'no_plan_file' }
  /** A plan file lacks sections of the template. */
  | { readonly code: 'plan_file_gaps'; readonly file: string; readonly sections: readonly PlanFileSection[] };

/** A plan file and its text. */
export interface PlanFileText {
  readonly file: string;
  readonly text: string;
}

/**
 * What is wrong with the plan files a plan quest changed: none as soon as one follows the template (a plan may touch an
 * older plan file too); else each one's gaps, or no file at all.
 */
export function planFileIssuesOf(files: readonly PlanFileText[]): PlanFileIssue[] {
  if (files.length === 0) return [{ code: 'no_plan_file' }];
  const gaps = files.map(({ file, text }) => ({ file, sections: planFileGapsOf(text) }));
  if (gaps.some(({ sections }) => sections.length === 0)) return [];
  return gaps.map(({ file, sections }) => ({ code: 'plan_file_gaps', file, sections }));
}

const HEADINGS = Object.fromEntries(PLAN_FILE_SECTIONS.map(({ id, heading }) => [id, heading])) as Readonly<
  Record<PlanFileSection, string>
>;

/** The issue in English, one line of the subquests check's log. */
export function planFileIssueLine(issue: PlanFileIssue): string {
  if (issue.code === 'no_plan_file')
    return `no plan file: the plan is written to ${PLAN_FILE_FOLDER}/<short-topic>.md in the plot and committed with the list`;
  const named = issue.sections.map((section) => `"## ${HEADINGS[section]}"`).join(', ');
  return `${issue.file} lacks ${named}, or they are empty: a plan file has ${PLAN_FILE_SECTIONS.map(({ heading }) => `"## ${heading}"`).join(', ')}`;
}

/** A plan quest's description cut in two: the brief it opens with (heading included), and the rest. */
export interface BriefSplit {
  readonly brief: string;
  readonly rest: string;
}

/**
 * The brief a plan quest's description opens with (the Chancellor's briefText: `## Brief`, then `###` sections), up to
 * the next heading of level one or two or a line `---`; undefined when the description opens with no brief.
 */
export function splitBrief(description: string): BriefSplit | undefined {
  const lines = description.trimStart().split(/\r?\n/);
  if (lines[0]?.trim() !== `## ${BRIEF_HEADING}`) return undefined;
  let fenced = false;
  const end = lines.findIndex((line, index) => {
    if (isFence(line)) fenced = !fenced;
    return index > 0 && !fenced && (isSectionHeading(line) || RULE.test(line));
  });
  const cut = end === -1 ? lines.length : end;
  return { brief: lines.slice(0, cut).join('\n').trim(), rest: lines.slice(cut).join('\n').trim() };
}
