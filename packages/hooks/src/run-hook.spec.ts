// One call from stdin to disk, in-process: every line read back through the event log's reader, which checks
// it with the domain's EventSchema (an `invalid` issue would mean a line readers drop).
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  CHARACTER,
  DC1_LAWS,
  EXPECTED_TYPES,
  PAYLOADS,
  QUEST,
  SESSION,
  payload,
} from './__fixtures__/claude-payloads.ts';
import { tempKingdom } from './__fixtures__/temp.ts';
import { runHook } from './run-hook.ts';
import type { TempKingdom } from './__fixtures__/temp.ts';
import type { ClaudeEvent } from './__fixtures__/claude-payloads.ts';
import type { HookEnv } from './context.ts';

const NOW = Date.parse('2026-11-06T16:59:59Z');

let kingdom: TempKingdom;
beforeEach(async () => {
  kingdom = await tempKingdom();
});
afterEach(() => kingdom.remove());

const call = (raw: unknown, env: HookEnv = kingdom.env(), argv: string[] = [], now = NOW) =>
  runHook({ stdin: JSON.stringify(raw), env, argv, now });

describe('runHook', () => {
  it('writes every event of a session to the log and the journal, valid and in order', async () => {
    const events = Object.keys(PAYLOADS) as ClaudeEvent[];
    // One call per millisecond: each call is its own process with its own stamper, ordered by time.
    for (const [index, event] of events.entries()) {
      expect(await call(PAYLOADS[event], kingdom.env(), [], NOW + index)).toEqual({
        exitCode: 0,
        stderr: '',
      });
    }
    const log = await kingdom.log();
    expect(log.issues).toEqual([]);
    expect(log.events.map(({ type }) => type)).toEqual(events.flatMap((event) => EXPECTED_TYPES[event]));
    expect((await kingdom.journal()).events).toEqual(log.events);
    const ids = log.events.map(({ id }) => id);
    expect([...ids].sort()).toEqual(ids);
  });

  it('stamps each line with the session, in the kingdom zone, into that day file', async () => {
    await call(PAYLOADS.PostToolUse);
    const [line] = (await kingdom.log()).events;
    expect(line).toMatchObject({
      v: 1,
      ts: '2026-11-06T23:59:59+07:00',
      type: 'agent.tool',
      actor: { kind: 'character', id: CHARACTER },
      quest: QUEST,
      attempt: 1,
      session: SESSION,
    });
    // Two hours further east it is already the next day, so the same instant goes to the next day file.
    await call(PAYLOADS.PostToolUse, kingdom.env({ ELVARIA_TZ: 'Asia/Tokyo' }));
    const { events, cursor } = await kingdom.log();
    expect(events[1]?.ts).toBe('2026-11-07T01:59:59+09:00');
    expect(Object.keys(cursor).sort()).toEqual(['2026-11-06', '2026-11-07']);
  });

  it('masks secrets before writing, in the command and in the notice', async () => {
    const secret = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';
    await call(
      payload('PostToolUse', {
        tool_name: 'Bash',
        tool_input: { command: `GITHUB_TOKEN=${secret} gh pr list` },
      }),
    );
    await call(payload('Notification', { message: `token: ${secret}` }));
    const text = JSON.stringify((await kingdom.log()).events);
    expect(text).not.toContain(secret);
    expect(text).toContain('[redacted]');
  });

  it('blocks a forbidden Windows path with exit 2 and the reason on stderr', async () => {
    const policy = path.join(kingdom.runDir, 'policy.json');
    await writeFile(policy, JSON.stringify({ version: 1, laws: DC1_LAWS }), 'utf8');
    const edit = payload('PreToolUse', {
      tool_name: 'Read',
      tool_input: { file_path: 'C:\\Users\\dev\\dc1-se-team\\.elvaria\\worktrees\\q\\.ENV' },
    });
    const outcome = await call(edit, kingdom.env(), ['--policy', policy]);
    expect(outcome.exitCode).toBe(2);
    expect(outcome.stderr).toMatch(/^Elvaria law of this territory: .*\.ENV is a forbidden path \(\.env\)/);
    const [line] = (await kingdom.log()).events;
    expect(line).toMatchObject({ type: 'agent.tool.blocked', data: { tool: 'read' } });
  });

  it('blocks the handover-less Stop of an assignee with exit 2', async () => {
    const outcome = await call(PAYLOADS.Stop, kingdom.env({ ELVARIA_ROLE: 'assignee' }));
    expect(outcome.exitCode).toBe(2);
    expect(outcome.stderr).toMatch(/handover letter/);
  });

  it('never blocks on a failed write: it says so on stderr and exits 0', async () => {
    const file = path.join(kingdom.root, 'not-a-folder');
    await writeFile(file, '', 'utf8');
    const outcome = await call(PAYLOADS.PostToolUse, kingdom.env({ ELVARIA_KINGDOM: file }));
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stderr).toMatch(/^elvaria-hook: event log: /m);
    expect(outcome.stderr).toMatch(/^elvaria-hook: journal: /m);
  });

  it('reports missing context and unreadable stdin without blocking', async () => {
    expect(await runHook({ stdin: 'not json', env: {}, argv: [], now: NOW })).toEqual({
      exitCode: 0,
      stderr: 'elvaria-hook: stdin is not a JSON object; ignored\n',
    });
    const outcome = await call(PAYLOADS.PostToolUse, {});
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stderr).toContain('ELVARIA_KINGDOM is not set');
    expect(outcome.stderr).toContain('not an IANA zone');
  });

  it('writes a system actor and no journal without a character and a quest', async () => {
    await call(
      PAYLOADS.StopFailure,
      kingdom.env({ ELVARIA_CHARACTER: '', ELVARIA_QUEST: '', ELVARIA_ATTEMPT: '' }),
    );
    const { events, issues } = await kingdom.log();
    expect(issues).toEqual([]);
    expect(events[0]).toMatchObject({ actor: { kind: 'system' }, type: 'mana.signal' });
    expect(events[0]).not.toHaveProperty('quest');
    expect((await kingdom.journal()).events).toEqual([]);
  });
});
