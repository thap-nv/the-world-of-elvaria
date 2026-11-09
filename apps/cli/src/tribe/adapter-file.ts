// Loading an owner adapter file (implementation-plan §3.14, ADR 0021): `<kingdom>/adapters/<name>.mjs` exports
// createAdapter(kit). Only this composition root imports it; runner-core builds the kit and checks what comes back,
// so a broken file is a list of reasons, never a crash in the middle of a tick. The file runs with the owner's
// rights, like the CLI it drives; it still gets only the minimal env and its sessions keep the core's tool policy.
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { ADAPTER_FILE_PATTERN, err } from '@elvaria/domain';
import type { Result, Tribe } from '@elvaria/domain';
import { hookCommand } from '@elvaria/hooks';
import { adapterKitOf, adapterOfModule } from '@elvaria/runner-core';
import type { AgentRunner } from '@elvaria/runner-core';

import { launchOf } from '../process/launch.ts';
import { minimalEnv } from '../process/minimal-env.ts';
import type { CliIo } from '../io.ts';

/** Whether the tribe's adapter is an owner file rather than a package of this repo. */
export const isAdapterFile = (adapter: string): boolean => ADAPTER_FILE_PATTERN.test(adapter);

/** Where the tribe's adapter file is: kingdom.json names it with `/`, inside the kingdom. */
export const adapterFilePath = (root: string, adapter: string): string =>
  path.join(root, ...adapter.split('/'));

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

async function isFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

/**
 * The runner the tribe's adapter file builds, or why there is none. `toolPath` is the CLI the owner just named
 * (`elvaria doctor --tool`); without it the kit carries the pinned one.
 */
export async function loadAdapterFile(
  root: string,
  tribe: Tribe,
  io: CliIo,
  toolPath?: string,
): Promise<Result<AgentRunner, readonly string[]>> {
  const file = adapterFilePath(root, tribe.adapter);
  if (!(await isFile(file))) return err([`no file at ${file}`]);
  let module: unknown;
  try {
    module = await import(pathToFileURL(file).href);
  } catch (error) {
    return err([`${file}: ${errorText(error)}`]);
  }
  const kit = adapterKitOf({
    tribe,
    kingdom: root,
    env: minimalEnv(io.env),
    platform: io.platform,
    node_path: io.nodePath,
    ...(toolPath === undefined ? {} : { tool_path: toolPath }),
    launchOf: (program) => launchOf(program, io.nodePath),
    hookCommand,
  });
  return adapterOfModule(module, kit);
}
