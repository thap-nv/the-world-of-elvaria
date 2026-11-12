// The code graphs' port (PS-21, ADR 0029): the graphify `doctor --pin` found, git as the plots run it, and the
// minimal env (ADR 0013). A kingdom with no graphify pinned gets none, and its quests run without graphs; `doctor`
// says so when a territory has code_graph on.
import { codeGraphsOf, gitOf } from '@elvaria/runner-core';
import { fromPortable } from '@elvaria/store';
import type { Kingdom } from '@elvaria/domain';
import type { CodeGraphs } from '@elvaria/runner-core';

import { minimalEnv } from '../process/minimal-env.ts';
import { processHostOf } from './plots.ts';
import type { CliIo } from '../io.ts';

/** Undefined without a pinned graphify, or without git. */
export async function graphsOf(
  kingdom: Pick<Kingdom, 'programs'>,
  root: string,
  io: CliIo,
): Promise<CodeGraphs | undefined> {
  const pinned = kingdom.programs?.graphify;
  if (pinned === undefined) return undefined;
  const git = await gitOf(processHostOf(io));
  if (git === undefined) return undefined;
  const program = { path: fromPortable(pinned.path, io.platform), version: pinned.version };
  return codeGraphsOf({ root, program, git, env: minimalEnv(io.env) });
}
