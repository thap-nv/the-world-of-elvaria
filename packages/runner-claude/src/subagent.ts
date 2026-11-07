// The lines of an apprentice's end (implementation-plan §3.12, ADR 0017): `agent.subagent.end`, with `stopped` when
// the CLI cut it at its maxTurns, and `agent.subagent.overrun` past `subagent_max_minutes`. The minutes are measured
// only: nothing outside the CLI can stop a sub-agent (§9.1 item 15). Both lines go into the parent quest's journal,
// where a revival reads them and the tier report counts them.
import type { RunEventDraft } from '@elvaria/runner-core';

import type { ApprenticeConfig } from './agents.ts';
import type { Observation } from './stream.ts';

const MS_PER_MINUTE = 60_000;

export function subagentEndLines(
  config: Pick<ApprenticeConfig, 'max_minutes'>,
  seen: Extract<Observation, { kind: 'subagent_end' }>,
): RunEventDraft[] {
  const { agent_type: agentType, duration_ms: duration, stopped } = seen;
  const data = {
    agent_type: agentType,
    duration_ms: duration,
    ...(stopped === undefined ? {} : { stopped }),
  };
  const end: RunEventDraft = { type: 'agent.subagent.end', data };
  if (duration <= config.max_minutes * MS_PER_MINUTE) return [end];
  const overrun = { agent_type: agentType, duration_ms: duration, limit_minutes: config.max_minutes };
  return [end, { type: 'agent.subagent.overrun', data: overrun }];
}
