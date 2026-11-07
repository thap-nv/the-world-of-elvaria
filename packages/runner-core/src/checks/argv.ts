// A territory command line (`run`, `cleanup`, `setup`) as the argv runProgram starts: split without a shell
// (ADR 0015), its program found by the composition root (implementation-plan §3.2 "(P1-07)").
import { err, ok } from '@elvaria/domain';
import type { Result } from '@elvaria/domain';

import { splitCommandLine } from './command-line.ts';
import type { CommandLineIssue } from './command-line.ts';
import type { ProgramResolver } from '../process/program.ts';

export interface CommandIssue {
  readonly reason: CommandLineIssue | 'not_found';
  readonly detail: string;
}

/** `line` as the argv to spawn, its program resolved; this is also the `argv` the run-check script expects. */
export async function argvOf(
  line: string,
  resolve: ProgramResolver,
): Promise<Result<readonly string[], CommandIssue>> {
  const words = splitCommandLine(line);
  if (!words.ok) return err({ reason: words.error, detail: line });
  const [program = '', ...args] = words.value;
  const launch = await resolve(program);
  if (launch === undefined) return err({ reason: 'not_found', detail: program });
  return ok([launch.file, ...launch.args, ...args]);
}
