// `elvaria quest show` of a plan quest (owner 2026-11-13 after PS-06, (g); PS-06b): the brief its description opens
// with, apart from the rest, and once the plan waits for the seal, the summary of its plan file, the page the owner
// seals it on. The plan file is a `plans/*.md` the quest changed in its plot (planFilesOf), what the Steward's
// subquests check read before the judge; what the plot changed comes from runner-core's PlotManager, as for the
// Steward (git on a worktree, the folder's files on a folder).
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { planFilesOf, planSummaryOf, splitBrief } from '@elvaria/domain';
import type { Quest } from '@elvaria/domain';
import { createPlotManager } from '@elvaria/runner-core';
import { fromPortable, inKingdom } from '@elvaria/store';

import { processHostOf } from '../run/plots.ts';
import type { KingdomContext } from '../kingdom-context.ts';

export interface PlanView {
  /** The brief and the plan's summary, each after an empty line; none for a quest that is no plan. */
  readonly lines: readonly string[];
  /** The description without its brief. */
  readonly description: string;
}

/** The plot's folder: the worktree, or the folder in the kingdom; none for a quest without a plot. */
function plotDirOf(root: string, plot: Quest['plot']): string | undefined {
  if (plot.path === undefined) return undefined;
  return plot.type === 'worktree' ? fromPortable(plot.path) : inKingdom(root, plot.path);
}

async function changedIn(ctx: KingdomContext, quest: Quest): Promise<readonly string[]> {
  const manager = createPlotManager({
    kingdom: ctx.store.root,
    host: processHostOf(ctx.io),
    platform: ctx.io.platform,
  });
  // A plot git cannot read shows no plan file; `quest show` still prints the rest.
  return manager.touched(quest.plot).catch(() => []);
}

/** The summary of each plan file the quest changed, after its title; a line that says there is none else. */
async function summaryLines(ctx: KingdomContext, quest: Quest): Promise<string[]> {
  const dir = plotDirOf(ctx.store.root, quest.plot);
  const files = dir === undefined ? [] : planFilesOf(await changedIn(ctx, quest));
  const lines: string[] = [];
  for (const file of files) {
    const text = await readFile(path.join(dir ?? '', ...file.split('/')), 'utf8').catch(() => '');
    const summary = planSummaryOf(text);
    if (summary !== undefined) lines.push('', ctx.t('cli.quest.show.plan_summary', { file }), summary);
  }
  return lines.length > 0 ? lines : ['', ctx.t('cli.quest.show.no_plan_summary')];
}

/** What `quest show` prints of a plan quest beyond its fields: the brief, the plan's summary while the seal waits. */
export async function planViewOf(ctx: KingdomContext, quest: Quest): Promise<PlanView> {
  if (quest.deliverable.type !== 'subquests') return { lines: [], description: quest.description };
  const brief = splitBrief(quest.description);
  const summary = quest.status === 'awaiting_seal' ? await summaryLines(ctx, quest) : [];
  return {
    lines: [...(brief === undefined ? [] : ['', ctx.t('cli.quest.show.brief'), brief.brief]), ...summary],
    description: brief?.rest ?? quest.description,
  };
}
