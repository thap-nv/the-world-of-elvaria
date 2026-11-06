// The version a CLI reports, which kingdom.json pins (`tribes[].tool.version`): Elvaria's knowledge of a CLI holds
// for one version (docs/reference/cli-facts-*.md), so a changed version must be noticed, not followed silently.
import { minimalEnv } from '../process/minimal-env.ts';
import { runProcess } from '../process/run-process.ts';
import type { Env } from '../io.ts';
import type { Launch } from '../process/launch.ts';

const VERSION_TIMEOUT_MS = 20_000;
const VERSION = /\d+\.\d+\.\d+(?:[-+.][0-9A-Za-z.-]+)?/;
const LINE_MAX = 80;

/** `2.1.318 (Claude Code)` → `2.1.318`; a first line without a version number is kept as it is. */
export function parseVersion(stdout: string): string | undefined {
  const first = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line !== '');
  if (first === undefined) return undefined;
  return VERSION.exec(first)?.[0] ?? first.slice(0, LINE_MAX);
}

/** `<tool> --version`, run without a shell and with the minimal environment. */
export async function toolVersion(launch: Launch, env: Env): Promise<string | undefined> {
  const outcome = await runProcess(launch.file, [...launch.args, '--version'], {
    env: minimalEnv(env),
    timeoutMs: VERSION_TIMEOUT_MS,
  });
  return outcome.code === 0 ? parseVersion(outcome.stdout) : undefined;
}
