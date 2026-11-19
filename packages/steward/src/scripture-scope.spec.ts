// Scripture by scope (PS-12, temple-first plan DB3-DB5): a session's prompt carries only the lessons whose scope it
// matches, their sentences alone, and the line that opens it names exactly those lessons. A line out of scope, or
// whose scope the machine cannot read, is in neither.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { statusIs } from './__fixtures__/review.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Steward } from './types.ts';
import type { LoadTrace } from '@elvaria/domain';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

// A knight of the claude tribe works, a judge of the claude tribe verifies.
const CAST = [
  { id: 'kael', cls: 'knight' },
  { id: 'sable', cls: 'judge', model: 'claude-opus-5-5', level: 6 },
] as const;
const OTHER_OS = process.platform === 'win32' ? 'darwin' : 'win32';

const TEMPLE = [
  '# Lessons of the temple',
  '',
  '- For everyone.',
  '- {role=verifier} Judges compare commits.',
  '- [L_20261119_4k2pqz] {role=assignee tribe=claude fail_kind=style} Knights of claude write LF.',
  '- {tribe=gemini} Only gemini.',
  '- {territory=dc1-se-team tag=backend,db} Backend of dc1.',
  '- {tag=frontend} Frontend only.',
  '- {rol=verifier} A typo in the key.',
  '- {class=paladin} A class the registry lacks.',
  `- {os=${OTHER_OS}} Another OS.`,
  `- {os=${process.platform}} This OS.`,
  // A token the event log masks (ADR 0013): it never reaches a prompt.
  `- Push with ghp_${'a'.repeat(36)} as the token.`,
  'A paragraph that is no lesson.',
].join('\n');

async function writeKingdomFile(root: string, relative: string, text: string): Promise<void> {
  await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
  await writeFile(path.join(root, relative), text, 'utf8');
}

async function tracesOf(kingdom: Bench): Promise<LoadTrace[]> {
  const { events } = await openEventLog(kingdom.root).read();
  return events.flatMap((event) =>
    event.type === 'quest.started' && event.data.load_trace !== undefined
      ? [event.data.load_trace as LoadTrace]
      : [],
  );
}

async function run(temple: string, own?: string): Promise<{ prompts: string[]; traces: LoadTrace[] }> {
  current = await bench({ cast: CAST });
  await writeKingdomFile(current.root, 'temple/scripture.md', temple);
  if (own !== undefined) await writeKingdomFile(current.root, 'characters/kael/scripture.md', own);
  running = current.steward();
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  await current.command('create_quest', questPayload('Scoped'));
  await tickUntil(running, current.clock, statusIs(current, 'Scoped', 'done'));
  return { prompts: current.requests.map(({ prompt }) => prompt.user), traces: await tracesOf(current) };
}

describe('scripture by scope (PS-12)', () => {
  it('gives each session the lessons of its scope alone, sentences only, and names them on its line', async () => {
    const { prompts, traces } = await run(TEMPLE);
    const [assignee = '', judge = ''] = prompts;
    for (const text of ['For everyone.', 'Knights of claude write LF.', 'Backend of dc1.', 'This OS.'])
      expect(assignee).toContain(`- ${text}`);
    for (const text of [
      'Judges compare',
      'Only gemini',
      'Frontend only',
      'A typo',
      'paladin',
      'Another OS',
      'ghp_',
    ])
      expect(assignee).not.toContain(text);
    expect(judge).toContain('- Judges compare commits.');
    expect(judge).not.toContain('Knights of claude');
    for (const prompt of prompts) {
      expect(prompt).not.toContain('L_20261119_4k2pqz');
      expect(prompt).not.toContain('{');
      expect(prompt).not.toContain('A paragraph that is no lesson.');
      expect(prompt).not.toContain('Push with');
    }

    const [first, second] = traces;
    expect(first?.scriptures).toEqual([{ file: 'temple/scripture.md', lines: 4 }]);
    expect(first?.lessons).toHaveLength(4);
    expect(first?.lessons?.[1]).toBe('L_20261119_4k2pqz');
    expect(second?.lessons).toHaveLength(4);
    // The same line without an id has the same ref in both sessions: its sentence's hash.
    expect(first?.lessons?.[0]).toMatch(/^T_[0-9a-hjkmnp-tv-z]{10}$/u);
    expect(second?.lessons?.[0]).toBe(first?.lessons?.[0]);
    expect(second?.lessons?.[1]).not.toBe(first?.lessons?.[1]);
  });

  it("loads the character's scripture before the temple's", async () => {
    const { prompts, traces } = await run('- From the temple.', '- From kael.\n');
    expect(prompts[0]).toContain('- From kael.\n- From the temple.');
    expect(traces[0]?.scriptures).toEqual([
      { file: 'characters/kael/scripture.md', lines: 1 },
      { file: 'temple/scripture.md', lines: 1 },
    ]);
  });

  it('carries no block and names no lesson when every line is out of scope, or the file is empty', async () => {
    for (const temple of ['- {tribe=gemini} Only gemini.\n', '\n']) {
      const { prompts, traces } = await run(temple);
      expect(prompts[0]).not.toContain('# Lessons');
      expect(traces[0]?.scriptures).toEqual([]);
      expect(traces[0]?.lessons).toBeUndefined();
      expect(traces[0]?.blocks.map(({ id }) => id)).not.toContain('scripture');
      await running?.stop();
      await current?.remove();
    }
  });
});
