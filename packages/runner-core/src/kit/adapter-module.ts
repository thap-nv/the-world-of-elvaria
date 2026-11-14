// What an owner adapter file must give back (implementation-plan §3.14, ADR 0021): a module exporting
// `createAdapter(kit)` that returns an AgentRunner for the kit's tribe. `apps/cli` imports the file; this checks
// the module and its runner before the Steward, doctor or the conformance suite touch it, so a broken file is
// reported as one sentence per problem instead of a crash in the middle of a tick. Its doctor() also says whether
// Elvaria's hook is built, as every built-in adapter's does (fix/held-tribe-sessions): the file need not know.
import { ADAPTER_CAPABILITIES, SHELL_PLATFORMS, err, modelsProblems, ok } from '@elvaria/domain';
import type { Result } from '@elvaria/domain';

import { hookScriptOf, withHookProblem } from '../runner/hook-built.ts';
import { hookNote } from '../runner/doctor-notes.ts';
import { checkedDoctorNotes } from './doctor-notes.ts';
import type { AgentRunner } from '../runner/types.ts';
import type { AdapterKit } from './kit.ts';

/** The export an adapter file must have. */
export const ADAPTER_FACTORY = 'createAdapter';

export type AdapterFactory = (kit: AdapterKit) => AgentRunner | Promise<AgentRunner>;

const RUNNER_CALLS = ['spawn', 'probe', 'doctor'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * What is wrong with `capabilities.shell` (P1-40): optional, so an adapter file written before it still passes;
 * when given, a shell name for each OS it names, among SHELL_PLATFORMS.
 */
export function shellProblems(shell: unknown): string[] {
  if (shell === undefined) return [];
  if (!isRecord(shell) || Array.isArray(shell))
    return ['capability shell is not an object of OS to shell name'];
  const known: readonly string[] = SHELL_PLATFORMS;
  return Object.entries(shell).flatMap(([os, name]) => [
    ...(known.includes(os) ? [] : [`capability shell names ${os}, not one of ${known.join(', ')}`]),
    ...(typeof name === 'string' && name.trim() !== '' ? [] : [`capability shell.${os} is not a shell name`]),
  ]);
}

/**
 * What is wrong with `capabilities.prompt_max_chars` (fix/verifier-prompt-limit): optional like `shell`, by OS; when
 * given, a positive whole number of characters for each OS it names.
 */
export function promptMaxProblems(limits: unknown): string[] {
  if (limits === undefined) return [];
  if (!isRecord(limits) || Array.isArray(limits))
    return ['capability prompt_max_chars is not an object of OS to a number of characters'];
  const known: readonly string[] = SHELL_PLATFORMS;
  return Object.entries(limits).flatMap(([os, max]) => [
    ...(known.includes(os)
      ? []
      : [`capability prompt_max_chars names ${os}, not one of ${known.join(', ')}`]),
    ...(Number.isInteger(max) && Number(max) > 0
      ? []
      : [`capability prompt_max_chars.${os} is not a positive whole number`]),
  ]);
}

/** What is wrong with `capabilities.search` (P1-53): optional like `shell`; when given, true or false. */
export const searchProblems = (search: unknown): string[] =>
  search === undefined || typeof search === 'boolean' ? [] : ['capability search is not true or false'];

/** What is wrong with `capabilities.read` (PS-23): optional like `search`; when given, true or false. */
export const readProblems = (read: unknown): string[] =>
  read === undefined || typeof read === 'boolean' ? [] : ['capability read is not true or false'];

function capabilityProblems(capabilities: unknown): string[] {
  if (!isRecord(capabilities)) return ['capabilities is not an object'];
  const flags = ADAPTER_CAPABILITIES.filter((name) => typeof capabilities[name] !== 'boolean').map(
    (name) => `capability ${name} is not true or false`,
  );
  const auth = Array.isArray(capabilities.auth) ? [] : ['capability auth is not a list'];
  return [
    ...flags,
    ...auth,
    ...shellProblems(capabilities.shell),
    ...promptMaxProblems(capabilities.prompt_max_chars),
    ...searchProblems(capabilities.search),
    ...readProblems(capabilities.read),
    // PS-23: the models it serves and their families, optional; an older adapter file without them still loads.
    ...modelsProblems(capabilities.models),
  ];
}

/** What is wrong with the runner a file built for `kit`'s tribe; empty when it keeps the AgentRunner shape. */
export function runnerProblems(value: unknown, kit: Pick<AdapterKit, 'tribe'>): string[] {
  if (!isRecord(value)) return [`${ADAPTER_FACTORY}(kit) did not return an object`];
  const { id, adapter } = kit.tribe;
  return [
    ...(value.tribe === id ? [] : [`runner.tribe is ${String(value.tribe)}, not ${id} (kit.tribe.id)`]),
    ...(value.adapter === adapter
      ? []
      : [`runner.adapter is ${String(value.adapter)}, not ${adapter} (kit.tribe.adapter)`]),
    ...capabilityProblems(value.capabilities),
    ...RUNNER_CALLS.filter((call) => typeof value[call] !== 'function').map(
      (call) => `runner.${call} is not a function`,
    ),
  ];
}

/** The runner an imported adapter module builds with `kit`, or why there is none. */
export async function adapterOfModule(
  module: unknown,
  kit: AdapterKit,
): Promise<Result<AgentRunner, readonly string[]>> {
  const factory = isRecord(module) ? module[ADAPTER_FACTORY] : undefined;
  if (typeof factory !== 'function') return err([`the file does not export a function ${ADAPTER_FACTORY}`]);
  let runner: unknown;
  try {
    runner = await (factory as AdapterFactory)(kit);
  } catch (error) {
    return err([`${ADAPTER_FACTORY}(kit) threw: ${errorText(error)}`]);
  }
  const problems = runnerProblems(runner, kit);
  return problems.length === 0 ? ok(withHookCheck(runner as AgentRunner, kit)) : err(problems);
}

/**
 * The runner, its doctor() an error when the hook the kit names is not built ((a) of fix/busy-machine): without it
 * every session of the tribe breaks, whatever the CLI says of its sign-in. A kit whose hook names no script (the
 * specs') leaves the runner as it is.
 */
function withHookCheck(runner: AgentRunner, kit: Pick<AdapterKit, 'hookCommand'>): AgentRunner {
  const script = hookScriptOf(kit.hookCommand());
  return {
    tribe: runner.tribe,
    adapter: runner.adapter,
    capabilities: runner.capabilities,
    spawn: (req) => runner.spawn(req),
    probe: (options) => runner.probe(options),
    doctor: async () => {
      const info = await runner.doctor();
      const notes = checkedDoctorNotes(info.notes);
      return withHookProblem({ ...info, ...(notes === undefined ? {} : { notes }) }, await hookNote(script));
    },
  };
}
