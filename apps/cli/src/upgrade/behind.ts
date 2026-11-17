// `elvaria upgrade` builds from the local branch it is given (`main` unless `--ref` names another), so a checkout the
// owner forgot to pull builds old code and nobody knows ((vi) of run (130), (176)). The command says so when the local
// branch lacks commits that its copy under `origin/` has. It compares refs already on this machine and never fetches:
// the network is the owner's to use, so the warning says the count is as of the last fetch.
import { gitRun } from './build.ts';
import type { Translate } from '@elvaria/i18n';

import type { CliIo } from '../io.ts';
import type { Tools } from './build.ts';

const REMOTE = 'origin';

export interface Behind {
  /** `origin/<ref>`, as the owner would type it after `--ref`. */
  readonly upstream: string;
  readonly count: number;
}

/**
 * How many commits `origin/<ref>` has that the local branch `<ref>` lacks, when both refs exist and the count is not
 * zero. A ref that is no local branch (a commit, a tag, `origin/main` itself) has nothing to be behind.
 */
export async function behindOf(
  tools: Tools,
  io: CliIo,
  source: string,
  ref: string,
): Promise<Behind | undefined> {
  const upstream = `${REMOTE}/${ref}`;
  const outcome = await gitRun(tools, io)(source, [
    'rev-list',
    '--count',
    `refs/heads/${ref}..refs/remotes/${upstream}`,
  ]);
  const count = Number(outcome.stdout.trim());
  return outcome.code === 0 && Number.isInteger(count) && count > 0 ? { upstream, count } : undefined;
}

/** The warning line before a build is made from a stale local branch; nothing when it is not stale. */
export async function warnIfBehind(
  cli: { readonly io: CliIo; readonly t: Translate },
  tools: Tools,
  source: string,
  ref: string,
): Promise<void> {
  const behind = await behindOf(tools, cli.io, source, ref);
  if (behind !== undefined) cli.io.err(cli.t('cli.upgrade.behind', { ref, source, ...behind }));
}
