// What `elvaria doctor` prints of an adapter's `doctor()` (contract infirmary-reason-codes §4.4): each coded note in
// the owner's language, the CLI's own words verbatim. Every code has a key in both locales.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { KingdomSchema, TribeSchema } from '@elvaria/domain';
import { hookCommand } from '@elvaria/hooks';
import { LOCALE_FILES, LOCALES, placeholdersOf, translator } from '@elvaria/i18n';
import { createCodexRunner } from '@elvaria/runner-codex';
import { DOCTOR_NOTES, DOCTOR_NOTE_PARAMS, doctorNoteOf } from '@elvaria/runner-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  baseEnv,
  fakeTool,
  foundKingdom,
  isolatedPath,
  printed,
  run,
  tempDir,
  testIo,
} from '../../test/cli.ts';
import { minimalEnv } from '../process/minimal-env.ts';
import { loginFindings } from './check-tribe.ts';
import { DOCTOR_NOTE_KEYS, infoText } from './note-text.ts';
import type { TempDir } from '../../test/cli.ts';
import type { MessageKey } from '@elvaria/i18n';

describe('doctor note keys', () => {
  it.each(DOCTOR_NOTES)('%s has a key in every locale, with exactly the code’s parameters', (code) => {
    const key: MessageKey = DOCTOR_NOTE_KEYS[code];
    expect(key).toBe(`cli.doctor.note.${code.slice('doctor:'.length)}`);
    for (const locale of LOCALES) {
      const template = LOCALE_FILES[locale].messages[key] ?? '';
      expect(template).not.toBe('');
      expect(placeholdersOf(template).toSorted()).toEqual([...DOCTOR_NOTE_PARAMS[code]].toSorted());
    }
  });

  it('joins the notes translated and the CLI’s words verbatim with "; "', () => {
    const t = translator('vi');
    const note = doctorNoteOf('doctor:no_version', { command: 'x --version' });
    expect(infoText(t, { notes: [note], detail: 'boom: "Not logged in"' })).toBe(
      `${t('cli.doctor.note.no_version', { command: 'x --version' })}; boom: "Not logged in"`,
    );
    expect(infoText(t, { detail: 'only words' })).toBe('only words');
    expect(infoText(t, {})).toBeUndefined();
  });
});

/** An adapter file that says part of its trouble coded and part in its own words, and one that only has words. */
const adapterFile = (doctor: string): string => `export const createAdapter = (kit) => ({
  tribe: kit.tribe.id,
  adapter: kit.tribe.adapter,
  capabilities: {
    headless: true, context_file: true, events: true, tool_gate: true, usage: true,
    structured_output: true, resume: false, compact: false, subagent: false, auth: ['login'],
  },
  spawn: () => Promise.reject(new Error('no session in this spec')),
  probe: () => Promise.resolve({ status: 'ok' }),
  doctor: () => Promise.resolve(${doctor}),
});
`;

describe('elvaria doctor --locale vi', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const doctor = async (extra: readonly object[], ...bins: string[]) => {
    const io = testIo({ env: baseEnv(await isolatedPath(...bins)) });
    const value = KingdomSchema.parse(JSON.parse(await readFile(path.join(kingdom, 'kingdom.json'), 'utf8')));
    const tribes = [...value.tribes, ...extra];
    await writeFile(path.join(kingdom, 'kingdom.json'), JSON.stringify({ ...value, tribes }));
    await run(io, 'doctor', '--acknowledge-terms', 'gemini', '--kingdom', kingdom, '--locale', 'vi');
    return printed(io);
  };

  it('says Claude Code’s trouble in Vietnamese', async () => {
    const bin = path.join(dir.root, 'logged out');
    await fakeTool(bin, 'claude', '2.1.318 (Claude Code)', 0, { loggedIn: false });
    const text = await doctor([], bin);
    expect(text).toContain('Tộc claude: claude auth status --json cho thấy chưa đăng nhập (hoặc mất mạng)');
    expect(text).toContain('đăng nhập bằng claude auth login.');
    expect(text).not.toContain('not signed in');
  });

  it('says an adapter file’s notes in Vietnamese and prints its plain detail as it is', async () => {
    await mkdir(path.join(kingdom, 'adapters'));
    const coded = `{ path: '/opt/coded', version: '1.0.0', auth_ok: false,
      notes: [{ code: 'doctor:no_version', params: { command: 'coded --version' } }],
      detail: 'server said: Not logged in' }`;
    const plain = `{ path: '/opt/plain', version: '1.0.0', auth_ok: false, detail: 'Not logged in, try later' }`;
    await writeFile(path.join(kingdom, 'adapters', 'coded.mjs'), adapterFile(coded));
    await writeFile(path.join(kingdom, 'adapters', 'plain.mjs'), adapterFile(plain));
    const bin = path.join(dir.root, 'bin');
    await fakeTool(bin, 'claude', '2.1.318 (Claude Code)');
    const text = await doctor(
      [
        { id: 'coded', adapter: 'adapters/coded.mjs', enabled: true, max_concurrent: 1 },
        { id: 'plain', adapter: 'adapters/plain.mjs', enabled: true, max_concurrent: 1 },
      ],
      bin,
    );
    // The kit may add a note of its own (a hook not built here); the coded one comes before the words.
    expect(text).toMatch(/Tộc coded: coded --version không in phiên bản\.;.*server said: Not logged in/);
    expect(text).toMatch(/Tộc plain: .*Not logged in, try later/);
  });
});

describe('the Codex adapter’s doctor, as the CLI prints it', () => {
  it('says a signed-out Codex in Vietnamese, with the login command and the CLI named verbatim', async () => {
    const root = path.resolve(import.meta.dirname, '..', '..', '..', '..');
    const fake = path.join(root, 'packages', 'runner-codex', 'fixtures', 'fake-codex.mjs');
    const tribe = TribeSchema.parse({ id: 'codex', adapter: 'codex_cli', enabled: true, max_concurrent: 1 });
    // The fake's switch is not in codexRunner's minimal env, so the adapter is built with it here.
    const env = { ...minimalEnv(baseEnv(await isolatedPath())), ELVARIA_FAKE_CODEX_LOGGED_OUT: '1' };
    const launch = { command: process.execPath, args: [fake] };
    const runner = createCodexRunner({ tribe: tribe.id, launch, hook: hookCommand(), env });
    const [found] = await loginFindings(tribe, runner, { t: translator('vi') });
    expect(found?.level).toBe('error');
    expect(found?.text).toContain(
      'codex login status cho thấy chưa đăng nhập (hoặc mất mạng): đăng nhập bằng codex login.',
    );
  });
});
