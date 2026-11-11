// What one hook call knows about its session (implementation-plan §3.6): env `ELVARIA_*`, which the runner
// sets when it spawns the CLI (Claude: process env and settings.env), or the run's policy file for a CLI that
// does not hand its env to hooks. The hook never reads kingdom.json: the zone comes with the context.
import path from 'node:path';

import { QUEST_ID_SHAPE } from '@elvaria/eventlog';

import { brokenLaws, compileLaws } from './laws.ts';
import { readPolicy } from './policy.ts';
import type { CompiledLaws } from './laws.ts';
import type { HookPolicy } from './policy.ts';

export type HookEnv = Readonly<Record<string, string | undefined>>;

export interface HookContext {
  /** Native path of the kingdom folder; without it nothing is written. */
  readonly kingdom: string | undefined;
  readonly quest: string | undefined;
  readonly attempt: number | undefined;
  /** Character id: the actor of every line. */
  readonly character: string | undefined;
  /** SpawnRequest.role: `assignee`, `verifier`, `chancellor`, `monk`, `bard`. */
  readonly role: string | undefined;
  /** The model of the session, for `agent.session.start` when the CLI's payload does not say. */
  readonly model: string | undefined;
  /** IANA zone the lines are stamped in (`kingdom.tz`); undefined: the machine's zone. */
  readonly tz: string | undefined;
  /** `.runs/<quest>-<n>/`: where the hook keeps what it must remember between calls. */
  readonly runDir: string | undefined;
  readonly laws: CompiledLaws;
  /**
   * Values of the session's secrets (policy `secrets` names, values from this process's env): masked exactly,
   * before the patterns (§3.9). Never written anywhere.
   */
  readonly known: readonly string[];
  /** The class's tools in Claude Code names (policy `tools`); undefined: the CLI enforces them itself. */
  readonly tools: readonly string[] | undefined;
  /** Models the apprentice may be asked to run on (policy `apprentice_models`); undefined: not checked. */
  readonly apprenticeModels: readonly string[] | undefined;
  /** Commands a class without a shell may still run to search (policy `search_commands`, P1-53); empty: none. */
  readonly searchCommands: readonly string[];
  /** Context that was missing or malformed, for stderr; the call goes on with what is there. */
  readonly problems: readonly string[];
}

/** SLUG_PATTERN of the domain, which the hook may not load (§1.4); a mismatch would make readers drop lines. */
const CHARACTER_SHAPE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
const ATTEMPT_SHAPE = /^[1-9][0-9]{0,5}$/;
/**
 * The shape of an IANA zone id (`UTC`, `Asia/Ho_Chi_Minh`, `Etc/GMT+7`). Asking Intl whether the zone exists
 * would cost ~11 ms per call (stamp.ts, localTs); kingdom.tz was checked when kingdom.json was written.
 */
const ZONE_SHAPE = /^[A-Za-z][\w+-]*(?:\/[\w+-]+)*$/;

/** The value after `flag` in argv (or of `flag=<value>`). */
export function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index !== -1) return argv[index + 1];
  return argv.find((arg) => arg.startsWith(`${flag}=`))?.slice(flag.length + 1);
}

/** The value after `--policy` (or of `--policy=<file>`). */
export const policyArgument = (argv: readonly string[]): string | undefined => flagValue(argv, '--policy');

/** Reads one field: env first, then the policy file; an empty env value counts as unset. */
function fieldReader(env: HookEnv, problems: string[]) {
  const value = (name: string, fromPolicy: string | number | undefined): string | undefined => {
    const set = env[name];
    if (set !== undefined && set !== '') return set;
    return fromPolicy === undefined ? undefined : String(fromPolicy);
  };
  const shaped = (name: string, fromPolicy: string | number | undefined, shape: RegExp) => {
    const found = value(name, fromPolicy);
    if (found === undefined || shape.test(found)) return found;
    problems.push(`${name} ${JSON.stringify(found)} is malformed; left out`);
    return undefined;
  };
  const zone = (fromPolicy: string | undefined): string | undefined => {
    const found = value('ELVARIA_TZ', fromPolicy);
    if (found !== undefined && ZONE_SHAPE.test(found)) return found;
    // A line stamped in the wrong zone may land in the neighbouring day file (§2.1), so say it.
    problems.push(
      `ELVARIA_TZ ${JSON.stringify(found ?? '')} is not an IANA zone; stamping in the machine's zone`,
    );
    return undefined;
  };
  return { value, shaped, zone };
}

/** `.runs/<quest>-<n>/` (§2.2): the folder of the policy file, else built from the context. */
function runDirOf(
  policyFile: string | undefined,
  fields: Pick<HookContext, 'kingdom' | 'quest' | 'attempt'>,
) {
  if (policyFile !== undefined) return path.dirname(path.resolve(policyFile));
  const { kingdom, quest, attempt } = fields;
  if (kingdom === undefined || quest === undefined || attempt === undefined) return undefined;
  return path.join(kingdom, '.runs', `${quest}-${attempt}`);
}

/**
 * The values of the secrets the policy names. The CLI hands its env to the hook (Claude, Antigravity), so a
 * name without a value means that chain broke: said on stderr, and only the patterns mask that secret.
 */
function knownSecrets(env: HookEnv, names: readonly string[], problems: string[]): string[] {
  return names.flatMap((name) => {
    const value = env[name];
    if (value !== undefined && value !== '') return [value];
    problems.push(`secret ${name} is not in the hook's env; only the patterns mask it`);
    return [];
  });
}

/** The context of this call. Never throws: what is missing is left out and reported in `problems`. */
export function loadContext(env: HookEnv, argv: readonly string[]): HookContext {
  const policyFile = policyArgument(argv);
  const loaded = policyFile === undefined ? undefined : readPolicy(policyFile);
  const policy: Partial<HookPolicy> = loaded?.ok === true ? loaded.policy : {};
  const problems: string[] = loaded?.ok === false ? [loaded.problem] : [];
  const read = fieldReader(env, problems);
  const attempt = read.shaped('ELVARIA_ATTEMPT', policy.attempt, ATTEMPT_SHAPE);
  const fields = {
    kingdom: read.value('ELVARIA_KINGDOM', policy.kingdom),
    quest: read.shaped('ELVARIA_QUEST', policy.quest, QUEST_ID_SHAPE),
    attempt: attempt === undefined ? undefined : Number(attempt),
  };
  return {
    ...fields,
    character: read.shaped('ELVARIA_CHARACTER', policy.character, CHARACTER_SHAPE),
    role: read.value('ELVARIA_ROLE', policy.role),
    model: read.value('ELVARIA_MODEL', policy.model),
    tz: read.zone(policy.tz),
    runDir: runDirOf(policyFile, fields),
    // A policy that was asked for and cannot be read leaves the laws unknown: block rather than guess.
    laws:
      loaded?.ok === false
        ? brokenLaws(loaded.problem)
        : compileLaws(policy.laws ?? {}, {
            cliProtected: policy.cli_protected_paths,
            patchFile: policy.patch_file,
          }),
    known: knownSecrets(env, policy.secrets ?? [], problems),
    tools: policy.tools,
    apprenticeModels: policy.apprentice_models,
    searchCommands: policy.search_commands ?? [],
    problems,
  };
}
