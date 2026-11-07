// Which Claude Code to start and how, shared by the runner and by `forget` (implementation-plan §3.3, §3.7): the
// pinned path or the one locate.ts finds, started without a shell, with the minimal env and no git variable.
import { tmpdir } from 'node:os';

import { NOT_FOUND } from './doctor.ts';
import { launchOf } from './launch.ts';
import { locateClaude } from './locate.ts';
import type { Launch } from './launch.ts';

/** `--version`, `auth status`, `/usage` (≈ 4 s), the ping (≈ 4 s), `purge`, with room for a slow machine. */
const SHORT_CALL_MS = 60_000;

export interface ClaudeToolOptions {
  /** `tribes[].tool.path`; when absent, found as `elvaria doctor` would (locate.ts). */
  readonly executable?: string;
  /** The minimal env (§3.9) of the calls that are not sessions; a session gets SpawnRequest.env instead. */
  readonly env: Readonly<Record<string, string>>;
  /** cwd of the calls that need no plot; the system temp folder by default. */
  readonly workDir?: string;
  readonly platform?: NodeJS.Platform;
  /** The Node that runs an npm shim's script; this process's by default. */
  readonly nodePath?: string;
  readonly timeoutMs?: number;
}

export interface ClaudeTool {
  readonly env: Record<string, string>;
  readonly cwd: string;
  readonly timeoutMs: number;
  readonly nodePath: string;
  /** The CLI's path, looked up once; undefined when there is none. */
  executable(): Promise<string | undefined>;
  /** How to start it; throws NOT_FOUND when there is none. */
  launch(): Promise<Launch>;
}

const withoutGit = (env: Readonly<Record<string, string>>): Record<string, string> =>
  Object.fromEntries(Object.entries(env).filter(([name]) => !name.startsWith('GIT_')));

export function claudeTool(options: ClaudeToolOptions): ClaudeTool {
  const nodePath = options.nodePath ?? process.execPath;
  const env = withoutGit(options.env);
  let found: Promise<string | undefined> | undefined;
  const executable = () =>
    (found ??=
      options.executable === undefined
        ? locateClaude(env, options.platform ?? process.platform)
        : Promise.resolve(options.executable));
  return {
    env,
    cwd: options.workDir ?? tmpdir(),
    timeoutMs: options.timeoutMs ?? SHORT_CALL_MS,
    nodePath,
    executable,
    launch: async () => {
      const file = await executable();
      if (file === undefined) throw new Error(NOT_FOUND);
      return launchOf(file, nodePath);
    },
  };
}
