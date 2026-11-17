// A newer build to offer in the digest (implementation-plan §3.16.4, ADR 0026; PS-08d): the repo the pinned build came
// from has commits on the branch `upgrade` builds by default that touch `packages/` or `apps/` since the commit the
// kingdom pins (a change of docs alone needs no upgrade). The CLI keeps the pin (.state/build.json), so it reads this,
// as the digest is made: the Steward through its port (StewardDeps.upgradeOffer, run.ts) and `elvaria digest`. A
// build is a worktree of that repo and the checkout `--here` runs from is one too: their refs are the repo's. No fetch:
// the branch as `upgrade` would build it now.
import type { UpgradeOffer } from '@elvaria/domain';

import { findExecutable } from '../process/find-executable.ts';
import { minimalEnv } from '../process/minimal-env.ts';
import { runProcess } from '../process/run-process.ts';
import { isCommitSha, readPointer } from './pointer.ts';
import { SELF_ROOT } from './self.ts';
import { DEFAULT_REF } from './upgrade.ts';
import type { CliIo } from '../io.ts';

/** What counts as a change of the build: its code, not its docs. */
const CODE_PATHS = ['packages', 'apps'] as const;
/** Local git only; a digest does not wait long for an offer. */
const GIT_TIMEOUT_MS = 30_000;

/** The offer, or undefined: no pin, no git, a pin at the branch's tip, or nothing new in the code since it. */
export async function upgradeOffer(
  io: CliIo,
  root: string,
  source: string = SELF_ROOT,
): Promise<UpgradeOffer | undefined> {
  const read = await readPointer(root);
  const git = await findExecutable('git', io.env, io.platform);
  if (read.kind !== 'pinned' || git === undefined) return undefined;
  const pinned = read.pointer.current;
  const run = (args: readonly string[]) =>
    runProcess(git, args, { cwd: source, env: minimalEnv(io.env), timeoutMs: GIT_TIMEOUT_MS });
  const tip = await run(['rev-parse', '--verify', '--end-of-options', `${DEFAULT_REF}^{commit}`]);
  const latest = tip.stdout.trim();
  if (tip.code !== 0 || !isCommitSha(latest) || latest === pinned) return undefined;
  const counted = await run(['rev-list', '--count', `${pinned}..${latest}`, '--', ...CODE_PATHS]);
  const commits = Number(counted.stdout.trim());
  return counted.code === 0 && commits > 0 ? { pinned, latest, commits } : undefined;
}
