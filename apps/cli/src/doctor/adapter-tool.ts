// Where the CLI of an owner adapter file is (P1-19, implementation-plan §3.14): the file knows its own CLI, so doctor
// asks its runner (`doctor()`: path and version) instead of searching PATH for a program name it cannot know.
// `--tool <tribe>=<path>` hands the file that path through the kit; without it the kit carries the pinned one.
import { stat } from 'node:fs/promises';
import path from 'node:path';

import type { Tribe } from '@elvaria/domain';
import { toPortable } from '@elvaria/store';

import { handOf } from '../run/crew.ts';
import { finding } from './finding.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { Finding } from './finding.ts';

/** The CLI found and its version, where the path came from, or the finding that says why there is none. */
export type ToolFound =
  | { readonly path: string; readonly version: string; readonly from: 'flag' | 'pinned' | 'path' | 'adapter' }
  | { readonly problem: Finding };

async function isFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The adapter file's own answer about its CLI. */
export async function adapterFileTool(tribe: Tribe, ctx: KingdomContext, given?: string): Promise<ToolFound> {
  const { t, io } = ctx;
  const toolPath = given === undefined ? undefined : path.resolve(io.cwd, given);
  if (toolPath !== undefined && !(await isFile(toolPath)))
    return {
      problem: finding('error', t('cli.doctor.tool_path_bad', { tribe: tribe.id, program: toolPath })),
    };
  const found = await handOf(tribe, { kingdom: ctx.kingdom, root: ctx.store.root }, io, toolPath);
  if (found.kind !== 'ready') {
    const problems = found.kind === 'broken' ? found.problems : [];
    const text = t('cli.doctor.adapter_file_broken', { tribe: tribe.id, adapter: tribe.adapter });
    return { problem: finding('error', text, problems) };
  }
  try {
    const info = await found.hand.runner.doctor();
    return {
      path: toPortable(info.path, io.platform),
      version: info.version,
      from: given === undefined ? 'adapter' : 'flag',
    };
  } catch (error) {
    const text = t('cli.doctor.adapter_doctor_failed', { tribe: tribe.id, detail: errorText(error) });
    return { problem: finding('error', text, [t('cli.doctor.tool_hint', { tribe: tribe.id })]) };
  }
}
