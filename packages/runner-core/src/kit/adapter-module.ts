// What an owner adapter file must give back (implementation-plan §3.14, ADR 0021): a module exporting
// `createAdapter(kit)` that returns an AgentRunner for the kit's tribe. `apps/cli` imports the file; this checks
// the module and its runner before the Steward, doctor or the conformance suite touch it, so a broken file is
// reported as one sentence per problem instead of a crash in the middle of a tick.
import { ADAPTER_CAPABILITIES, SHELL_PLATFORMS, err, ok } from '@elvaria/domain';
import type { Result } from '@elvaria/domain';

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

/** What is wrong with `capabilities.search` (P1-53): optional like `shell`; when given, true or false. */
export const searchProblems = (search: unknown): string[] =>
  search === undefined || typeof search === 'boolean' ? [] : ['capability search is not true or false'];

function capabilityProblems(capabilities: unknown): string[] {
  if (!isRecord(capabilities)) return ['capabilities is not an object'];
  const flags = ADAPTER_CAPABILITIES.filter((name) => typeof capabilities[name] !== 'boolean').map(
    (name) => `capability ${name} is not true or false`,
  );
  const auth = Array.isArray(capabilities.auth) ? [] : ['capability auth is not a list'];
  return [...flags, ...auth, ...shellProblems(capabilities.shell), ...searchProblems(capabilities.search)];
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
  return problems.length === 0 ? ok(runner as AgentRunner) : err(problems);
}
