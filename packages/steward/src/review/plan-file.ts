// The plan file in the subquests check (owner 2026-11-13 after PS-06, (e); PS-06b): before a plan's judge, the Steward
// reads the `plans/*.md` files the quest changed and holds them to the plan file's template (planFileIssuesOf), since
// the owner seals the plan on its summary. What the quest changed comes from its plot (Plots.touched). A plot that
// does not list the quest's own subquests.json among its changes cannot say what the quest wrote (a folder the
// Steward's specs give, a plot git cannot read): the plan file then goes unchecked, and the log says so.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { planFileGapsOf, planFileIssueLine, planFileIssuesOf, planFilesOf } from '@elvaria/domain';
import type { PlanFileText, Quest } from '@elvaria/domain';
import { SUBQUESTS_FILE } from '@elvaria/runner-core';

import type { Context } from '../context.ts';

export interface PlanFileCheck {
  readonly pass: boolean;
  /** Lines of the subquests check's log. */
  readonly lines: readonly string[];
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const unchecked = (why: string): PlanFileCheck => ({
  pass: true,
  lines: [`plan file: not checked, what the quest wrote is unknown: ${why}`],
});

/** The plan files a plan quest changed in its plot `dir` (native), held to the template. */
export async function planFileCheck(
  ctx: Context,
  quest: Quest,
  dir: string | undefined,
): Promise<PlanFileCheck> {
  if (dir === undefined) return unchecked('the quest has no plot');
  let changed: readonly string[];
  try {
    changed = await ctx.deps.plots.touched(quest.plot);
  } catch (error) {
    return unchecked(messageOf(error));
  }
  if (!changed.includes(SUBQUESTS_FILE))
    return unchecked(`the plot does not list ${SUBQUESTS_FILE} among its changes`);
  const files: PlanFileText[] = [];
  for (const file of planFilesOf(changed)) {
    // A plan file the quest deleted is no plan: it reads as empty.
    const text = await readFile(path.join(dir, ...file.split('/')), 'utf8').catch(() => '');
    files.push({ file, text });
  }
  const issues = planFileIssuesOf(files);
  if (issues.length > 0) return { pass: false, lines: issues.map(planFileIssueLine) };
  const kept = files.filter(({ text }) => planFileGapsOf(text).length === 0).map(({ file }) => file);
  return { pass: true, lines: [`plan file: ${kept.join(', ')} follows the template`] };
}
