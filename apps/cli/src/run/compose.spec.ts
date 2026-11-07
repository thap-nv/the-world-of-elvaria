import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { CharacterIdSchema, KingdomSchema, QuestIdSchema, TerritorySchema } from '@elvaria/domain';
import type { Kingdom, Quest, Territory } from '@elvaria/domain';
import { translator } from '@elvaria/i18n';
import type { PlotManager } from '@elvaria/runner-core';
import { describe, expect, it } from 'vitest';

import { questFixture } from '../../test/quest.ts';
import { newKingdom } from '../init.ts';
import { testIo } from '../../test/cli.ts';
import { consoleBell, lineOf } from './bell.ts';
import { crewOf, toolOptionsOf } from './crew.ts';
import { plotsOver, processHostOf } from './plots.ts';

const t = translator('en');

/** A new kingdom of the CLI, every setting at its default, with these tribes. */
const kingdomWith = (tribes: readonly Record<string, unknown>[]): Kingdom => {
  const base = newKingdom({
    name: 'Bình Minh',
    profession: 'developer',
    locale: 'en',
    tz: 'Asia/Ho_Chi_Minh',
    treasury: 'C:/Users/owner/.elvaria/treasury.json',
    createdAt: '2026-11-06T09:00:00+07:00',
  });
  return KingdomSchema.parse({ ...base, tribes });
};

describe('crewOf', () => {
  const kingdom = kingdomWith([
    { id: 'claude', adapter: 'claude_code', enabled: true, max_concurrent: 2 },
    { id: 'gemini', adapter: 'antigravity', enabled: true, max_concurrent: 1 },
    { id: 'spare', adapter: 'claude_code', enabled: false, max_concurrent: 1 },
    { id: 'codex', adapter: 'codex_cli', enabled: true, max_concurrent: 1 },
  ]);

  it('gives each enabled tribe with a known adapter a runner, and its CLI a forget', () => {
    const crew = crewOf(kingdom, testIo());
    expect(Object.keys(crew.runners)).toEqual(['claude', 'gemini']);
    const claude = crew.runners[kingdom.tribes[0]!.id];
    expect(claude?.adapter).toBe('claude_code');
    expect(claude?.capabilities.tool_gate).toBe(true);
    // Antigravity since P1-15: agy keeps nothing per worktree, so only Claude Code has a forget.
    const gemini = crew.runners[kingdom.tribes[1]!.id];
    expect(gemini).toMatchObject({ tribe: 'gemini', adapter: 'antigravity' });
    expect(gemini?.capabilities).toMatchObject({ resume: true, subagent: false });
    expect(crew.forget).toHaveLength(1);
    expect(crew.idle.map(({ id }) => id)).toEqual(['codex']);
  });

  it('starts the pinned CLI, with the minimal env only', () => {
    const tribe = {
      ...kingdom.tribes[0]!,
      tool: { path: 'C:/tools/claude.exe', version: '2.1.318', auth: 'login' as const },
    };
    const options = toolOptionsOf(
      tribe,
      testIo({ env: { PATH: '/bin', SECRET_TOKEN: 'x' }, platform: 'win32' }),
    );
    expect(options.executable).toBe(String.raw`C:\tools\claude.exe`);
    expect(options.env).toEqual({ PATH: '/bin' });
    expect(toolOptionsOf(kingdom.tribes[0]!, testIo())).not.toHaveProperty('executable');
  });
});

describe('plots over PlotManager', () => {
  const quest: Quest = questFixture('open');
  const territory: Territory = TerritorySchema.parse({
    version: 1,
    id: 'notes',
    name: 'notes',
    path: 'D:/notes',
    kind: 'docs',
    vcs: { type: 'none' },
    commands: {},
    checks: [],
    laws: { forbidden_paths: [], forbidden_commands: [] },
  });
  const manager = (result: Awaited<ReturnType<PlotManager['prepare']>>): PlotManager => ({
    prepare: () => Promise.resolve(result),
    status: () => Promise.reject(new Error('unused')),
    touched: () => Promise.reject(new Error('unused')),
    commitAll: () => Promise.reject(new Error('unused')),
    diff: () => Promise.reject(new Error('unused')),
    release: () => Promise.reject(new Error('unused')),
  });
  const kingdom = path.resolve('kingdom root');
  const HOST = processHostOf(testIo());

  it('runs a session in the worktree, or in the folder inside the kingdom', async () => {
    const worktree = { type: 'worktree' as const, path: 'D:/repo/.elvaria/worktrees/q', branch: 'quest/q' };
    const atWorktree = plotsOver(
      kingdom,
      manager({ ok: true, value: { plot: worktree, created: true, setup: null } }),
      HOST,
    );
    expect((await atWorktree.prepare(quest, territory)).cwd).toBe(
      path.normalize('D:/repo/.elvaria/worktrees/q'),
    );
    const folder = { type: 'folder' as const, path: `quests/${quest.id}/work` };
    const atFolder = plotsOver(
      kingdom,
      manager({ ok: true, value: { plot: folder, created: false, setup: null } }),
      HOST,
    );
    expect((await atFolder.prepare(quest, territory)).cwd).toBe(
      path.join(kingdom, 'quests', quest.id, 'work'),
    );
  });

  it('throws when the plot is not ready, so the Steward opens no session', async () => {
    const failed = plotsOver(
      kingdom,
      manager({ ok: false, error: { reason: 'setup_failed', detail: 'pnpm install exited 1' } }),
      HOST,
    );
    await expect(failed.prepare(quest, territory)).rejects.toThrow(
      `the plot of ${quest.id} is not ready (setup_failed): pnpm install exited 1`,
    );
    const pathless = plotsOver(
      kingdom,
      manager({ ok: true, value: { plot: { type: 'folder' }, created: false, setup: null } }),
      HOST,
    );
    await expect(pathless.prepare(quest, territory)).rejects.toThrow('has no path');
  });

  it('commits, runs the checks on what the quest touched, gives the diff and releases through PlotManager', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'elvaria plots-'));
    try {
      const calls: string[] = [];
      const folder = { type: 'folder' as const, path: `quests/${quest.id}/work` };
      await mkdir(path.join(dir, 'quests', quest.id, 'work'), { recursive: true });
      const wired: PlotManager = {
        ...manager({ ok: true, value: { plot: folder, created: false, setup: null } }),
        touched: () => Promise.resolve(['notes/today.md']),
        commitAll: (_plot, message) => {
          calls.push(message);
          return Promise.resolve({ status: 'no_git' });
        },
        diff: () => Promise.resolve(' notes/today.md | 1 +'),
        release: () => Promise.resolve({ ok: true, value: { removed: false, forget_failures: [] } }),
      };
      const lint = {
        id: 'lint',
        run: 'node --version',
        when: ['**/*.md'],
        exclusive: false,
        timeout_minutes: 1,
      };
      const checked = { ...territory, checks: [lint] };
      const plots = plotsOver(dir, wired, HOST);
      expect(await plots.commit(folder, 'chore: submit q')).toEqual({ status: 'no_git' });
      expect(calls).toEqual(['chore: submit q']);
      const runs = await plots.check({
        plot: folder,
        territory: TerritorySchema.parse(checked),
        run_dir: `.runs/${quest.id}-1`,
      });
      expect(runs).toMatchObject([
        { id: 'lint', pass: true, log_path: `.runs/${quest.id}-1/checks/lint.log` },
      ]);
      expect(await plots.diff(folder)).toBe(' notes/today.md | 1 +');
      expect(await plots.release(folder)).toEqual({
        ok: true,
        value: { removed: false, forget_failures: [] },
      });
      // A quest that never got a plot runs its checks from the kingdom: nothing it touched, nothing to run.
      expect(
        await plotsOver(dir, { ...wired, touched: () => Promise.resolve([]) }, HOST).check({
          plot: { type: 'none' },
          territory: TerritorySchema.parse(checked),
          run_dir: `.runs/${quest.id}-1`,
        }),
      ).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("hands a catalog script the territory's checks resolved to programs, and leaves out what is not found", async () => {
    const check = { when: ['**'], exclusive: false, timeout_minutes: 3 };
    const checked = TerritorySchema.parse({
      ...territory,
      checks: [
        { ...check, id: 'version', run: 'node --version' },
        { ...check, id: 'ghost', run: 'no-such-program-elvaria --run' },
      ],
    });
    const folder = { type: 'folder' as const, path: `quests/${quest.id}/work` };
    const plots = plotsOver(
      kingdom,
      manager({ ok: true, value: { plot: folder, created: false, setup: null } }),
      HOST,
    );
    const resolved = await plots.scriptChecks(checked);
    expect(resolved).toEqual([
      { id: 'version', argv: [expect.any(String), '--version'], timeout_minutes: 3 },
    ]);
    expect(path.isAbsolute(resolved[0]?.argv[0] ?? '')).toBe(true);
  });

  it('finds territory programs on PATH for runner-core, with the minimal env', async () => {
    const host = processHostOf(testIo());
    expect(await host.resolve('node')).toBeDefined();
    expect(await host.resolve('no-such-program-elvaria')).toBeUndefined();
    expect(Object.keys(host.env)).not.toContain('npm_lifecycle_event');
  });
});

describe('the console bell', () => {
  const quest = {
    id: QuestIdSchema.parse('q_20261106_7k3m2a'),
    title: 'Đổi luồng đăng nhập',
    rank: 'A' as const,
  };

  it('says each notice in the owner language', () => {
    expect(lineOf(t, { kind: 'awaiting_seal', quest })).toBe(
      'Quest q_20261106_7k3m2a «Đổi luồng đăng nhập» passed review and waits for your seal.',
    );
    expect(lineOf(t, { kind: 'infirmary', quest, reason: 'crash' })).toContain(
      'went to the infirmary: crash',
    );
    expect(lineOf(t, { kind: 'question', quest, question: 'main or release?' })).toBe(
      'Quest q_20261106_7k3m2a «Đổi luồng đăng nhập» asks you: main or release? ' +
        'To answer: elvaria answer q_20261106_7k3m2a "…"',
    );
    expect(lineOf(t, { kind: 'unjudgeable', quest, classes: ['judge'], model: 'claude-sonnet-5-5' })).toBe(
      'Quest q_20261106_7k3m2a «Đổi luồng đăng nhập» waits in review, but no judge of the kingdom may judge it: ' +
        'the judge must not have worked on it and must run another model than claude-sonnet-5-5. ' +
        'Summon one: elvaria character add <id> --class judge --model <model>',
    );
    expect(lineOf(t, { kind: 'unjudgeable', quest, classes: [], model: null })).toContain(
      'no — of the kingdom may judge it: the judge must not have worked on it and must run another model than —.',
    );
    expect(lineOf(t, { kind: 'subquests_refused', quest, reason: 'no subquests.json' })).toBe(
      'Plan q_20261106_7k3m2a «Đổi luồng đăng nhập» is delivered but opened no sub-quest: no subquests.json. ' +
        'See: elvaria quest show q_20261106_7k3m2a',
    );
    const tooLow = lineOf(t, {
      kind: 'unclaimable',
      quest,
      reason: 'level_too_low',
      class: 'knight',
      best: { character: 'thorn', level: 5, ceiling: 'C' },
    });
    expect(tooLow).toContain('thorn');
    expect(tooLow).toContain('elvaria quest show q_20261106_7k3m2a');
    const none = lineOf(t, { kind: 'unclaimable', quest, reason: 'no_class', class: 'mage' });
    expect(none).toContain('mage');
    const thorn = CharacterIdSchema.parse('thorn');
    expect(lineOf(t, { kind: 'suspended', character: thorn, fail_kind: 'tests_fail', count: 3 })).toBe(
      'thorn failed the same way (tests_fail) 3 times in a row and went to the Temple.',
    );
    expect(lineOf(t, { kind: 'suspended', character: thorn, fail_kind: null, count: 3 })).toContain(
      '(other)',
    );
  });

  it('prints on the terminal that runs the Steward', async () => {
    const io = testIo();
    await consoleBell(t, io).ring({ kind: 'awaiting_seal', quest });
    expect(io.printed.out).toHaveLength(1);
  });
});
