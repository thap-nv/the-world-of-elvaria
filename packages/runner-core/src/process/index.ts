export { noAnswerWithin, runToEnd, startChild } from './child.ts';
export type { Child, ChildExit, ChildOptions, ChildRun } from './child.ts';
export { KILL_GRACE_MS, isAlive, killTree } from './kill-tree.ts';
export type { KillTreeOptions } from './kill-tree.ts';
export { childEnvOf, runProgram } from './program.ts';
export type { Launch, ProcessHost, ProgramOptions, ProgramResolver, ProgramRun } from './program.ts';
export { POWERSHELL_TIMEOUT_MS, processStartOf } from './started-at.ts';
export { gitGuard } from './git-guard.ts';
