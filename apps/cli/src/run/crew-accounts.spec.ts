// Two Claude Code tribes in one kingdom (PS-27): each runner reads its own account's gauge, and releasing a worktree
// purges it in both folders. The fake CLI notes each call in the folder it ran in (fake-calls.jsonl) and replays the
// folder's fake-usage.jsonl for /usage.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { KingdomSchema } from '@elvaria/domain';
import type { AgentRunner } from '@elvaria/runner-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { baseEnv, tempDir, testIo } from '../__fixtures__/cli.ts';
import { newKingdom } from '../init.ts';
import { SELF_ROOT } from '../upgrade/self.ts';
import { crewOf } from './crew.ts';
import type { TempDir } from '../__fixtures__/cli.ts';

const FAKE_CLAUDE = path.join(SELF_ROOT, 'packages', 'runner-claude', 'fixtures', 'fake-claude.mjs');

/** A /usage stream whose session window is `pct` used. */
const usage = (pct: number) =>
  [
    JSON.stringify({ type: 'system', subtype: 'init', session_id: 'u' }),
    JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      num_turns: 0,
      result: `Current session: ${String(pct)}% used`,
    }),
  ].join('\n');

describe('crewOf with two Claude Code tribes (PS-27)', () => {
  let dir: TempDir;
  beforeEach(async () => {
    dir = await tempDir();
  });
  afterEach(() => dir.remove());

  it('gives each its runner in its own folder: its own gauge, and the worktree purged in both', async () => {
    const home = path.join(dir.root, 'home');
    const folders = ['claude', 'claude_2'].map((id) => path.join(home, '.elvaria', 'accounts', id));
    const [first = '', second = ''] = folders;
    await Promise.all(folders.map((folder) => mkdir(folder, { recursive: true })));
    await writeFile(path.join(first, 'fake-usage.jsonl'), usage(12));
    await writeFile(path.join(second, 'fake-usage.jsonl'), usage(3));
    const tribe = (id: string, folder: string) => ({
      id,
      adapter: 'claude_code',
      enabled: true,
      max_concurrent: 1,
      tool: {
        path: FAKE_CLAUDE.replaceAll('\\', '/'),
        version: '2.1.318',
        config_dir: folder.replaceAll('\\', '/'),
      },
    });
    const base = newKingdom({
      name: 'Bình Minh',
      profession: 'developer',
      locale: 'en',
      tz: 'Asia/Ho_Chi_Minh',
      treasury: 'C:/Users/owner/.elvaria/treasury.json',
      createdAt: '2026-11-06T09:00:00+07:00',
    });
    const kingdom = KingdomSchema.parse({
      ...base,
      tribes: [tribe('claude', first), tribe('claude_2', second)],
    });
    const io = testIo({ env: { ...baseEnv(), HOME: home, USERPROFILE: home }, home });
    const crew = await crewOf({ kingdom, root: dir.root }, io);
    const runners = kingdom.tribes.map(({ id }) => crew.runners[id]);
    expect(runners.map((runner) => runner?.tribe)).toEqual(['claude', 'claude_2']);
    const sessionPct = async (runner: AgentRunner | undefined) =>
      (await runner?.probe({ ping: false }))?.windows?.map(({ used_pct }) => used_pct);
    expect(await Promise.all(runners.map(sessionPct))).toEqual([[12], [3]]);

    expect(crew.forget).toHaveLength(2);
    const worktree = path.join(dir.root, 'repo', '.elvaria', 'worktrees', 'q_20261118_abc123');
    await Promise.all(crew.forget.map((forget) => forget(worktree)));
    const callsIn = async (folder: string) =>
      (await readFile(path.join(folder, 'fake-calls.jsonl'), 'utf8'))
        .trim()
        .split('\n')
        .map((line) => (JSON.parse(line) as { call: string }).call);
    expect(await callsIn(first)).toEqual(['usage', 'purge']);
    expect(await callsIn(second)).toEqual(['usage', 'purge']);
  });
});
