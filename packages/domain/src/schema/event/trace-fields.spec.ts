// The fields PS-01b adds to lines of v1 (implementation-plan §3.16.1): each optional, so a line written before them
// still reads, and `v` stays 1 (ADR 0003).
import { describe, expect, it } from 'vitest';

import { QUEST_VIEW } from '../../world/__fixtures__/examples.ts';
import { EventSchema } from './event.ts';

const line = (type: string, data: Record<string, unknown>) => ({
  v: 1,
  id: '01JCF8X4Z6Q3W9N2M5R7T8V0YB',
  ts: '2026-11-12T09:12:03+07:00',
  type,
  actor: { kind: 'steward' },
  data,
});

const reads = (value: unknown): boolean => EventSchema.safeParse(value).success;

const LOAD_TRACE = {
  scriptures: [{ file: 'characters/thorn/scripture.md', lines: 4 }],
  skills: [],
  blocks: [
    { part: 'system', id: 'role', chars: 2140 },
    { part: 'user', id: 'quest', chars: 610 },
    { part: 'user', id: 'scripture', chars: 233 },
  ],
};
const COMMAND = '01JCFB7Q2R8S4T6V9W3X5Y1Z0A';
const CHECKS = [{ id: 'e2e', pass: false, duration_ms: 61000 }];

describe('the load trace on a session opening line', () => {
  it('reads a line with it and a line without it', () => {
    expect(reads(line('quest.started', { quest: QUEST_VIEW, load_trace: LOAD_TRACE }))).toBe(true);
    expect(reads(line('quest.started', { quest: QUEST_VIEW }))).toBe(true);
  });

  it('refuses an empty block, a block of an unknown part, or a trace with no block', () => {
    const blocks = (value: unknown) =>
      line('quest.started', { quest: QUEST_VIEW, load_trace: { ...LOAD_TRACE, blocks: value } });
    expect(reads(blocks([{ part: 'user', id: 'quest', chars: 0 }]))).toBe(false);
    expect(reads(blocks([{ part: 'middle', id: 'quest', chars: 1 }]))).toBe(false);
    expect(reads(blocks([]))).toBe(false);
  });
});

describe("the command's kind on command.applied and command.rejected", () => {
  it('reads a line with a kind and a line without one', () => {
    expect(reads(line('command.applied', { command_id: COMMAND, kind: 'return' }))).toBe(true);
    expect(
      reads(line('command.rejected', { command_id: COMMAND, reason: 'unknown_quest', kind: 'retry' })),
    ).toBe(true);
    expect(reads(line('command.applied', { command_id: COMMAND }))).toBe(true);
  });

  it('reads a kind it does not know yet, but not one that is no id', () => {
    expect(reads(line('command.applied', { command_id: COMMAND, kind: 'decide_memo' }))).toBe(true);
    expect(reads(line('command.applied', { command_id: COMMAND, kind: 'Return!' }))).toBe(false);
  });
});

describe('the environment on check.end', () => {
  it('reads a run set aside for its environment, and a line without it', () => {
    const environment = {
      check: 'e2e',
      line: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock.',
    };
    expect(reads(line('check.end', { outcome: 'fail', checks: CHECKS, environment }))).toBe(true);
    expect(reads(line('check.end', { outcome: 'fail', checks: CHECKS }))).toBe(true);
  });

  it('refuses an environment without the line that showed it', () => {
    expect(reads(line('check.end', { outcome: 'fail', checks: CHECKS, environment: { check: 'e2e' } }))).toBe(
      false,
    );
  });
});
