// git as the CLI uses it: short read-only questions (`rev-parse`, `symbolic-ref`, `--version`), absolute path from
// PATH, no shell, minimal environment. Worktrees and commits belong to runner-core's PlotManager (P1-07).
import { findExecutable } from './find-executable.ts';
import { minimalEnv } from './minimal-env.ts';
import { runProcess } from './run-process.ts';
import type { CliIo } from '../io.ts';

const GIT_TIMEOUT_MS = 15_000;

/** stdout of `git <args>`, trimmed; undefined when git exits non-zero. */
export type Git = (args: readonly string[]) => Promise<string | undefined>;

/** git run in `cwd`, or undefined when no git is on PATH. */
export async function gitIn(io: CliIo, cwd: string): Promise<Git | undefined> {
  const file = await findExecutable('git', io.env, io.platform);
  if (file === undefined) return undefined;
  const env = minimalEnv(io.env);
  return async (args) => {
    const outcome = await runProcess(file, args, { cwd, env, timeoutMs: GIT_TIMEOUT_MS });
    return outcome.code === 0 ? outcome.stdout.trim() : undefined;
  };
}
