import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { openEventLog, openJournal } from '@elvaria/eventlog';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RM_TEMP } from '../__fixtures__/temp.ts';
import { QUEST_ID, THORN } from '../__fixtures__/world.ts';
import { openRunLog } from './run-log.ts';
import { NOTE_PREFIX, STDERR_FILE, STDOUT_FILE, openRunOutput } from './run-output.ts';
import type { RunContext } from './run-context.ts';

/** An Anthropic key shape: redact-patterns.json masks it. */
const SECRET = `sk-ant-api03-${'x'.repeat(40)}`;
/** 2026-11-07 09:00:00 in Ho Chi Minh City. */
const NOW = Date.parse('2026-11-07T02:00:00Z');

let root: string;
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'elvaria run log '));
});
afterAll(() => rm(root, RM_TEMP));

const contextIn = async (fields: Partial<RunContext> = {}): Promise<RunContext> => ({
  kingdom: await mkdtemp(path.join(root, 'kingdom ')),
  quest: QUEST_ID,
  attempt: 1,
  character: THORN.id,
  role: 'assignee',
  model: THORN.model,
  tz: 'Asia/Ho_Chi_Minh',
  ...fields,
});

const SESSION_END = { type: 'agent.session.end', data: { outcome: 'completed', usage: { tokens: 42 } } };

describe('openRunLog', () => {
  it('writes stamped, redacted lines to the log and the journal', async () => {
    const ctx = await contextIn();
    const log = openRunLog(ctx, { now: () => NOW });
    const start = { type: 'agent.subagent.start', data: { agent_type: 'apprentice', note: SECRET } };
    expect(await log.append([SESSION_END, start], 's-1')).toEqual([]);
    const { events } = await openEventLog(ctx.kingdom!).read();
    const journal = await openJournal(ctx.kingdom!, QUEST_ID).read();
    expect(journal.events).toEqual(events);
    expect(events.map(({ type }) => type)).toEqual(['agent.session.end', 'agent.subagent.start']);
    expect(events[0]).toMatchObject({
      ts: '2026-11-07T09:00:00+07:00',
      actor: { kind: 'character', id: THORN.id },
      quest: QUEST_ID,
      attempt: 1,
      session: 's-1',
    });
    expect(JSON.stringify(events)).not.toContain(SECRET);
  });

  it('reports a line the contract refuses and writes the others', async () => {
    const ctx = await contextIn();
    const problems = await openRunLog(ctx).append([
      { type: 'agent.session.end', data: { outcome: 'crashed' } },
      SESSION_END,
    ]);
    expect(problems).toEqual([expect.stringMatching(/^agent\.session\.end not written/)]);
    expect((await openEventLog(ctx.kingdom!).read()).events).toHaveLength(1);
  });

  it('writes nothing without a kingdom, and only the log without a quest', async () => {
    expect(
      await openRunLog({ character: 'x', role: 'chancellor', model: 'm' }).append([SESSION_END]),
    ).toEqual(['ELVARIA_KINGDOM is not set: nothing written']);
    const { quest: _quest, ...rest } = await contextIn();
    const log = openRunLog(rest);
    expect(await log.append([SESSION_END])).toEqual([]);
    expect((await openEventLog(rest.kingdom!).read()).events).toHaveLength(1);
    expect(await log.mark()).toBe(0);
    expect(await log.recorded('s', 0)).toBeUndefined();
  });

  it('stamps in the machine zone when the kingdom zone is unknown', async () => {
    const ctx = await contextIn({ tz: 'Mars/Olympus_Mons' });
    expect(await openRunLog(ctx).append([SESSION_END])).toEqual([]);
  });

  it('reports a write that fails instead of throwing', async () => {
    const file = path.join(root, 'not a folder');
    await writeFile(file, 'x');
    const problems = await openRunLog(await contextIn({ kingdom: file })).append([SESSION_END]);
    expect(problems).toEqual([expect.stringMatching(/^event log: /), expect.stringMatching(/^journal: /)]);
  });

  it('tells whether the SessionStart hook recorded a session after the mark', async () => {
    const ctx = await contextIn();
    const log = openRunLog(ctx);
    const start = (session: string) => ({ type: 'agent.session.start', data: { session, model: 'm' } });
    await log.append([start('old')], 'old');
    const mark = await log.mark();
    expect(mark).toBeGreaterThan(0);
    await log.append([start('new')], 'new');
    expect(await log.recorded('new', mark)).toBe(true);
    expect(await log.recorded('old', mark)).toBe(false);
    expect(await log.recorded('old', 0)).toBe(true);
  });
});

describe('openRunOutput', () => {
  it('keeps stdout lines as JSON with every string redacted', async () => {
    const dir = path.join(root, 'out json');
    const output = openRunOutput(dir);
    output.stdout(JSON.stringify({ type: 'user', text: `token ${SECRET}"}` }));
    output.stdout('   ');
    output.stdout(`not json ${SECRET}`);
    await output.close();
    const lines = (await readFile(path.join(dir, STDOUT_FILE), 'utf8')).trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toEqual({ type: 'user', text: 'token [redacted]"}' });
    expect(lines[1]).toBe('not json [redacted]');
  });

  it('redacts stderr a line at a time, whatever the chunks, and adds the runner notes', async () => {
    const dir = path.join(root, 'out err');
    const output = openRunOutput(dir, ['hunter2-known']);
    output.stderr(`first ${SECRET.slice(0, 20)}`);
    output.stderr(`${SECRET.slice(20)} end\r\nhunter2-`);
    output.note('session judged broken');
    output.stderr('known tail');
    await output.close();
    await output.close();
    output.stderr('after close\n');
    expect(await readFile(path.join(dir, STDERR_FILE), 'utf8')).toBe(
      `first [redacted] end\n${NOTE_PREFIX}session judged broken\n[redacted] tail\n`,
    );
  });
});
