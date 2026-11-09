// A kingdom for the script tier's specs (implementation-plan §3.12, P1-17): the bench, plus the catalog files a
// kingdom gets at init (registry/scripts/), plots that already hold the files a script reads, and readers of what
// the Steward wrote. The real link-check and run-check of packages/registry-default run in it.
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import type { Quest } from '@elvaria/domain';

import { folderPlots } from '../plots.ts';
import { bench, questPayload } from './kingdom.ts';
import type { Bench } from './kingdom.ts';
import type { Plots, ResolvedCheck, Steward, StewardDeps } from '../types.ts';

const CATALOG = path.join(import.meta.dirname, '..', '..', '..', 'registry-default', 'scripts');

/** The catalog files a kingdom gets at init, which the bench leaves out. */
export async function withCatalog(root: string): Promise<void> {
  await mkdir(path.join(root, 'registry', 'scripts'), { recursive: true });
  for (const name of ['common', 'link-check', 'run-check'])
    await copyFile(path.join(CATALOG, `${name}.mjs`), path.join(root, 'registry', 'scripts', `${name}.mjs`));
}

/** A stand-in for a catalog entry: the script's whole body. */
export const fakeScript = (root: string, id: string, body: string) =>
  writeFile(path.join(root, 'registry', 'scripts', `${id}.mjs`), body, 'utf8');

/** folderPlots whose plot already holds the files a script reads, and the territory's resolved checks. */
export function plotsWith(
  root: string,
  files: Readonly<Record<string, string>>,
  checks: readonly ResolvedCheck[] = [],
): Plots {
  const base = folderPlots(root);
  return {
    ...base,
    prepare: async (quest, territory) => {
      const prepared = await base.prepare(quest, territory);
      for (const [file, text] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(prepared.cwd, file)), { recursive: true });
        await writeFile(path.join(prepared.cwd, file), text, 'utf8');
      }
      return prepared;
    },
    scriptChecks: () => Promise.resolve(checks),
  };
}

export const scriptQuest = (title: string, script: Record<string, unknown>, kind = 'batch') =>
  questPayload(title, { kind, tier: 'script', class_required: undefined, territory: 'handbook', script });

export const LINKS = { id: 'link-check', params: { globs: ['**/*.md'] } };
export const DOCS = { 'README.md': 'See [the guide](docs/guide.md).\n', 'docs/guide.md': '# Guide\n' };
/** What the composition root hands the Steward: on Windows a child node needs SystemRoot to start. */
export const ENV: Readonly<Record<string, string>> = {
  PATH: process.env.PATH ?? '',
  ...(process.env.SystemRoot === undefined ? {} : { SystemRoot: process.env.SystemRoot }),
};

export interface ScriptSetup {
  readonly files?: Readonly<Record<string, string>>;
  readonly checks?: readonly ResolvedCheck[];
  readonly deps?: Partial<StewardDeps>;
}

/** One spec's kingdom and Steward, and the way to end both. */
export interface ScriptKingdom {
  setup(options?: ScriptSetup): Promise<Bench>;
  tick(): Promise<void>;
  /** The tick that starts a script, the script to its end outside the tick (P1-25), the tick that judges it. */
  run(): Promise<void>;
  /** A new Steward on the same kingdom, as after a stop. */
  restart(options?: ScriptSetup): Promise<void>;
  stop(): Promise<void>;
  remove(): Promise<void>;
}

export function scriptKingdom(): ScriptKingdom {
  let made: Bench | undefined;
  let steward: Steward | undefined;
  const begin = async ({ files = {}, checks = [], deps = {} }: ScriptSetup, at: Bench) => {
    steward = at.steward({ plots: plotsWith(at.root, files, checks), env: ENV, ...deps });
    await steward.start({ loop: false });
  };
  return {
    setup: async (options = {}) => {
      made = await bench();
      await withCatalog(made.root);
      await begin(options, made);
      return made;
    },
    tick: async () => {
      if (steward === undefined) throw new Error('fixture: no steward');
      await steward.tick();
    },
    run: async () => {
      if (steward === undefined) throw new Error('fixture: no steward');
      await steward.tick();
      await steward.idle();
      await steward.tick();
    },
    restart: async (options = {}) => {
      if (made === undefined) throw new Error('fixture: no kingdom');
      await begin(options, made);
    },
    stop: async () => steward?.stop(),
    remove: async () => {
      await steward?.stop();
      await made?.remove();
      steward = undefined;
      made = undefined;
    },
  };
}

export const readJson = async (root: string, file: string): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(path.join(root, file), 'utf8')) as Record<string, unknown>;

export async function lines(at: Bench): Promise<{ type: string; data: Record<string, unknown> }[]> {
  const text = await readFile(path.join(at.root, 'events', '2026-11-07.jsonl'), 'utf8');
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as { type: string; data: Record<string, unknown> });
}

/** The data of the last `quest.infirmary` line: its reason, trip and detail beside the quest's view. */
export const infirmaryLine = async (at: Bench): Promise<Record<string, unknown> | undefined> =>
  (await lines(at)).findLast(({ type }) => type === 'quest.infirmary')?.data;

export const infirmaryReason = async (at: Bench): Promise<unknown> => (await infirmaryLine(at))?.reason;

/** The quest as the files held it after its script ran, before the verdict: working, its run open. */
export async function backToWorking(at: Bench, done: Quest): Promise<void> {
  const { units: _units, ...before } = done;
  const entry = { ...done.attempt_log[0], outcome: undefined, ended_at: undefined };
  const working: Record<string, unknown> = {
    ...before,
    status: 'working',
    checks_run: [],
    attempt_log: [entry],
  };
  await at.store.quests.write(working as never);
}
