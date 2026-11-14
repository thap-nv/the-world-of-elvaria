// What the Steward asks of each tribe's CLI before its plan (A1b of the lessons of 2026-11-13): the CLI the tribe's
// runner starts, the path pinned when `elvaria run` began (the runners are built then), and what it says with
// `--version`, no model call. A file gone is said as such (a VS Code update removed Codex's pinned folder, 2026-11-14):
// the Steward holds the tribe until `tribe check` pins the CLI now installed and the Steward restarts.
import { stat } from 'node:fs/promises';

import { versionHoldsOf } from '@elvaria/domain';
import type { Kingdom, ToolFound, TribeHold, TribeId } from '@elvaria/domain';
import type { AgentRunner } from '@elvaria/runner-core';
import { fromPortable, toPortable } from '@elvaria/store';

import { toolVersion } from '../doctor/tool-version.ts';
import { launchOf } from '../process/launch.ts';
import { isAdapterFile } from '../tribe/adapter-file.ts';
import type { CliIo } from '../io.ts';

const isFile = (file: string): Promise<boolean> =>
  stat(file).then(
    (info) => info.isFile(),
    () => false,
  );

/** An adapter file knows its own CLI (P1-19): its runner's doctor() names it; an empty or failed answer tells nothing. */
async function adapterFileFound(runner: AgentRunner | undefined, io: CliIo): Promise<ToolFound | undefined> {
  const info = await runner?.doctor().catch(() => undefined);
  return info === undefined || info.version === '' || info.path === ''
    ? undefined
    : { path: toPortable(info.path, io.platform), version: info.version };
}

/**
 * The tribes held now, asked as the Steward asks before its plan (fix/held-tribe-sessions): a command run by hand that
 * opens a session outside planTick (`elvaria say`, `elvaria triage`) has no Steward's book to read, so it asks the
 * same CLIs once: the enabled tribes with a pinned CLI and a runner, as tribe-versions.ts of the Steward does.
 */
export async function tribeHoldsOf(
  kingdom: Kingdom,
  runners: Readonly<Partial<Record<TribeId, AgentRunner>>>,
  io: CliIo,
): Promise<TribeHold[]> {
  const ask = toolFoundOf(kingdom, runners, io);
  const tribes = kingdom.tribes.filter(
    (tribe) => tribe.enabled && tribe.tool !== undefined && runners[tribe.id] !== undefined,
  );
  const answers = await Promise.all(tribes.map(async ({ id }) => [id, await ask(id)] as const));
  const found: Partial<Record<TribeId, ToolFound>> = {};
  for (const [id, answer] of answers) if (answer !== undefined) found[id] = answer;
  return versionHoldsOf(kingdom.tribes, found);
}

/** The Steward's `toolFound` port (StewardDeps), over the tribes and runners `elvaria run` started with. */
export function toolFoundOf(
  kingdom: Kingdom,
  runners: Readonly<Partial<Record<TribeId, AgentRunner>>>,
  io: CliIo,
): (tribe: TribeId) => Promise<ToolFound | undefined> {
  const tribes = new Map(kingdom.tribes.map((tribe) => [tribe.id, tribe]));
  return async (id) => {
    const tribe = tribes.get(id);
    if (tribe?.tool === undefined) return undefined;
    if (isAdapterFile(tribe.adapter)) return adapterFileFound(runners[id], io);
    const { path } = tribe.tool;
    const file = fromPortable(path, io.platform);
    if (!(await isFile(file))) return { path, version: undefined };
    const launch = await launchOf(file, io.nodePath);
    const version = launch === undefined ? undefined : await toolVersion(launch, io.env);
    return version === undefined ? undefined : { path, version };
  };
}
