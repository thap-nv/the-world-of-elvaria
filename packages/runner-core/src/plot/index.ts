export { HEAD_LINES, LINE_CHARS, hookOutputHead } from './hook-output.ts';
export type { HookOutputHead } from './hook-output.ts';
export { checkedTreeOf, gitOf, stagedTreeOf, treeOf, zList } from './git.ts';
export type { Git, GitRun } from './git.ts';
export { plotCommitMessage } from './commit-message.ts';
export { folderPlotOf } from './folder.ts';
export { createPlotManager } from './plot-manager.ts';
export type { PlotManager, PlotManagerOptions, PreparedPlot, PrepareOptions } from './plot-manager.ts';
export type { BaseBranch, MergeOptions, MergeOutcome, MergeStop, MergeStopped } from './merge.ts';
export type { BaseTips } from './in-base.ts';
export type { BaseUpdate } from './base-update.ts';
export { MERGE_TREE_MIN_GIT } from './dry-merge.ts';
export type { ResolvedFile, SharedPaths } from './dry-merge.ts';
export { GENERATE_TIMEOUT_MS, generateLogOf } from './generate.ts';
export type { GenerateOutcome } from './generate.ts';
export type { GenerateRequest, QueueMethods } from './queue-methods.ts';
export { ruleOf } from './shared-merge.ts';
export type { SharedRule } from './shared-merge.ts';
export { PLOT_RECORD_FILE } from './plot-record.ts';
export type { PlotRecord } from './plot-record.ts';
export { PLOT_EXCLUDES } from './repo-settings.ts';
export { SETUP_TIMEOUT_MS, setupLogOf } from './setup.ts';
export { failureInLogFile } from './trial-log.ts';
export { DIFF_MAX_CHARS } from './diff.ts';
export type { DiffScope } from './diff.ts';
export type { Drift } from './drift.ts';
export { SUBQUESTS_FILE } from './subquests.ts';
export { PATCH_FILE } from './patch.ts';
export { SCRATCH_SUFFIX, scratchIdOf } from './scratch.ts';
export type { PreparedScratch } from './scratch.ts';
export type { PatchOutcome } from './patch.ts';
export type { SetupRun } from './setup.ts';
export type { CommitOutcome, ForgetWorktree, PlotStatus, ReleasedPlot } from './worktree-ops.ts';
export { SET_ASIDE_DIR, WIP_PATCH_FILE, isScratchFile } from './rescue.ts';
export type { CommitRescue } from './rescue.ts';
export {
  commitLinksOf,
  commitsSinceStamp,
  patrolIdOf,
  probeIdOf,
  territoryHeadOf,
  trialIdOf,
  trialRunDirOf,
  tryTerritory,
} from './territory-trial.ts';
export type {
  CommitLinksRequest,
  StampCountRequest,
  TerritoryHead,
  TerritoryTrialRequest,
  TerritoryTrialRun,
} from './territory-trial.ts';
export type { PlotFailure, PlotFailureReason } from './worktree.ts';
