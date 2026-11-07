// Who a session is and where its lines go (implementation-plan §3.6): the context every adapter hands the hook
// (env `ELVARIA_*` and policy.json) and uses for the lines the runner writes itself. The Steward sets the env;
// the request says who the character is, so the character, its role and its model come from the request.
import type { SpawnRole } from './roles.ts';
import type { SpawnRequest } from './types.ts';

/** The env names the hook reads (packages/hooks/src/context.ts). */
export const CONTEXT_ENV = {
  kingdom: 'ELVARIA_KINGDOM',
  quest: 'ELVARIA_QUEST',
  attempt: 'ELVARIA_ATTEMPT',
  character: 'ELVARIA_CHARACTER',
  role: 'ELVARIA_ROLE',
  model: 'ELVARIA_MODEL',
  tz: 'ELVARIA_TZ',
} as const;

export interface RunContext {
  /** Native path of the kingdom; without it nothing is written. */
  readonly kingdom?: string;
  readonly quest?: string;
  readonly attempt?: number;
  readonly character: string;
  readonly role: SpawnRole;
  /** The model the CLI is told to use: Claude's SessionStart payload under `-p` has none (P1-08). */
  readonly model: string;
  /** `kingdom.tz`: the day file of a line follows it (§2.1). */
  readonly tz?: string;
}

const ATTEMPT = /^[1-9][0-9]{0,5}$/;

const set = (value: string | undefined): string | undefined => (value === '' ? undefined : value);

export function runContextOf(req: SpawnRequest): RunContext {
  const env = req.env;
  const attempt = set(env[CONTEXT_ENV.attempt]);
  const kingdom = set(env[CONTEXT_ENV.kingdom]);
  const quest = req.quest?.id ?? set(env[CONTEXT_ENV.quest]);
  const tz = set(env[CONTEXT_ENV.tz]);
  return {
    ...(kingdom === undefined ? {} : { kingdom }),
    ...(quest === undefined ? {} : { quest }),
    ...(attempt !== undefined && ATTEMPT.test(attempt) ? { attempt: Number(attempt) } : {}),
    character: req.character.id,
    role: req.role,
    model: req.character.model,
    ...(tz === undefined ? {} : { tz }),
  };
}

/** The context as env `ELVARIA_*`, for the child and for a CLI's own settings env (Claude `settings.env`). */
export function contextEnv(ctx: RunContext): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [field, name] of Object.entries(CONTEXT_ENV)) {
    const value = ctx[field as keyof RunContext];
    if (value !== undefined) env[name] = String(value);
  }
  return env;
}
