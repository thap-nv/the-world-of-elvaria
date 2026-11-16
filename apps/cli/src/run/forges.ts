// The forges the Steward delivers to (PS-08c, ADR 0023): GitHub's adapter over the CLI's fetch, its token from git's
// credential store at every call, and the git the composition root finds on PATH, which a delivery runs with the
// Steward's minimal env and the two switches that forbid asking anyone. Without git, the Steward gets no forge, and a
// territory that delivers to one gets one `delivery.failed` per quest instead of a push.
import type { Forges } from '@elvaria/steward';

import { gitToken, githubForge } from '../forge/github-forge.ts';
import { findExecutable } from '../process/find-executable.ts';
import type { CliIo } from '../io.ts';

export async function forgesOf(io: CliIo): Promise<Forges | undefined> {
  const git = await findExecutable('git', io.env, io.platform);
  if (git === undefined) return undefined;
  return {
    adapters: { github: githubForge({ fetch: io.fetch, token: gitToken(io) }) },
    git: { file: git, args: [] },
  };
}
