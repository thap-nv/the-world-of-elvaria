// The files one Codex session runs on (implementation-plan §2.2, §3.7): policy.json and schema.json in the run
// folder; AGENTS.override.md in the plot, excluded from git (runner-core PLOT_EXCLUDES), for the session's life
// only, as agy's GEMINI.md (P1-23). Never in the owner's ~/.codex: everything else goes through `-c` (spike §1.3).
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { readContextFiles, writePolicyFile } from '@elvaria/runner-core';
import type { RunContext, SpawnRequest } from '@elvaria/runner-core';

import { CONTEXT_FILE, LAW_FILES, codexNote, contextFileText, isElvariaContext } from './context-file.ts';

export interface RunFiles {
  /** policy.json of runner-core's writePolicyFile: the laws, context, secret names and tools the hook reads. */
  readonly policy: string;
  readonly context: string;
  /** `--output-schema` when the request asks for structured output. */
  readonly schema?: string;
}

async function existing(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

/** Whether the session may write files: the sandbox then lets it write the plot (spike §4). */
export const sessionWrites = (req: Pick<SpawnRequest, 'permissions'>): boolean =>
  req.permissions.tools.some((tool) => tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit');

export async function writeRunFiles(req: SpawnRequest, ctx: RunContext): Promise<RunFiles> {
  const context = path.join(req.cwd, CONTEXT_FILE);
  const old = await existing(context);
  // Elvaria never edits a territory's file, and Codex reads only one override per folder.
  if (old !== undefined && !isElvariaContext(old)) {
    throw new Error(
      `${context} belongs to the territory: the Codex tribe cannot run here without replacing it`,
    );
  }
  const policy = await writePolicyFile(req.run_dir, ctx, req.permissions);
  const schema = req.structured === undefined ? undefined : path.join(req.run_dir, 'schema.json');
  if (schema !== undefined) await writeFile(schema, `${JSON.stringify(req.structured, null, 2)}\n`, 'utf8');
  const patterns = [...LAW_FILES, ...(req.territory?.context_files ?? [])];
  const files = await readContextFiles(req.cwd, patterns);
  const note = codexNote(req.permissions, sessionWrites(req));
  await writeFile(context, contextFileText(req.prompt.system, files, note), 'utf8');
  return { policy, context, ...(schema === undefined ? {} : { schema }) };
}

/** A Windows file can stay busy a moment after the tree that held it died; `rm` retries only when recursive. */
const RM_RETRIES = { force: true, recursive: true, maxRetries: 5, retryDelay: 100 } as const;

/** Takes Elvaria's AGENTS.override.md out of the plot once the session is over or never started; a territory's stays. */
export async function removeRunFiles(plot: string): Promise<void> {
  const file = path.join(plot, CONTEXT_FILE);
  const text = await existing(file);
  if (text !== undefined && isElvariaContext(text)) await rm(file, RM_RETRIES);
}
