// The run's policy file, `<run_dir>/policy.json`, passed as `--policy <file>` (implementation-plan §3.6, §3.7).
// The runner writes it next to the CLI settings: the territory laws the hook enforces, and the session context
// for a CLI that does not hand its env to hooks. The hook may not load zod (§1.4), so it checks by hand.
import { readFileSync } from 'node:fs';

import type { LawsInput } from './laws.ts';

export const POLICY_VERSION = 1;

/** policy.json v1. Every context field is optional: env `ELVARIA_*` wins when both are set. */
export interface HookPolicy {
  readonly version: typeof POLICY_VERSION;
  readonly kingdom?: string;
  readonly quest?: string;
  readonly attempt?: number;
  readonly character?: string;
  readonly role?: string;
  /** The model the runner passed (`--model`): Claude's SessionStart payload under `-p` has none. */
  readonly model?: string;
  /** IANA zone of the kingdom (`kingdom.tz`): the day file of every line follows it (§2.1). */
  readonly tz?: string;
  /**
   * Env names of the session's secrets (P1-10, §3.9): the hook reads their values from its own env, which the CLI
   * inherited from the runner, and masks them before the patterns. Never values: this file is on disk.
   */
  readonly secrets?: readonly string[];
  /**
   * The tools of the class in Claude Code names (`ToolPolicy.tools`, P1-10): for a CLI with no `--tools`
   * (Antigravity), the hook refuses a tool the class does not have. Absent: no such check.
   */
  readonly tools?: readonly string[];
  /**
   * The models the character's apprentice may run on (P1-17, §3.12): an Agent call naming another `model` is
   * refused, so an apprentice is never stronger than its master. Absent: no such check.
   */
  readonly apprentice_models?: readonly string[];
  /** `territory.laws`; other law kinds may be present and are not the hook's to enforce. */
  readonly laws?: LawsInput;
}

export type PolicyResult =
  { readonly ok: true; readonly policy: HookPolicy } | { readonly ok: false; readonly problem: string };

const STRING_FIELDS = ['kingdom', 'quest', 'character', 'role', 'model', 'tz'] as const;
const LIST_FIELDS = ['secrets', 'tools', 'apprentice_models'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

function lawsProblem(laws: unknown): string | undefined {
  if (laws === undefined) return undefined;
  if (!isRecord(laws)) return 'laws is not an object';
  for (const key of ['forbidden_paths', 'forbidden_commands']) {
    if (laws[key] !== undefined && !isStringList(laws[key])) return `laws.${key} is not a list of strings`;
  }
  return undefined;
}

function policyProblem(value: Record<string, unknown>): string | undefined {
  if (value.version !== POLICY_VERSION) return `version is ${JSON.stringify(value.version)}, not 1`;
  const wrong = STRING_FIELDS.find((key) => value[key] !== undefined && typeof value[key] !== 'string');
  if (wrong !== undefined) return `${wrong} is not a string`;
  if (value.attempt !== undefined && !(Number.isInteger(value.attempt) && Number(value.attempt) >= 1)) {
    return 'attempt is not an integer >= 1';
  }
  const list = LIST_FIELDS.find((key) => value[key] !== undefined && !isStringList(value[key]));
  if (list !== undefined) return `${list} is not a list of strings`;
  return lawsProblem(value.laws);
}

export function parsePolicy(value: unknown): PolicyResult {
  if (!isRecord(value)) return { ok: false, problem: 'not a JSON object' };
  const problem = policyProblem(value);
  // policyProblem checked every field HookPolicy declares.
  return problem === undefined
    ? { ok: true, policy: value as unknown as HookPolicy }
    : { ok: false, problem };
}

/** Reads and checks a policy file; a problem names the file. */
export function readPolicy(file: string): PolicyResult {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    return {
      ok: false,
      problem: `policy ${file}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const result = parsePolicy(value);
  return result.ok ? result : { ok: false, problem: `policy ${file}: ${result.problem}` };
}
