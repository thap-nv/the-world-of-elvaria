import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { KingdomSchema } from '@elvaria/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  baseEnv,
  fakeTool,
  foundKingdom,
  gitRepo,
  isolatedPath,
  pathWithoutGit,
  printed,
  run,
  tempDir,
  testIo,
} from '../../test/cli.ts';
import { toolPaths } from './doctor.ts';
import { locateTool } from './locate-tool.ts';
import { parseVersion } from './tool-version.ts';
import type { TempDir, TestIo } from '../../test/cli.ts';
import type { Kingdom } from '@elvaria/domain';

describe('parseVersion', () => {
  it.each([
    ['2.1.318 (Claude Code)\n', '2.1.318'],
    ['agy version 1.5.2\r\n', '1.5.2'],
    ['git version 2.56.0.windows.2', '2.56.0.windows.2'],
    ['\n  nightly build\n', 'nightly build'],
    ['', undefined],
  ])('%j → %j', (stdout, version) => {
    expect(parseVersion(stdout)).toBe(version);
  });
});

describe('toolPaths', () => {
  it('reads tribe=path pairs, a path may hold "="', () => {
    expect(toolPaths(['claude=C:/a=b/claude.exe'])).toEqual(new Map([['claude', 'C:/a=b/claude.exe']]));
    expect(toolPaths(['claude'])).toBeUndefined();
    expect(toolPaths(['=x'])).toBeUndefined();
  });
});

describe('elvaria doctor', () => {
  let dir: TempDir;
  let kingdom: string;
  let bin: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    bin = path.join(dir.root, 'bin');
    await fakeTool(bin, 'claude', '2.1.318 (Claude Code)');
    await fakeTool(bin, 'agy', '1.5.2');
  });
  afterEach(() => dir.remove());

  const readKingdom = async (): Promise<Kingdom> =>
    KingdomSchema.parse(JSON.parse(await readFile(path.join(kingdom, 'kingdom.json'), 'utf8')));
  const writeKingdom = (value: Kingdom) =>
    writeFile(path.join(kingdom, 'kingdom.json'), JSON.stringify(value));
  const doctorIo = async (...dirs: string[]): Promise<TestIo> =>
    testIo({ env: baseEnv(await isolatedPath(...dirs)) });
  const doctor = (io: TestIo, ...args: string[]) =>
    run(io, 'doctor', ...args, '--kingdom', kingdom, '--locale', 'en');

  it('pins each tribe’s CLI and refuses Antigravity until its terms are acknowledged (ADR 0018)', async () => {
    const io = await doctorIo(bin);
    expect(await doctor(io)).toBe(1);
    const text = printed(io);
    expect(text).toContain('✓ Registry: 11 quest kinds, 11 classes, 11 rituals, 5 scripts, 7 tags.');
    expect(text).toContain('! The registry names 11 files the kingdom does not have');
    expect(text).toMatch(/✓ git \d+\.\d+/);
    expect(text).toContain('✓ Tribe claude: ');
    expect(text).toContain("✗ Tribe gemini: Antigravity's terms are not acknowledged");
    expect(text).toContain('Not ready: 1 errors.');
    const [claude, gemini] = (await readKingdom()).tribes;
    expect(claude?.tool).toEqual({ path: claude?.tool?.path, version: '2.1.318', auth: 'login' });
    expect(claude?.tool?.path).toMatch(/\/bin\/claude(\.cmd)?$/);
    expect(gemini?.tool).toMatchObject({ version: '1.5.2', auth: 'login' });
    expect(gemini?.tool?.terms_acknowledged_at).toBeUndefined();

    const acknowledged = await doctorIo(bin);
    expect(await doctor(acknowledged, '--acknowledge-terms', 'gemini')).toBe(0);
    expect(printed(acknowledged)).toContain('Ready.');
    expect((await readKingdom()).tribes[1]?.tool?.terms_acknowledged_at).toBe('2026-11-06T09:00:00+07:00');
  });

  it('keeps a pinned version when the CLI changed, until --pin', async () => {
    await doctor(await doctorIo(bin), '--acknowledge-terms', 'gemini');
    await fakeTool(bin, 'claude', '2.1.400 (Claude Code)');
    const changed = await doctorIo(bin);
    expect(await doctor(changed)).toBe(0);
    expect(printed(changed)).toContain('! Tribe claude: found version 2.1.400');
    expect(printed(changed)).toContain('elvaria doctor --pin');
    expect((await readKingdom()).tribes[0]?.tool?.version).toBe('2.1.318');
    expect(await doctor(await doctorIo(bin), '--pin')).toBe(0);
    expect((await readKingdom()).tribes[0]?.tool?.version).toBe('2.1.400');
  });

  it('finds a CLI the owner points at, then uses the pinned path without PATH', async () => {
    const elsewhere = path.join(dir.root, 'vscode extension');
    const claude = await fakeTool(elsewhere, 'claude', '2.1.318');
    expect(
      await doctor(
        await doctorIo(),
        '--tool',
        `claude=${claude}`,
        '--tool',
        `gemini=${path.join(bin, 'nope')}`,
      ),
    ).toBe(1);
    expect((await readKingdom()).tribes[0]?.tool?.path).toBe(claude.replaceAll('\\', '/'));
    const pinned = await doctorIo();
    await doctor(pinned);
    expect(printed(pinned)).toContain(`✓ Tribe claude: ${claude.replaceAll('\\', '/')}, version 2.1.318.`);
    expect(printed(pinned)).toContain('✗ Tribe gemini: agy was not found on PATH.');
  });

  it('fails while the pinned file is gone, e.g. after a VS Code extension update moved Claude Code', async () => {
    const old = await fakeTool(path.join(dir.root, 'claude-code-2.1.318'), 'claude', '2.1.318');
    await doctor(await doctorIo(bin), '--tool', `claude=${old}`, '--acknowledge-terms', 'gemini');
    await rm(path.dirname(old), { recursive: true, force: true });
    const moved = await doctorIo(bin);
    expect(await doctor(moved)).toBe(1);
    expect(printed(moved)).toContain(
      `✗ Tribe claude: the pinned ${old.replaceAll('\\', '/')} is gone; found `,
    );
    expect((await readKingdom()).tribes[0]?.tool?.path).toBe(old.replaceAll('\\', '/'));
    expect(await doctor(await doctorIo(bin), '--pin')).toBe(0);
    expect((await readKingdom()).tribes[0]?.tool?.path).toMatch(/\/bin\/claude(\.cmd)?$/);
  });

  it('says what is wrong with a tribe it cannot pin', async () => {
    const broken = path.join(dir.root, 'broken');
    await fakeTool(broken, 'claude', 'boom', 3);
    const value = await readKingdom();
    const tribes = [
      ...value.tribes,
      { id: 'codex', adapter: 'codex_cli', enabled: false, max_concurrent: 1 },
      { id: 'mine', adapter: 'adapters/mine.mjs', enabled: true, max_concurrent: 1 },
      { id: 'paid', adapter: 'gemini_cli', enabled: true, max_concurrent: 1 },
    ];
    await writeKingdom(KingdomSchema.parse({ ...value, tribes }));
    await fakeTool(bin, 'gemini', '0.67.0');
    const io = await doctorIo(broken, bin);
    expect(
      await doctor(
        io,
        '--tool',
        'paid=' + path.join(bin, process.platform === 'win32' ? 'gemini.cmd' : 'gemini'),
      ),
    ).toBe(1);
    const text = printed(io);
    expect(text).toContain('✗ Tribe claude: ');
    expect(text).toContain('does not answer --version.');
    expect(text).toContain('✓ Tribe codex is disabled; skipped.');
    expect(text).toContain('✗ Tribe mine: there is no adapter adapters/mine.mjs yet');
    expect(text).toContain('✗ Tribe paid: its settings are not valid once the tool is filled in:');
    expect(text).toContain('budget.usd_week: auth = api_key needs budget.usd_week');
  });

  it('asks the adapter about the login once the CLI is pinned (P1-09)', async () => {
    const loggedOut = path.join(dir.root, 'logged out');
    await fakeTool(loggedOut, 'claude', '2.1.318 (Claude Code)', 0, { loggedIn: false });
    const io = await doctorIo(loggedOut, bin);
    expect(await doctor(io, '--acknowledge-terms', 'gemini')).toBe(1);
    expect(printed(io)).toContain('✗ Tribe claude: not logged in: run `claude` once and sign in');
  });

  it('finds Claude Code inside the VS Code extension when PATH has none', async () => {
    const home = path.join(dir.root, 'home');
    const binary = path.join(
      home,
      '.vscode',
      'extensions',
      'anthropic.claude-code-2.1.318-x64',
      'resources',
      'native-binary',
      process.platform === 'win32' ? 'claude.exe' : 'claude',
    );
    await mkdir(path.dirname(binary), { recursive: true });
    await writeFile(binary, '', { mode: 0o755 });
    const io = testIo({ env: baseEnv(await isolatedPath(path.join(dir.root, 'empty'))), home });
    const [claude] = (await readKingdom()).tribes;
    expect(await locateTool(claude!, 'claude', undefined, io)).toEqual({ found: binary, from: 'path' });
    // The owner's home only: this machine's own extension folder never answers for a test.
    expect(await locateTool(claude!, 'claude', undefined, { ...io, home: dir.root })).toEqual({
      from: 'path',
    });
  });

  it('refuses a malformed --tool', async () => {
    const io = await doctorIo(bin);
    expect(await doctor(io, '--tool', 'claude')).toBe(2);
    expect(io.printed.err).toEqual(['--tool takes <tribe>=<path>, e.g. claude=C:/tools/claude.exe.']);
  });

  it('checks git, the registry and every territory', async () => {
    const repo = await gitRepo(path.join(dir.root, 'repo'));
    const notes = path.join(dir.root, 'notes');
    await mkdir(notes);
    const gone = await gitRepo(path.join(dir.root, 'gone'));
    const ungit = await gitRepo(path.join(dir.root, 'ungit'));
    for (const folder of [repo, notes, gone, ungit])
      await run(testIo(), 'territory', 'add', folder, '--kingdom', kingdom);
    await rm(gone, { recursive: true, force: true });
    await rm(path.join(ungit, '.git'), { recursive: true, force: true });
    await mkdir(path.join(kingdom, 'territories', 'bad'));
    await writeFile(path.join(kingdom, 'territories', 'bad', 'territory.json'), '{');
    const io = await doctorIo(bin);
    expect(await doctor(io)).toBe(1);
    const text = printed(io);
    expect(text).toContain('✓ Territory repo: ');
    expect(text).toContain('✓ Territory notes: ');
    expect(text).toContain('✗ Territory gone: the folder');
    expect(text).toContain('is gone.');
    expect(text).toContain('is no longer a git repo.');
    expect(text).toContain('✗ territories/bad/territory.json is not valid JSON.');

    await writeFile(
      path.join(kingdom, 'registry', 'tags.json'),
      JSON.stringify({ version: 1, tags: 'none' }),
    );
    const noGit = testIo({ env: { PATH: pathWithoutGit() } });
    expect(await doctor(noGit)).toBe(1);
    const without = printed(noGit);
    expect(without).toContain('✗ The registry does not load:');
    expect(without).toContain('registry/tags.json tags: does not match its schema.');
    expect(without).toContain('✗ git was not found on PATH.');
    expect(without).toContain('! Territory repo: ');
    expect(without).toContain('its repo cannot be checked without git.');
  });
});
