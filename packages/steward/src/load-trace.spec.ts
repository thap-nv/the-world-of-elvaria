// The load trace (PS-01b, implementation-plan §3.16.1): the line that opens a session says what its prompt carried,
// the scripture files and their lines, the skills and the size of each block, so the metrics ledger can weigh a
// lesson against what it changed. The quest file and attempt_log stay as they were; the request's prompt is the
// system and the user part alone, as before.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { isEventOf } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { statusIs } from './__fixtures__/review.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Steward } from './types.ts';
import type { LoadTrace } from '@elvaria/domain';
import type { BuiltPrompt } from '@elvaria/runner-core';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

const CAST = [
  { id: 'kael', cls: 'knight' },
  { id: 'sable', cls: 'judge', model: 'claude-opus-5-5', level: 6 },
] as const;

async function writeKingdomFile(root: string, relative: string, text: string): Promise<void> {
  await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
  await writeFile(path.join(root, relative), text, 'utf8');
}

/** The load trace of every line of the log that has one, with the line's type and the session's role. */
async function tracesOf(kingdom: Bench) {
  const { events } = await openEventLog(kingdom.root).read();
  return events.flatMap((event) => {
    if (!event.type.startsWith('quest.') || event.data.load_trace === undefined) return [];
    return [{ type: event.type, trace: event.data.load_trace as LoadTrace }];
  });
}

/** The blocks of a part, a blank line apart, are as long as the part the CLI got. */
const sizeOf = (trace: LoadTrace, part: 'system' | 'user'): number => {
  const blocks = trace.blocks.filter((block) => block.part === part);
  return blocks.reduce((total, { chars }) => total + chars, 0) + '\n\n'.length * (blocks.length - 1);
};

describe('the load trace on the line that opens a session (PS-01b)', () => {
  it("names the assignee's scriptures and every block, and the judge's, on the two opening lines alone", async () => {
    current = await bench({ cast: CAST });
    await writeKingdomFile(
      current.root,
      'characters/kael/scripture.md',
      '- Run the linter.\n- Name the ADR.\n',
    );
    await writeKingdomFile(current.root, 'temple/scripture.md', '\n- Keep files under 300 lines.\n');
    running = current.steward();
    expect(await running.start({ loop: false })).toEqual({ ok: true });
    await current.command('create_quest', questPayload('Traced'));
    await tickUntil(running, current.clock, statusIs(current, 'Traced', 'done'));

    const traces = await tracesOf(current);
    expect(traces.map(({ type }) => type)).toEqual(['quest.started', 'quest.started']);
    const [assignee, verifier] = traces.map(({ trace }) => trace);
    expect(assignee?.scriptures).toEqual([
      { file: 'characters/kael/scripture.md', lines: 2 },
      { file: 'temple/scripture.md', lines: 1 },
    ]);
    expect(assignee?.skills).toEqual([]);
    expect(assignee?.blocks.map(({ id }) => id)).toEqual(['role', 'class', 'quest', 'scripture']);
    expect(verifier?.blocks.map(({ id }) => id)).toEqual(['role', 'class', 'quest', 'scripture', 'review']);

    const requests = current.requests;
    for (const [index, trace] of [assignee, verifier].entries()) {
      const prompt: BuiltPrompt | undefined = requests[index]?.prompt;
      if (trace === undefined || prompt === undefined) throw new Error('a session is missing');
      expect(Object.keys(prompt)).toEqual(['system', 'user']);
      expect([sizeOf(trace, 'system'), sizeOf(trace, 'user')]).toEqual([
        prompt.system.length,
        prompt.user.length,
      ]);
    }
    const quest = await current.quest('Traced');
    expect(JSON.stringify(quest)).not.toContain('load_trace');
  });

  it('names no scripture for a session resumed after an answer, whose prompt carries only what is new', async () => {
    current = await bench({ cast: CAST, plays: { work: { Asks: ['ask', 'submit'] } } });
    await writeKingdomFile(current.root, 'temple/scripture.md', '- Keep files under 300 lines.\n');
    running = current.steward();
    expect(await running.start({ loop: false })).toEqual({ ok: true });
    await current.command('create_quest', questPayload('Asks'));
    await tickUntil(running, current.clock, statusIs(current, 'Asks', 'blocked'));
    await current.command('answer', { quest: (await current.quest('Asks')).id, answer: 'On main.' });
    await running.tick();

    const { events } = await openEventLog(current.root).read();
    const unblocked = events.find((event) => isEventOf(event, 'quest.unblocked'));
    const trace = unblocked?.data.load_trace;
    expect(trace?.scriptures).toEqual([]);
    expect(trace?.blocks.map(({ part, id }) => `${part}:${id}`)).toEqual([
      'system:role',
      'system:class',
      'user:resumed',
      'user:answer',
    ]);
  });
});
