// `<run_dir>/agents.json` for `--agents` (implementation-plan §3.7, §3.12, ADR 0017): exactly one apprentice, with
// the character's tools minus Agent (so it starts no other) and a hard `maxTurns`. Claude Code 2.1.318 honours
// tools, model and maxTurns of an agent defined this way under `-p` (spike P1-02); the hook refuses every other
// subagent_type and the settings deny the built-in agents.
//
// The character picks the apprentice's model for each call (the Agent tool's `model`, which overrides the one
// defined here), up to its own (decided after P1-09): the file keeps the cheapest, so a call that names none costs
// no more, and the policy file lists the models allowed, which the hook enforces.
import type { ToolPolicy } from '@elvaria/runner-core';

export const APPRENTICE = 'apprentice';

/**
 * The models the Agent tool's `model` takes in Claude Code 2.1.318, weakest first. Fable comes above Opus: it is the
 * account's strongest model, with a weekly cap of its own (spike P1-02, `/usage`). The order is this adapter's data,
 * not the core's (§3.12, ADR 0021).
 */
export const APPRENTICE_MODELS = ['haiku', 'sonnet', 'opus', 'fable'] as const;

export interface ApprenticeConfig {
  /** `kingdom.breakers.subagent_max_turns`: the one apprentice breaker the CLI enforces. */
  readonly max_turns: number;
  /** `kingdom.breakers.subagent_max_minutes`: measured from the stream, an overrun is logged (§3.12). */
  readonly max_minutes: number;
  /** The models an apprentice may run on, weakest first: APPRENTICE_MODELS unless given. */
  readonly models?: readonly string[];
}

export interface AgentDefinition {
  readonly description: string;
  readonly prompt: string;
  readonly tools: readonly string[];
  readonly model: string;
  readonly maxTurns: number;
  /** The apprentice reads the territory's CLAUDE.md, as its master does. */
  readonly omitClaudeMd: false;
}

/**
 * The models an apprentice of a character on `model` may run on: the ladder up to the character's own, never
 * stronger than its master (§3.12). A full slug names its alias as one of its words (`claude-opus-5-5-low` → opus);
 * a model that names none gets the cheapest alone.
 */
export function apprenticeModelsOf(model: string, ladder: readonly string[] = APPRENTICE_MODELS): string[] {
  const words = new Set(model.toLowerCase().split(/[^a-z0-9]+/));
  const own = ladder.findLastIndex((alias) => words.has(alias));
  return ladder.slice(0, Math.max(own, 0) + 1);
}

const DESCRIPTION =
  'Your apprentice: a small, self-contained lookup or check (read files, run a check). It has few turns and starts no agent.';

const PROMPT = [
  'You are the apprentice of an Elvaria character. Do only the small task you are given, with the tools you have.',
  'Report what you found in a few lines. You cannot start another agent; if the task is larger than a few turns,',
  'stop and say so, so your master can turn it into a child quest.',
].join(' ');

const modelsNote = (allowed: readonly string[]): string =>
  allowed.length === 1
    ? ` It runs on ${allowed.join('')}.`
    : ` It runs on ${allowed[0] ?? ''} unless you name another \`model\`: ${allowed.slice(1).join(', ')} (no stronger one).`;

/** The agents file of a session, or undefined when the character may start no apprentice. */
export function agentsOf(
  policy: ToolPolicy,
  config: ApprenticeConfig,
  allowed: readonly string[],
): Readonly<Record<string, AgentDefinition>> | undefined {
  if (policy.apprentice === null) return undefined;
  return {
    [APPRENTICE]: {
      description: `${DESCRIPTION}${modelsNote(allowed)}`,
      prompt: PROMPT,
      tools: policy.apprentice.tools,
      model: allowed[0] ?? APPRENTICE_MODELS[0],
      maxTurns: config.max_turns,
      omitClaudeMd: false,
    },
  };
}
