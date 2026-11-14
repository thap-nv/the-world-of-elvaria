import { tmpdir } from 'node:os';
import path from 'node:path';

import { TribeSchema, countedTokens } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { commandRefusal } from '../policy/command-refusal.ts';
import { NO_PUSH_COMMAND } from '../policy/constants.ts';
import { runToEnd, startChild } from '../process/child.ts';
import { KILL_GRACE_MS, killTree } from '../process/kill-tree.ts';
import { createFakeRunner } from '../runner/fake-runner.ts';
import { readQuestion } from '../runner/handover.ts';
import { doctorNoteOf } from '../runner/doctor-notes.ts';
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
    expect(await adapterOfModule({ [ADAPTER_FACTORY]: () => built }, kit)).toMatchObject({
      ok: true,
      value: { tribe: built.tribe, adapter: built.adapter },
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

  it("makes the file's doctor fail while Elvaria's hook is not built, as the built-in adapters' do", async () => {
    const missing = path.join(tmpdir(), 'elvaria no hook', 'elvaria-hook.js');
    const unbuilt = adapterKitOf(
      host({ hookCommand: () => ({ command: 'node', args: ['--conditions=elvaria-dist', missing] }) }),
    );
    const loaded = await adapterOfModule({ [ADAPTER_FACTORY]: () => runner() }, unbuilt);
    if (!loaded.ok) throw new Error('the runner should load');
    expect(await loaded.value.doctor()).toMatchObject({
      auth_ok: false,
      notes: [doctorNoteOf('doctor:hook_missing', { file: missing })],
    });
    // The rest of the runner is the file's own.
    expect(loaded.value).toMatchObject({ tribe: kit.tribe.id, adapter: kit.tribe.adapter });
    expect(await loaded.value.probe()).toEqual({ status: 'ok' });
    const notes = runner({
      doctor: () => Promise.resolve({ path: 'p', version: '1', auth_ok: true, detail: 'sign-in ends soon' }),
    });
    const noted = await adapterOfModule({ [ADAPTER_FACTORY]: () => notes }, unbuilt);
    expect(noted.ok && (await noted.value.doctor()).detail).toBe('sign-in ends soon');
  });

  it("leaves the file's doctor as it is once the hook is built", async () => {
    const built = adapterKitOf(
      host({ hookCommand: () => ({ command: 'node', args: [import.meta.filename] }) }),
    );
    const loaded = await adapterOfModule({ [ADAPTER_FACTORY]: () => runner() }, built);
    if (!loaded.ok) throw new Error('the runner should load');
    expect(await loaded.value.doctor()).toMatchObject({ auth_ok: true });
    expect((await loaded.value.doctor()).detail).toBeUndefined();
  });

  it.each([
    [undefined, undefined],
    [
      [doctorNoteOf('doctor:no_version', { command: 'cli' })],
      [doctorNoteOf('doctor:no_version', { command: 'cli' })],
    ],
    [[{ code: 'unknown', params: {} }], [doctorNoteOf('doctor:bad_note', { code: 'unknown' })]],
    [[null], [doctorNoteOf('doctor:bad_note', { code: '?' })]],
    [[{ code: 42 }], [doctorNoteOf('doctor:bad_note', { code: '42' })]],
    ['wrong', [doctorNoteOf('doctor:bad_note', { code: '?' })]],
    [
      [doctorNoteOf('doctor:command_timed_out', { command: 'cli', seconds: 0.01 })],
      [doctorNoteOf('doctor:command_timed_out', { command: 'cli', seconds: 0.01 })],
    ],
    [[{ code: 'doctor:no_version' }], [doctorNoteOf('doctor:bad_note', { code: 'doctor:no_version' })]],
    [
      [
        doctorNoteOf('doctor:terms_not_acknowledged'),
        null,
        doctorNoteOf('doctor:no_version', { command: 'cli' }),
      ],
      [
        doctorNoteOf('doctor:terms_not_acknowledged'),
        doctorNoteOf('doctor:bad_note', { code: '?' }),
        doctorNoteOf('doctor:no_version', { command: 'cli' }),
      ],
    ],
    [
      [{ code: 'doctor:no_version', params: {} }],
      [doctorNoteOf('doctor:bad_note', { code: 'doctor:no_version' })],
    ],
    [
      [{ code: 'doctor:no_version', params: { command: 'cli', extra: 1 } }],
      [doctorNoteOf('doctor:bad_note', { code: 'doctor:no_version' })],
    ],
    [
      [{ code: 'doctor:no_version', params: { command: null } }],
      [doctorNoteOf('doctor:bad_note', { code: 'doctor:no_version' })],
    ],
  ])('checks adapter notes %j even without a hook script', async (notes, expected) => {
    const info = { path: 'cli', version: '1', auth_ok: true, detail: 'verbatim external text', notes };
    const loaded = await adapterOfModule(
      { [ADAPTER_FACTORY]: () => runner({ doctor: () => Promise.resolve(info) }) },
      kit,
    );
    if (!loaded.ok) throw new Error('the runner should load');
    expect(await loaded.value.doctor()).toEqual({ ...info, notes: expected });
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

  it('takes a runner that says nothing of read and models, or says them well (PS-23)', () => {
    const fake = { ...createFakeRunner({ tribe: kit.tribe.id }), adapter: kit.tribe.adapter };
    const withCaps = (more: Record<string, unknown>) =>
      runnerProblems({ ...fake, capabilities: { ...fake.capabilities, ...more } }, kit);
    expect(withCaps({ read: false, models: [{ id: 'auto' }, { id: 'swift', family: 'claude' }] })).toEqual(
      [],
    );
    expect(withCaps({ read: 'no', models: [] })).toEqual([
      'capability read is not true or false',
      'capability models is not a non-empty list',
    ]);
  });
});
