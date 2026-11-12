// Codex's argv: the same flags for a new session and a resumed one, the sandbox by the session's tools, the effort
// from the slug (spike Codex 2026-11-12 §1.3, §2, §4).
import { describe, expect, it } from 'vitest';

import { toolPolicyOf } from '@elvaria/runner-core';
import type { SpawnRequest } from '@elvaria/runner-core';

import { FAKE_HOOK, TERRITORY, openWorld, request } from './__fixtures__/codex.ts';
import { BYPASS_HOOK_TRUST, configOf, hooksCheckArgs, sessionArgs } from './args.ts';
import { modelOf, versionOf } from './launch.ts';

const FILES = { policy: 'policy.json', context: 'AGENTS.override.md' };

describe('sessionArgs', () => {
  it('reads the prompt on stdin, keeps the owner config out and passes the bypass after the hooks', async () => {
    const world = await openWorld();
    try {
      const args = sessionArgs(request(world), FILES, FAKE_HOOK);
      expect(args.slice(0, 4)).toEqual(['exec', '--json', '--ignore-user-config', '--skip-git-repo-check']);
      expect(args.at(-1)).toBe('-');
      expect(args).toContain(BYPASS_HOOK_TRUST);
      expect(args.indexOf(BYPASS_HOOK_TRUST)).toBeGreaterThan(
        args.findLastIndex((arg) => arg.startsWith('hooks.')),
      );
      expect(args.slice(args.indexOf('-m'), args.indexOf('-m') + 2)).toEqual(['-m', 'gpt-6-luna']);
      expect(args).toContain('model_reasoning_effort="low"');
      for (const never of ['-s', '-C', '--add-dir', '--ephemeral', '--worktree'])
        expect(args).not.toContain(never);
    } finally {
      await world.remove();
    }
  });

  it('continues a session by id, with the schema of a structured answer', async () => {
    const world = await openWorld();
    try {
      const req = request(world, {}, { resume: { session_id: 'thread-1' } });
      const args = sessionArgs(req, { ...FILES, schema: 'schema.json' }, FAKE_HOOK);
      expect(args.slice(0, 2)).toEqual(['exec', 'resume']);
      expect(args.slice(-2)).toEqual(['thread-1', '-']);
      expect(args.slice(args.indexOf('--output-schema'), args.indexOf('--output-schema') + 2)).toEqual([
        '--output-schema',
        'schema.json',
      ]);
    } finally {
      await world.remove();
    }
  });

  it('lists for the hooks check the same hooks and features as the session', () => {
    const check = hooksCheckArgs(FILES, FAKE_HOOK);
    expect(check.filter((arg) => arg.startsWith('hooks.'))).toHaveLength(4);
    expect(check).toContain('plugins');
  });
});

describe('configOf', () => {
  it('lets a writing session write its plot and its quest folder, the temp folders out', async () => {
    const world = await openWorld();
    try {
      const config = configOf(request(world));
      expect(config).toContain('sandbox_mode="workspace-write"');
      expect(config).toContain('windows.sandbox="unelevated"');
      expect(config).toContain('sandbox_workspace_write.exclude_tmpdir_env_var=true');
      expect(config).toContain(
        `sandbox_workspace_write.writable_roots=[${JSON.stringify(world.handover.slice(0, -'/handover.md'.length))}]`,
      );
      expect(config).toContain('web_search="disabled"');
    } finally {
      await world.remove();
    }
  });

  it('keeps a judge read-only, and opens the web to a class with WebSearch', async () => {
    const world = await openWorld();
    try {
      const judge = toolPolicyOf({
        role: 'verifier',
        characterClass: {
          tools: { allow: ['Read', 'Glob', 'Grep', 'Bash(git diff:*)', 'WebSearch'], deny: [] },
        },
        territory: TERRITORY,
      });
      const req: SpawnRequest = { ...request(world), role: 'verifier', permissions: judge };
      const { handover: _letter, ...noLetter } = req;
      const config = configOf({ ...noLetter, character: { ...req.character, model: 'gpt-6.1-sol' } });
      expect(config).toContain('sandbox_mode="read-only"');
      expect(config.some((setting) => setting.startsWith('sandbox_workspace_write.writable_roots'))).toBe(
        false,
      );
      expect(config).toContain('web_search="live"');
      expect(config.some((setting) => setting.startsWith('model_reasoning_effort'))).toBe(false);
    } finally {
      await world.remove();
    }
  });
});

describe('modelOf and versionOf', () => {
  it('reads the effort off the end of a slug, and only a known one', () => {
    expect(modelOf('gpt-6-luna-low')).toEqual({ model: 'gpt-6-luna', effort: 'low' });
    expect(modelOf('gpt-6.1-sol-xhigh')).toEqual({ model: 'gpt-6.1-sol', effort: 'xhigh' });
    expect(modelOf('gpt-6.1-sol')).toEqual({ model: 'gpt-6.1-sol' });
    expect(modelOf('-low')).toEqual({ model: '-low' });
  });

  it('reads the version Codex prints', () => {
    expect(versionOf('codex-cli 0.167.0-alpha.4.1\n')).toBe('0.167.0-alpha.4.1');
    expect(versionOf('nothing')).toBeUndefined();
  });
});
