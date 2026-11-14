export { splitCommandLine } from './checks/command-line.ts';
export type { CommandLineIssue } from './checks/command-line.ts';
export { coverOf, globToRegExp, scopeCovers } from './checks/glob.ts';
export { argvOf } from './checks/argv.ts';
export type { CommandIssue } from './checks/argv.ts';
export { noAnswerWithin, runToEnd, startChild } from './process/child.ts';
export type { Child, ChildExit, ChildOptions, ChildRun } from './process/child.ts';
export { KILL_GRACE_MS, isAlive, killTree } from './process/kill-tree.ts';
export type { KillTreeOptions } from './process/kill-tree.ts';
export { childEnvOf, runProgram } from './process/program.ts';
export type { Launch, ProcessHost, ProgramOptions, ProgramResolver, ProgramRun } from './process/program.ts';
export { POWERSHELL_TIMEOUT_MS, processStartOf } from './process/started-at.ts';
export {
  CLEANUP_TIMEOUT_MS,
  MS_PER_MINUTE,
  checkLogOf,
  exclusiveLockOf,
  runChecks,
  toVerdictCheck,
} from './checks/run-checks.ts';
export type { CheckRun, ChecksOptions, ChecksRequest } from './checks/run-checks.ts';
export { selectChecks } from './checks/select-checks.ts';
export { COVERAGE_SUMMARY, COVERAGE_TIMEOUT_MS } from './checks/coverage.ts';
export { scratchAgain, scratchResetLogOf } from './checks/scratch-again.ts';
export type { ScratchAgainRequest } from './checks/scratch-again.ts';
export { trialInScratch } from './checks/scratch-trial.ts';
export type { ScratchTrialRequest } from './checks/scratch-trial.ts';
export { runTrial } from './checks/trial.ts';
export type { TrialPlot, TrialRequest } from './checks/trial.ts';
export { CONFORMANCE_CHECKS, conformanceChecks, runConformance } from './conformance/checks.ts';
export type { ConformanceReport } from './conformance/checks.ts';
export {
  FAKE_FORBIDDEN_COMMAND,
  FAKE_SCRATCH_COMMANDS,
  FAKE_QUESTION,
  FAKE_SCENARIOS,
  FAKE_SCENARIO_ENV,
  FAKE_STRUCTURED_ANSWER,
  FAKE_STRUCTURED_SCHEMA,
  fakeLetter,
  isFakeScenario,
} from './conformance/scenarios.ts';
export type { FakeScenario } from './conformance/scenarios.ts';
export {
  SPAWN_PROBE_COMMAND,
  SPAWN_PROBE_FAILED,
  SPAWN_PROBE_FILE,
  SPAWN_PROBE_OK,
  SPAWN_PROBE_OUT,
  SPAWN_PROBE_SCRIPT,
  readSpawnProbe,
  runFakeShellLine,
  writeSpawnProbe,
} from './conformance/spawn-probe.ts';
export type {
  CheckOutcome,
  ConformanceCheck,
  ConformanceTarget,
  FailedWorkspace,
  LeftWorkspace,
} from './conformance/target.ts';
export {
  CONFORMANCE_CHARACTER,
  CONFORMANCE_QUEST,
  conformanceRequest,
  openWorkspace,
  prepareWorkspace,
} from './conformance/workspace.ts';
export type { Workspace } from './conformance/workspace.ts';
export { hookMissing, hookProblem, hookScriptOf, withHookProblem } from './runner/hook-built.ts';
export { DOCTOR_NOTES, DOCTOR_NOTE_PARAMS, doctorNoteOf, callNote, hookNote } from './runner/doctor-notes.ts';
export type { DoctorNoteCode, DoctorNote } from './runner/doctor-notes.ts';
export { HEAD_LINES, LINE_CHARS, hookOutputHead } from './plot/hook-output.ts';
export type { HookOutputHead } from './plot/hook-output.ts';
export { ADAPTER_FACTORY, adapterOfModule, runnerProblems } from './kit/adapter-module.ts';
export type { AdapterFactory } from './kit/adapter-module.ts';
export { ADAPTER_KIT_VERSION, adapterKitOf } from './kit/kit.ts';
export type { AdapterKit, KitHookCommand, KitHost } from './kit/kit.ts';
export {
  GRAPH_BUSY,
  GRAPH_FILE,
  GRAPH_KEEP,
  GRAPH_TIMEOUT_MS,
  buildGraph,
  builtGraph,
  graphDirOf,
} from './graph/build-graph.ts';
export type { GraphBuild, GraphBuildOptions, GraphProgram } from './graph/build-graph.ts';
export { GRAPH_ASK_TIMEOUT_MS, codeGraphsOf } from './graph/code-graphs.ts';
export type { CodeGraphs, CodeGraphsOptions } from './graph/code-graphs.ts';
export { GRAPHIFY_ENV, GRAPH_OUT_ENV, graphEnvOf } from './graph/graph-env.ts';
export { USE_RELATIONS, graphLinksOf, readGraphLinks } from './graph/graph-links.ts';
export { answerFilesOf } from './graph/query-answer.ts';
export type { AnswerFile } from './graph/query-answer.ts';
export { gitOf, zList } from './plot/git.ts';
export type { Git, GitRun } from './plot/git.ts';
export { plotCommitMessage } from './plot/commit-message.ts';
export { folderPlotOf } from './plot/folder.ts';
export { createPlotManager } from './plot/plot-manager.ts';
export type { PlotManager, PlotManagerOptions, PreparedPlot, PrepareOptions } from './plot/plot-manager.ts';
export type { MergeOutcome, MergeStop, MergeStopped } from './plot/merge.ts';
export { PLOT_RECORD_FILE } from './plot/plot-record.ts';
export type { PlotRecord } from './plot/plot-record.ts';
export { PLOT_EXCLUDES } from './plot/repo-settings.ts';
export { SETUP_TIMEOUT_MS, setupLogOf } from './plot/setup.ts';
export { DIFF_MAX_CHARS } from './plot/diff.ts';
export type { DiffScope } from './plot/diff.ts';
export type { Drift } from './plot/drift.ts';
export { SUBQUESTS_FILE } from './plot/subquests.ts';
export { PATCH_FILE } from './plot/patch.ts';
export { SCRATCH_SUFFIX, scratchIdOf } from './plot/scratch.ts';
export type { PreparedScratch } from './plot/scratch.ts';
export type { PatchOutcome } from './plot/patch.ts';
export type { SetupRun } from './plot/setup.ts';
export type { CommitOutcome, ForgetWorktree, PlotStatus, ReleasedPlot } from './plot/worktree-ops.ts';
export { SET_ASIDE_DIR, WIP_PATCH_FILE, isScratchFile } from './plot/rescue.ts';
export type { CommitRescue } from './plot/rescue.ts';
export { commitsSinceStamp, trialIdOf, trialRunDirOf, tryTerritory } from './plot/territory-trial.ts';
export type { StampCountRequest, TerritoryTrialRequest, TerritoryTrialRun } from './plot/territory-trial.ts';
export type { PlotFailure, PlotFailureReason } from './plot/worktree.ts';
export { commandRefusal } from './policy/command-refusal.ts';
export {
  AGENT_TOOL,
  APPRENTICE_RULE,
  BUILT_IN_AGENTS,
  GIT_PATHS,
  NO_COMMIT_RULE,
  NO_HISTORY_COMMAND,
  NO_PUSH_COMMAND,
  NO_PUSH_RULE,
  SEARCH_COMMANDS,
  SECRET_FILES,
  WRITE_TOOLS,
} from './policy/constants.ts';
export { forbiddenChangesOf, forbiddenPathsOf } from './policy/forbidden-changes.ts';
export { toolOf, toolPolicyOf } from './policy/tool-policy.ts';
export type { ToolLaws, ToolPolicy, ToolPolicyInput } from './policy/tool-policy.ts';
export { JOURNAL_TAIL_LINES, LANGUAGE_NAMES } from './prompt/blocks.ts';
export type { Continuation, Locale, Memory } from './prompt/blocks.ts';
export type { FiledMemo } from './prompt/memory.ts';
export type { PromptObjection } from './prompt/objection.ts';
export { buildPrompt } from './prompt/build-prompt.ts';
export type { PromptGraph } from './prompt/graph-block.ts';
export { driftNote, gazetteerStampOf, gazetteerWithDrift } from './prompt/gazetteer-drift.ts';
export type { AssigneePromptInput, PromptInput, VerifierPromptInput } from './prompt/build-prompt.ts';
export type { PromptCheck } from './prompt/checks.ts';
export { buildChancellorPrompt } from './prompt/chancellor.ts';
export { NAMED_FILES_SHOWN } from './prompt/chancellor-code.ts';
export type {
  GraphAnswer,
  GraphFile,
  NamedPath,
  SizedFile,
  TerritoryCode,
} from './prompt/chancellor-code.ts';
export { buildTriagePrompt } from './prompt/triage.ts';
export { AMENDMENT_TEXT_MAX, buildAmendmentPrompt } from './prompt/amendment.ts';
export type { AmendmentAuthorRole, AmendmentContext } from './prompt/amendment.ts';
export { CONTEXT_FILE_MAX_CHARS, contextPathsIn, readContextFiles } from './prompt/context-files.ts';
export type { ContextFile } from './prompt/context-files.ts';
export type { ChancellorContext } from './prompt/chancellor.ts';
export type { TriageContext, TriageMemo } from './prompt/triage.ts';
export { PROMPT_BLOCK_IDS } from './prompt/prompt-blocks.ts';
export type { PromptBlock, PromptBlockId, PromptPart, PromptWithBlocks } from './prompt/prompt-blocks.ts';
export { resumedPrompt } from './prompt/resumed.ts';
export { letterReminderPrompt } from './prompt/letter-reminder.ts';
export type { Answered } from './prompt/resumed.ts';
export { PROMPTS_DIR, PROMPT_TEMPLATES, loadPromptTemplates } from './prompt/templates.ts';
export type { PromptTemplateName, PromptTemplates } from './prompt/templates.ts';
export { FAKE_ADAPTER, FAKE_TOKENS, createFakeRunner, scenarioFromEnv } from './runner/fake-runner.ts';
export type { FakeRunner, FakeRunnerOptions } from './runner/fake-runner.ts';
export { HANDOVER_SECTIONS, memosOf, questionOf, readQuestion, sectionOf } from './runner/handover.ts';
export type { HandoverSection, LetterMemos } from './runner/handover.ts';
export { POLICY_FILE, POLICY_VERSION, policyFileOf, writePolicyFile } from './runner/policy-file.ts';
export type { PolicyExtras, PolicyFile } from './runner/policy-file.ts';
export type { DialectTool, HookDialect } from './runner/hook-dialect.ts';
export { CONTEXT_ENV, contextEnv, runContextOf } from './runner/run-context.ts';
export type { RunContext } from './runner/run-context.ts';
export { openRunLog } from './runner/run-log.ts';
export type { RunEventDraft, RunLog, RunLogOptions } from './runner/run-log.ts';
export { NOTE_PREFIX, STDERR_FILE, STDOUT_FILE, openRunOutput } from './runner/run-output.ts';
export type { RunOutput } from './runner/run-output.ts';
export { createSignalChannel } from './runner/signal-channel.ts';
export type { SignalChannel } from './runner/signal-channel.ts';
export { SPAWN_ROLES } from './runner/roles.ts';
export {
  NO_JSON,
  RETRY_DIR,
  checkTextReply,
  issueLines,
  jsonOfText,
  replyFormatBlock,
  retryBlock,
} from './structured/reply.ts';
export type { ReplyCheck, ReplyIssues, SchemaIssue } from './structured/reply.ts';
export { parsedRequest, replyIssues, retryRequest, spawnParsed } from './structured/prompt-and-parse.ts';
export type { ParseOptions } from './structured/prompt-and-parse.ts';
export { spawnSequel } from './structured/sequel.ts';
export type { Follow, Heard, Sequel } from './structured/sequel.ts';
export { MINIMAL_ENV_NAMES, minimalEnv } from './treasury/minimal-env.ts';
export { secretEnvNamesOf, secretValuesOf, sessionEnv, sessionRedactor } from './treasury/session-env.ts';
export type { SessionEnvInput } from './treasury/session-env.ts';
export { inspectTreasury, openFileTreasury, secretEnvName } from './treasury/treasury.ts';
export type {
  FileTreasuryOptions,
  Treasury,
  TreasuryContents,
  TreasuryProblem,
} from './treasury/treasury.ts';
export type { SpawnRole } from './runner/roles.ts';
export { RUN_OUTCOMES } from './runner/types.ts';
// The domain's rule for a session's tokens (P1-23), here because an adapter imports runner-core only (ADR 0006).
export { countedTokens } from '@elvaria/domain';
export type { SessionTokens } from '@elvaria/domain';
// The models an adapter declares (capabilities.models, PS-23), for an adapter that may import runner-core only.
export type { TribeModel } from '@elvaria/domain';
export type {
  AbsolutePath,
  AdapterId,
  AdapterTool,
  AgentRunner,
  Budget,
  BuiltPrompt,
  JsonSchema,
  PermissionDenial,
  ProbeOptions,
  ProbeResult,
  RunOutcome,
  RunResult,
  RunnerSignal,
  RunningSession,
  SequelSession,
  SpawnRequest,
  ToolInfo,
} from './runner/types.ts';
