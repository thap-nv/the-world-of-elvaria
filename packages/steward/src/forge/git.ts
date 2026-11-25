// git as a delivery runs it (PS-08c): the program the composition root found, no shell, the Steward's minimal env
// and the two switches that forbid asking anyone (DELIVERY_GIT_SWITCHES). runner-core's runProgram drops every GIT_*
// name from a child's env, which is right for a plot's git and wrong here, so a delivery starts its git with
// startChild. A push runs the territory's pre-push hook, a tree of processes (`pnpm check:fast`): a stop of the
// Steward or the time limit kills the whole tree (killTree), on Windows and macOS alike. Before the command, the
// switches of gitGuard: no fsmonitor, ssh command, askpass or credential helper that the territory's own config
// names, only the owner's (SEC-02), since a push hands the helpers the token.
import { gitGuard, startChild } from '@elvaria/runner-core';
import type { Launch } from '@elvaria/runner-core';

import { DELIVERY_GIT_SWITCHES } from './forge.ts';

export interface DeliveryGitRun {
  /** null when git was killed (its time limit, the Steward's stop) or could not start. */
  readonly code: number | null;
  /** stdout then stderr, as git and the hook printed them; not masked yet. */
  readonly output: string;
  readonly stopped: boolean;
}

export interface DeliveryGit {
  readonly launch: Launch;
  /** The Steward's minimal env (deps.env): the credential helper finds its store through HOME, APPDATA… */
  readonly env: Readonly<Record<string, string>>;
}

/** Runs git `args` in `cwd` to its end, its time limit or `signal`, killing its tree at either. */
export async function runDeliveryGit(
  git: DeliveryGit,
  cwd: string,
  args: readonly string[],
  limits: {
    readonly timeout_ms: number;
    readonly signal: AbortSignal;
    readonly env?: Readonly<Record<string, string>>;
  },
): Promise<DeliveryGitRun> {
  const out: string[] = [];
  const err: string[] = [];
  const env = { ...git.env, ...DELIVERY_GIT_SWITCHES };
  const guard = await gitGuard(git.launch, cwd, env);
  // The extra env belongs to this command alone, not gitGuard's preceding `git config` (RC-02).
  const commandEnv = { ...env, ...limits.env, ...DELIVERY_GIT_SWITCHES };
  const child = startChild(
    git.launch,
    [...guard, ...args],
    { cwd, env: commandEnv, onStderr: (chunk) => err.push(chunk) },
    (line) => out.push(line),
  );
  // An object, not a let: the callbacks set it, which TypeScript's narrowing cannot see.
  const killed = { stopped: false };
  const stop = (): void => {
    killed.stopped = true;
    child.kill();
  };
  const timer = setTimeout(stop, limits.timeout_ms);
  limits.signal.addEventListener('abort', stop, { once: true });
  if (limits.signal.aborted) stop();
  const exit = await child.exit;
  clearTimeout(timer);
  limits.signal.removeEventListener('abort', stop);
  const output = [...out, err.join('')].filter((part) => part !== '').join('\n');
  return { code: killed.stopped ? null : exit.code, output: exit.failure ?? output, stopped: killed.stopped };
}
