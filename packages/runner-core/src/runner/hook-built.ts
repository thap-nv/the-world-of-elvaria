// Elvaria's hook must be built before any session: without packages/hooks/dist every hook call fails, and the runner
// judges each session broken. Every tribe's doctor says so as an error, in one sentence ((a) of fix/busy-machine,
// settled in fix/held-tribe-sessions): Codex already did, Claude Code only warned, agy and adapter files said nothing.
// The hook is the core's, not the CLI's, so an adapter file gets the check without a word in it (adapter-module.ts).
import { stat } from 'node:fs/promises';

import type { ToolInfo } from './types.ts';
import type { DoctorNote } from './doctor-notes.ts';

export const hookMissing = (file: string): string =>
  `the Elvaria hook is not built: ${file} is missing (run pnpm --filter @elvaria/hooks build)`;

/** The hook's script among `hookCommand()`'s arguments: the first that is not a Node flag; undefined when none. */
export const hookScriptOf = (hook: { readonly args: readonly string[] }): string | undefined =>
  hook.args.find((arg) => !arg.startsWith('-'));

/** Why no session could run the hook at `script`: the file is missing. Undefined when it is there, or none is named. */
export async function hookProblem(script: string | undefined): Promise<string | undefined> {
  if (script === undefined) return undefined;
  const built = await stat(script).then(
    (info) => info.isFile(),
    () => false,
  );
  return built ? undefined : hookMissing(script);
}

/** `info` with the hook's problem: no session can run, so `auth_ok` is false whatever the CLI said of its sign-in. */
export const withHookProblem = (info: ToolInfo, problem: DoctorNote | undefined): ToolInfo =>
  problem === undefined
    ? info
    : {
        ...info,
        auth_ok: false,
        notes: [...(info.notes ?? []), problem],
      };
