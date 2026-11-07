// `<run_dir>/agents.json` for `--agents` (implementation-plan §3.7, §3.12, ADR 0017): exactly one apprentice, with
// the character's tools minus Agent (so it starts no other) and a hard `maxTurns`. Claude Code 2.1.318 honours
// tools, model and maxTurns of an agent defined this way under `-p` (spike P1-02); the hook refuses every other
// subagent_type and the settings deny the built-in agents.
import type { ToolPolicy } from '@elvaria/runner-core';

export const APPRENTICE = 'apprentice';

export interface ApprenticeConfig {
  /** A cheap model (`haiku`, or a full slug): the apprentice does small lookups. */
  readonly model: string;
  /** `kingdom.breakers.subagent_max_turns`: the one apprentice breaker the CLI enforces. */
  readonly max_turns: number;
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

const DESCRIPTION =
  'Your apprentice: a small, self-contained lookup or check (read files, run a check). It has few turns and starts no agent.';

const PROMPT = [
  'You are the apprentice of an Elvaria character. Do only the small task you are given, with the tools you have.',
  'Report what you found in a few lines. You cannot start another agent; if the task is larger than a few turns,',
  'stop and say so, so your master can turn it into a child quest.',
].join(' ');

/** The agents file of a session, or undefined when the character may start no apprentice. */
export function agentsOf(
  policy: ToolPolicy,
  config: ApprenticeConfig,
): Readonly<Record<string, AgentDefinition>> | undefined {
  if (policy.apprentice === null) return undefined;
  return {
    [APPRENTICE]: {
      description: DESCRIPTION,
      prompt: PROMPT,
      tools: policy.apprentice.tools,
      model: config.model,
      maxTurns: config.max_turns,
      omitClaudeMd: false,
    },
  };
}
