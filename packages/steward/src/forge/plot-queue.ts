// The merge queue's part of the Steward's Plots port (PS-09; runner-core's QueueMethods), apart from types.ts, which
// nears its 300 lines. Optional, as the looks are: Plots without them (folder plots, a spec's stand-in) deliver a
// branch as it is, as before PS-09, and never find an open pull request stale.
import type { Quest, Territory } from '@elvaria/domain';
import type { BaseTips, BaseUpdate, GenerateOutcome, GenerateRequest } from '@elvaria/runner-core';

export interface PlotQueue {
  /** The base branch merged into a done quest's branch, hot files resolved by their rule (PlotManager.update). */
  update?(plot: Quest['plot'], territory: Territory): Promise<BaseUpdate>;
  /** commands.generate after an update, and the commit of the hot files it rewrote (PlotManager.generate). */
  generate?(plot: Quest['plot'], territory: Territory, request: GenerateRequest): Promise<GenerateOutcome>;
  /** The update's checks passed: nothing pending in the plot any more. */
  settle?(plot: Quest['plot']): Promise<void>;
  /** Whether an open pull request's branch still merges cleanly into the base branch `tips` hold. */
  mergesClean?(plot: Quest['plot'], tips: BaseTips): Promise<boolean | undefined>;
}
