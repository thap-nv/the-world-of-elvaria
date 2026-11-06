// The stdin Claude Code 2.1.318 really gave a hook, recorded by spike P1-02
// (packages/runner-claude/fixtures/hook-payloads.jsonl, redacted): every line through runHook with the dc1
// laws, every written line read back through the domain's EventSchema (implementation-plan §3.6, §3.12).
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DC1_LAWS } from './__fixtures__/claude-payloads.ts';
import { tempKingdom } from './__fixtures__/temp.ts';
import { runHook } from './run-hook.ts';
import type { TempKingdom } from './__fixtures__/temp.ts';
import type { HookOutcome } from './run-hook.ts';

const RECORDED = new URL('../../runner-claude/fixtures/hook-payloads.jsonl', import.meta.url);
const PAYLOADS = readFileSync(RECORDED, 'utf8')
  .split('\n')
  .filter((line) => line !== '')
  .map((line) => JSON.parse(line) as Record<string, unknown>);

const NOW = Date.parse('2026-11-06T09:00:00Z');

let kingdom: TempKingdom;
let outcomes: HookOutcome[];
beforeEach(async () => {
  kingdom = await tempKingdom();
  const policy = path.join(kingdom.runDir, 'policy.json');
  await writeFile(policy, JSON.stringify({ version: 1, laws: DC1_LAWS }), 'utf8');
  const env = kingdom.env({ ELVARIA_MODEL: 'claude-sonnet-5-5' });
  outcomes = [];
  for (const [index, raw] of PAYLOADS.entries()) {
    const stdin = JSON.stringify(raw);
    outcomes.push(await runHook({ stdin, env, argv: ['--policy', policy], now: NOW + index }));
  }
});
afterEach(() => kingdom.remove());

const denied = (outcome: HookOutcome | undefined): string | undefined => {
  if (outcome === undefined || outcome.stdout === '') return undefined;
  const decision = JSON.parse(outcome.stdout) as { hookSpecificOutput: Record<string, string> };
  expect(decision.hookSpecificOutput.permissionDecision).toBe('deny');
  return decision.hookSpecificOutput.permissionDecisionReason;
};

describe('the payloads Claude Code really sent', () => {
  it('are the 18 calls of the spike, all answered without a note on stderr', () => {
    expect(PAYLOADS).toHaveLength(18);
    expect(outcomes.map(({ stderr }) => stderr)).toEqual(PAYLOADS.map(() => ''));
  });

  it('deny git push and the Explore agent, and let everything else run', () => {
    const decisions = PAYLOADS.flatMap((raw, index) => {
      const reason = denied(outcomes[index]);
      return reason === undefined ? [] : [[raw.tool_name, reason]];
    });
    expect(decisions).toEqual([
      ['Bash', expect.stringMatching(/forbidden pattern git/) as unknown],
      ['Agent', expect.stringMatching(/sub-agent Explore is not allowed/) as unknown],
    ]);
  });

  it('write valid lines, the model of the session coming from the runner', async () => {
    const { events, issues } = await kingdom.log();
    expect(issues).toEqual([]);
    expect(events.map(({ type }) => type)).toEqual([
      'agent.session.start',
      'agent.tool',
      'agent.tool.blocked',
      'agent.tool',
      'agent.tool',
      'agent.tool.blocked',
      'mana.signal',
    ]);
    expect(events[0]?.data).toMatchObject({ model: 'claude-sonnet-5-5' });
    expect(events[6]?.data).toEqual({ error: 'model_not_found', source: 'stop_failure' });
    // Relative to the session's cwd, the worktree: backslashes and the absolute prefix are gone.
    expect(events.map(({ data }) => data.path).filter(Boolean)).toEqual(['README.md', 'notes/spike.txt']);
  });
});
