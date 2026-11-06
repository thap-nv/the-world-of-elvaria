// The Stop gate of ADR 0010 on a temp kingdom: SessionStart records the letter, Stop blocks while it is
// unchanged (at most STOP_BLOCK_LIMIT times per session), then lets the session end with a notice.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PAYLOADS } from './__fixtures__/claude-payloads.ts';
import { tempKingdom } from './__fixtures__/temp.ts';
import { translateClaude } from './claude/translate.ts';
import { loadContext } from './context.ts';
import { STOP_BLOCK_LIMIT, fingerprintOf, recordHandoverStart, stopGate } from './handover.ts';
import type { TempKingdom } from './__fixtures__/temp.ts';
import type { HookContext } from './context.ts';

let kingdom: TempKingdom;
let ctx: HookContext;
beforeEach(async () => {
  kingdom = await tempKingdom();
  ctx = loadContext(kingdom.env({ ELVARIA_ROLE: 'assignee' }), []);
});
afterEach(() => kingdom.remove());

const start = (session = 'sess-1') =>
  translateClaude({ ...PAYLOADS.SessionStart, session_id: session }, ctx, 0);
const stop = (session = 'sess-1') => translateClaude({ ...PAYLOADS.Stop, session_id: session }, ctx, 0);
const typesOf = (result: ReturnType<typeof stop>) =>
  result.drafts.map(({ data }) => (data as { notification_type: string }).notification_type);

describe('Stop gate', () => {
  it('blocks an assignee who never touched the letter, twice, then lets the session end', async () => {
    await kingdom.writeHandover('# Bàn giao\n');
    start();
    for (let count = 1; count <= STOP_BLOCK_LIMIT; count += 1) {
      const result = stop();
      expect(result.block).toMatch(/update the handover letter before finishing/);
      expect(result.block).toContain(path.join(kingdom.root, 'quests'));
      expect(typesOf(result)).toEqual(['handover_required']);
    }
    const last = stop();
    expect(last.block).toBeUndefined();
    expect(typesOf(last)).toEqual(['handover_unchanged']);
  });

  it('blocks when there is no letter at all, even without a recorded start', () => {
    expect(stop().block).toBeDefined();
  });

  it('counts per session: a revived session is asked again', async () => {
    await kingdom.writeHandover('# Bàn giao\n');
    start('first');
    for (let count = 0; count <= STOP_BLOCK_LIMIT; count += 1) stop('first');
    start('revived');
    expect(stop('revived').block).toBeDefined();
  });

  it('lets an assignee finish once the letter changed, judged against the start of the attempt', async () => {
    await kingdom.writeHandover('# Bàn giao\n');
    start('first');
    await kingdom.writeHandover('# Bàn giao\nĐang ở đâu: xong phần API.\n');
    // A revived session of the same attempt keeps the first start, so the earlier edit still counts.
    start('revived');
    expect(stop('revived')).toEqual({ drafts: [], block: undefined, problems: [] });
  });

  it('lets an existing letter pass when no start was recorded', async () => {
    await kingdom.writeHandover('# Bàn giao\n');
    expect(stop().block).toBeUndefined();
  });

  it('leaves verifiers and sessions without a quest alone', () => {
    ctx = { ...ctx, role: 'verifier' };
    expect(stop().block).toBeUndefined();
    ctx = { ...ctx, role: 'assignee', quest: undefined };
    expect(stop().block).toBeUndefined();
    expect(recordHandoverStart(ctx)).toEqual([]);
  });

  it('reads a damaged block counter as no blocks', async () => {
    await mkdir(path.join(kingdom.runDir, 'hook'), { recursive: true });
    await writeFile(
      path.join(kingdom.runDir, 'hook', 'stop-blocks.json'),
      '{"version":1,"sessions":{"sess-1":"x"}}',
    );
    expect(stop().block).toBeDefined();
  });

  it('lets the session end when it cannot tell', async () => {
    // A folder where the letter should be: reading it fails with EISDIR, not ENOENT.
    await mkdir(path.join(kingdom.root, 'quests', ctx.quest ?? '', 'handover.md'), { recursive: true });
    const result = stopGate(ctx, 'sess-1');
    expect(result.block).toBeUndefined();
    expect(result.problems).toEqual([expect.stringMatching(/^handover check failed/)]);
    expect(recordHandoverStart(ctx)).toEqual([expect.stringMatching(/could not record/)]);
  });
});

describe('fingerprintOf', () => {
  it('is null for a missing file and changes with the bytes, not with a rewrite', async () => {
    const file = path.join(kingdom.root, 'letter.md');
    expect(fingerprintOf(file)).toBeNull();
    await writeFile(file, 'một', 'utf8');
    const first = fingerprintOf(file);
    await writeFile(file, 'một', 'utf8');
    expect(fingerprintOf(file)).toBe(first);
    await writeFile(file, 'hai', 'utf8');
    expect(fingerprintOf(file)).not.toBe(first);
    expect(first).toMatch(/^5:[0-9a-f]{8}$/);
  });
});
