// The files a session keeps in the plot for its life only (P1-23): Codex's AGENTS.override.md, agy's hooks.json,
// shim and GEMINI.md, which those CLIs read from the workspace and nowhere a run's folder could hold. Elvaria never
// edits a territory's file of the same name, and takes its own out once the session is over or never started, so the
// checks the Steward runs next, and any other tribe's session, see the plot as the territory has it. One copy for
// every adapter (AH-09).
import { appendFile, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { NOTE_PREFIX, STDERR_FILE } from '../runner/run-output.ts';
import type { RunningSession, SpawnRequest } from '../runner/types.ts';

/** Where the session runs and where its run folder is. */
type Places = Pick<SpawnRequest, 'cwd' | 'run_dir'>;

/** The file's text, or undefined when there is none. */
export async function existingText(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

/**
 * Writes `text` unless the plot holds the territory's own file there (`ours` says whose an old text is); `refusal`
 * says why the tribe cannot run then.
 */
export async function writeOwnFile(
  file: string,
  text: string,
  ours: (old: string) => boolean,
  refusal: string,
): Promise<void> {
  const old = await existingText(file);
  if (old !== undefined && !ours(old)) throw new Error(`${file} belongs to the territory: ${refusal}`);
  await writeFile(file, text, 'utf8');
}

/** A Windows file can stay busy a moment after the tree that held it died; `rm` retries only when recursive. */
const RM_RETRIES = { force: true, recursive: true, maxRetries: 5, retryDelay: 100 } as const;

/** Takes the file out when it is Elvaria's; a territory's stays. */
export async function removeOwnFile(file: string, ours: (text: string) => boolean): Promise<void> {
  const text = await existingText(file);
  if (text !== undefined && ours(text)) await rm(file, RM_RETRIES);
}

/** How an adapter takes its files out of a plot, and the note when they will not go: `the hook files stay`. */
export interface PlotFiles {
  readonly remove: (plot: string) => Promise<void>;
  readonly stay: string;
}

/**
 * The plot without the session's files. One that will not go (a Windows lock past the retries) costs the session
 * nothing: the run folder's stderr.log says so, for the owner whose check then fails on it.
 */
async function clearPlot(req: Places, files: PlotFiles): Promise<void> {
  try {
    await files.remove(req.cwd);
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    const note = `${NOTE_PREFIX}${files.stay} in the plot: ${why}\n`;
    await appendFile(path.join(req.run_dir, STDERR_FILE), note, 'utf8').catch(() => undefined);
  }
}

/** The session, whose end (wait, kill) settles only once its files left the plot. */
function clearingOnEnd(session: RunningSession, req: Places, files: PlotFiles): RunningSession {
  const result = session.wait().then(async (end) => {
    await clearPlot(req, files);
    return end;
  });
  return {
    ...session,
    wait: () => result,
    kill: async (reason) => {
      await session.kill(reason);
      await result;
    },
  };
}

/** Starts a session that writes `files` into the plot; they go when it ends, and when it never starts. */
export async function withPlotFiles(
  req: Places,
  files: PlotFiles,
  start: () => Promise<RunningSession>,
): Promise<RunningSession> {
  try {
    return clearingOnEnd(await start(), req, files);
  } catch (error) {
    // A session that never started leaves no file behind either.
    await clearPlot(req, files);
    throw error;
  }
}
