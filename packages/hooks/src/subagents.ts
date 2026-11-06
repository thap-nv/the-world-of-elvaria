// How long an apprentice ran (implementation-plan §3.12): SubagentStart records the start, SubagentStop reads
// it back for `agent.subagent.end {duration_ms}`. One file per sub-agent, because apprentices start in parallel.
// The minutes are only measured here; the cap that bites is `maxTurns` (cli-facts §1.4), and the overrun
// event is P1-17's.
import { errorText } from './draft.ts';
import { readState, removeState, stateFile, writeState } from './run-state.ts';

/** A sub-agent id that is safe as a file name; anything else is not recorded. */
const AGENT_ID_SHAPE = /^[\w-]{1,128}$/;

const startFile = (runDir: string, agentId: string): string => stateFile(runDir, `subagents/${agentId}.json`);

export function recordSubagentStart(runDir: string | undefined, agentId: string, now: number): string[] {
  if (runDir === undefined || !AGENT_ID_SHAPE.test(agentId)) return [];
  try {
    writeState(startFile(runDir, agentId), { started_at_ms: now });
    return [];
  } catch (error) {
    return [`could not record the start of sub-agent ${agentId}: ${errorText(error)}`];
  }
}

/** Milliseconds since the recorded start, which is then forgotten; 0 when no start was recorded. */
export function subagentDuration(runDir: string | undefined, agentId: string, now: number): number {
  if (runDir === undefined || !AGENT_ID_SHAPE.test(agentId)) return 0;
  const file = startFile(runDir, agentId);
  const started = readState(file)?.started_at_ms;
  try {
    removeState(file);
  } catch {
    // A start file left behind costs a few bytes in .runs/; the duration is still right.
  }
  return typeof started === 'number' && started <= now ? Math.round(now - started) : 0;
}
