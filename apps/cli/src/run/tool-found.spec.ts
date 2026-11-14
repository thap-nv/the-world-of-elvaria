// The Steward's `toolFound` port (A1b of the lessons of 2026-11-13): the CLI each tribe's runner starts and what it
// says with --version; a file gone said as such (Codex after a VS Code update, 2026-11-14), a CLI that does not answer
// said as nothing.
import path from 'node:path';

import { KingdomSchema, TribeIdSchema } from '@elvaria/domain';
import type { Kingdom } from '@elvaria/domain';
import { createFakeRunner } from '@elvaria/runner-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fakeTool, foundKingdom, tempDir, testIo } from '../../test/cli.ts';
import { kingdomJson } from '../../test/lantern.ts';
import { toolFoundOf } from './tool-found.ts';
import type { TempDir } from '../../test/cli.ts';

const CLAUDE = TribeIdSchema.parse('claude');
const GEMINI = TribeIdSchema.parse('gemini');
const MINE = TribeIdSchema.parse('mine');

describe('the CLIs the Steward asks before its plan', () => {
  let dir: TempDir;
  let kingdom: Kingdom;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = KingdomSchema.parse(await kingdomJson(await foundKingdom(dir.root)));
  });
  afterEach(() => dir.remove());

  const pinned = (tribes: Kingdom['tribes']): Kingdom => ({ ...kingdom, tribes });

  it('reads the version of the pinned file, says a file gone, and nothing of a CLI that fails', async () => {
    const claude = (await fakeTool(path.join(dir.root, 'bin'), 'claude', '2.1.330 (Claude Code)')).replaceAll(
      '\\',
      '/',
    );
    const broken = (await fakeTool(path.join(dir.root, 'broken'), 'agy', 'boom', 3)).replaceAll('\\', '/');
    const tool = (file: string) => ({ path: file, version: '1.0.0', auth: 'login' as const });
    const tribes = kingdom.tribes.map((tribe) => ({
      ...tribe,
      tool: tool(tribe.id === CLAUDE ? claude : broken),
    }));
    const found = toolFoundOf(pinned(tribes), {}, testIo());
    expect(await found(CLAUDE)).toEqual({ path: claude, version: '2.1.330' });
    expect(await found(GEMINI)).toBeUndefined();
    const gone = `${dir.root.replaceAll('\\', '/')}/gone/claude.exe`;
    const moved = toolFoundOf(
      pinned(kingdom.tribes.map((tribe) => ({ ...tribe, tool: tool(gone) }))),
      {},
      testIo(),
    );
    expect(await moved(CLAUDE)).toEqual({ path: gone, version: undefined });
    // A tribe with no pinned CLI, or none in kingdom.json, is not asked.
    expect(await toolFoundOf(kingdom, {}, testIo())(CLAUDE)).toBeUndefined();
    expect(await found(MINE)).toBeUndefined();
  });

  it("asks an adapter file's runner, which knows its own CLI", async () => {
    const tribes = [
      ...kingdom.tribes,
      {
        id: MINE,
        adapter: 'adapters/mine.mjs',
        enabled: true,
        max_concurrent: 1,
        tool: { path: 'C:/mine/mine.exe', version: '0.9.0', auth: 'login' as const },
      },
    ];
    let info = { path: 'C:\\mine\\mine.exe', version: '1.0.0', auth_ok: true };
    const runner = { ...createFakeRunner({ tribe: MINE }), doctor: () => Promise.resolve(info) };
    const found = toolFoundOf(pinned(tribes), { [MINE]: runner }, testIo({ platform: 'win32' }));
    expect(await found(MINE)).toEqual({ path: 'C:/mine/mine.exe', version: '1.0.0' });
    info = { ...info, version: '' };
    expect(await found(MINE)).toBeUndefined();
  });
});
