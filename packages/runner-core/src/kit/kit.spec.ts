import { TribeSchema, countedTokens } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { commandRefusal } from '../policy/command-refusal.ts';
import { NO_PUSH_COMMAND } from '../policy/constants.ts';
import { runToEnd, startChild } from '../process/child.ts';
import { KILL_GRACE_MS, killTree } from '../process/kill-tree.ts';
import { createFakeRunner } from '../runner/fake-runner.ts';
import { readQuestion } from '../runner/handover.ts';
import { writePolicyFile } from '../runner/policy-file.ts';
import { openRunLog } from '../runner/run-log.ts';
import { openRunOutput } from '../runner/run-output.ts';
import { ADAPTER_FACTORY, adapterOfModule, runnerProblems } from './adapter-module.ts';
import { ADAPTER_KIT_VERSION, adapterKitOf } from './kit.ts';
import type { AgentRunner } from '../runner/types.ts';
import type { KitHost } from './kit.ts';

const tribe = (tool?: { path: string }) =>
  TribeSchema.parse({
    id: 'lantern',
    adapter: 'adapters/lantern.mjs',
    enabled: false,
    max_concurrent: 1,
    ...(tool === undefined ? {} : { tool: { ...tool, version: '0.1.0' } }),
  });

const host = (overrides: Partial<KitHost> = {}): KitHost => ({
  tribe: tribe({ path: 'C:/tools/lantern.cmd' }),
  kingdom: 'D:/kingdom',
  env: { PATH: '/bin' },
  platform: 'win32',
  node_path: 'C:/node/node.exe',
  launchOf: (file) => Promise.resolve({ file, args: [] }),
  hookCommand: (policy) => ({ command: 'node', args: policy === undefined ? [] : ['--policy', policy] }),
  ...overrides,
});

describe('adapterKitOf', () => {
  it("hands the file the tribe, the machine and runner-core's shared parts", async () => {
    const kit = adapterKitOf(host());
    expect(kit).toMatchObject({ version: ADAPTER_KIT_VERSION, kingdom: 'D:/kingdom', platform: 'win32' });
    expect(kit.tribe.id).toBe('lantern');
    // The pinned path in the machine's own form (kingdom.json keeps `/`, §2.1).
    expect(kit.tool_path).toBe(String.raw`C:\tools\lantern.cmd`);
    expect(kit.hookCommand('p.json')).toEqual({ command: 'node', args: ['--policy', 'p.json'] });
    expect(await kit.launchOf('x')).toEqual({ file: 'x', args: [] });
    // The same functions runner-core's own adapters use, not copies.
    expect(kit.process).toMatchObject({ startChild, runToEnd, killTree, KILL_GRACE_MS });
    expect(kit.session).toMatchObject({
      openRunLog,
      openRunOutput,
      readQuestion,
      writePolicyFile,
      countedTokens,
    });
    expect(kit.policy).toMatchObject({ commandRefusal, NO_PUSH_COMMAND });
  });

  it('prefers the path the owner gives, and has none before doctor pins one', () => {
    expect(adapterKitOf(host({ tool_path: '/opt/lantern' })).tool_path).toBe('/opt/lantern');
    expect(adapterKitOf(host({ tribe: tribe() })).tool_path).toBeUndefined();
  });

  it('cannot be changed by the file it is handed', () => {
    const kit = adapterKitOf(host());
    expect(Object.isFrozen(kit) && Object.isFrozen(kit.session) && Object.isFrozen(kit.env)).toBe(true);
  });
});

describe('adapterOfModule', () => {
  const kit = adapterKitOf(host());
  const runner = (overrides: Partial<Record<keyof AgentRunner, unknown>> = {}) => ({
    ...createFakeRunner({ tribe: kit.tribe.id }),
    adapter: kit.tribe.adapter,
    ...overrides,
  });

  it("builds the runner with the module's createAdapter, sync or async", async () => {
    const built = runner();
    expect(await adapterOfModule({ [ADAPTER_FACTORY]: () => built }, kit)).toEqual({
      ok: true,
      value: built,
    });
    const handed: unknown[] = [];
    const later = { [ADAPTER_FACTORY]: (given: unknown) => (handed.push(given), Promise.resolve(built)) };
    expect((await adapterOfModule(later, kit)).ok).toBe(true);
    expect(handed).toEqual([kit]);
  });

  it('says why a module gives no runner', async () => {
    expect(await adapterOfModule({ default: () => runner() }, kit)).toEqual({
      ok: false,
      error: ['the file does not export a function createAdapter'],
    });
    expect(await adapterOfModule(undefined, kit)).toMatchObject({ ok: false });
    const throws = {
      [ADAPTER_FACTORY]: () => {
        throw new Error('lantern is not installed');
      },
    };
    expect(await adapterOfModule(throws, kit)).toEqual({
      ok: false,
      error: ['createAdapter(kit) threw: lantern is not installed'],
    });
    const rejects = { [ADAPTER_FACTORY]: () => Promise.reject(new Error('no')) };
    expect(await adapterOfModule(rejects, kit)).toEqual({
      ok: false,
      error: ['createAdapter(kit) threw: no'],
    });
    expect(await adapterOfModule({ [ADAPTER_FACTORY]: () => ({ ...runner(), spawn: 1 }) }, kit)).toEqual({
      ok: false,
      error: ['runner.spawn is not a function'],
    });
  });
});

describe('runnerProblems', () => {
  const kit = adapterKitOf(host());

  it('names every way a runner breaks the AgentRunner shape', () => {
    expect(runnerProblems('runner', kit)).toEqual(['createAdapter(kit) did not return an object']);
    expect(runnerProblems({ tribe: 'claude', adapter: 'claude_code', capabilities: null }, kit)).toEqual([
      'runner.tribe is claude, not lantern (kit.tribe.id)',
      'runner.adapter is claude_code, not adapters/lantern.mjs (kit.tribe.adapter)',
      'capabilities is not an object',
      'runner.spawn is not a function',
      'runner.probe is not a function',
      'runner.doctor is not a function',
    ]);
    const capabilities = { ...createFakeRunner().capabilities, usage: 'yes', auth: 'login' };
    expect(
      runnerProblems(
        { ...createFakeRunner({ tribe: kit.tribe.id }), adapter: kit.tribe.adapter, capabilities },
        kit,
      ),
    ).toEqual(['capability usage is not true or false', 'capability auth is not a list']);
  });

  it('takes a runner without a shell, and names a shell that is not a name per known OS (P1-40)', () => {
    const fake = { ...createFakeRunner({ tribe: kit.tribe.id }), adapter: kit.tribe.adapter };
    const withShell = (shell: unknown) =>
      runnerProblems({ ...fake, capabilities: { ...fake.capabilities, shell } }, kit);
    expect(runnerProblems(fake, kit)).toEqual([]);
    expect(withShell({ win32: 'Windows PowerShell (powershell.exe)' })).toEqual([]);
    expect(withShell('powershell')).toEqual(['capability shell is not an object of OS to shell name']);
    expect(withShell(['bash'])).toEqual(['capability shell is not an object of OS to shell name']);
    expect(withShell({ win32: ' ', beos: 'sh' })).toEqual([
      'capability shell.win32 is not a shell name',
      'capability shell names beos, not one of win32, darwin, linux',
    ]);
  });

  it('takes a runner that says nothing of search, or true or false, and nothing else (P1-53)', () => {
    const fake = { ...createFakeRunner({ tribe: kit.tribe.id }), adapter: kit.tribe.adapter };
    const withSearch = (search: unknown) =>
      runnerProblems({ ...fake, capabilities: { ...fake.capabilities, search } }, kit);
    expect(withSearch(false)).toEqual([]);
    expect(withSearch(true)).toEqual([]);
    expect(withSearch('git')).toEqual(['capability search is not true or false']);
  });
});
