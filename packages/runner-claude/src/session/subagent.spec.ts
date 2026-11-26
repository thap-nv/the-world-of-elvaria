import { describe, expect, it } from 'vitest';

import { subagentEndLines } from './subagent.ts';

const LIMIT = { max_minutes: 5 };
const end = (duration_ms: number, stopped?: 'max_turns') =>
  ({ kind: 'subagent_end', agent_type: 'apprentice', duration_ms, ...(stopped ? { stopped } : {}) }) as const;

describe('subagentEndLines', () => {
  it('writes only the end of an apprentice within subagent_max_minutes', () => {
    expect(subagentEndLines(LIMIT, end(4 * 60_000))).toEqual([
      { type: 'agent.subagent.end', data: { agent_type: 'apprentice', duration_ms: 240_000 } },
    ]);
    expect(subagentEndLines(LIMIT, end(5 * 60_000))).toHaveLength(1);
  });

  it('adds agent.subagent.overrun past subagent_max_minutes (a fake 5-minute run, §3.12)', () => {
    expect(subagentEndLines(LIMIT, end(5 * 60_000 + 1, 'max_turns'))).toEqual([
      {
        type: 'agent.subagent.end',
        data: { agent_type: 'apprentice', duration_ms: 300_001, stopped: 'max_turns' },
      },
      {
        type: 'agent.subagent.overrun',
        data: { agent_type: 'apprentice', duration_ms: 300_001, limit_minutes: 5 },
      },
    ]);
  });
});
