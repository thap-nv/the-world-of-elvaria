import { mkdir, mkdtemp, open, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { TerritorySchema } from '@elvaria/domain';
import { inKingdom } from '@elvaria/store';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RM_TEMP } from '../__fixtures__/temp.ts';
import { TEST_HOST } from '../__fixtures__/git-repo.ts';
import { maskLogFile, maskedOnClose } from './masked-log.ts';
import { runCheck } from './run-checks.ts';

/** A GitHub token's shape, put together at run time so no scanner flags the repo. */
const TOKEN = ['gh', 'p_', 'abcdefghijklmnopqrstuvwxyz0123456789'].join('');
const KNOWN = ['plain', '-FAKE-', 'treasury-value-77'].join('');

let root = '';
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'elvaria masked log '));
});
afterAll(() => rm(root, RM_TEMP));

describe('the log of a check', () => {
  it('keeps what the command printed, its secrets masked (ADR 0013)', async () => {
    const kingdom = path.join(root, 'my kingdom');
    const plot = path.join(root, 'plot');
    await mkdir(plot, { recursive: true });
    // The test of a territory that prints a token it read from a fixture file.
    await writeFile(path.join(plot, 'leaky.mjs'), `console.log('fixture token: ${TOKEN}');\n`);
    const territory = TerritorySchema.parse({
      version: 1,
      id: 'dc1',
      name: 'dc1',
      path: '/repos/dc1',
      kind: 'code',
      vcs: { type: 'none' },
      checks: [{ id: 'unit', run: 'node leaky.mjs', when: ['**'], timeout_minutes: 1 }],
    });
    const check = territory.checks[0]!;
    const request = {
      kingdom,
      territory,
      touched: ['a.ts'],
      cwd: plot,
      run_dir: '.runs/q_20261107_a1b2c3-1',
    };
    const run = await runCheck(check, request, TEST_HOST);
    expect(run.pass).toBe(true);
    const text = await readFile(inKingdom(kingdom, run.log_path), 'utf8');
    expect(text).toContain('$ node leaky.mjs');
    expect(text).toContain('fixture token: [redacted]');
    expect(text).not.toContain(TOKEN);
  });

  it("gets the quest's secrets in its env, and its log keeps none of their values (P1-10b)", async () => {
    const kingdom = path.join(root, 'my kingdom');
    const plot = path.join(root, 'plot');
    await mkdir(plot, { recursive: true });
    // An install from a private registry: it fails without the token, and a careless one prints it.
    await writeFile(
      path.join(plot, 'install.mjs'),
      [
        'const token = process.env.NPM_TOKEN;',
        "if (token === undefined) { console.log('no NPM_TOKEN'); process.exit(1); }",
        'console.log(`registry login with ${token}, again ${token}`);',
      ].join('\n'),
    );
    const territory = TerritorySchema.parse({
      version: 1,
      id: 'dc1',
      name: 'dc1',
      path: '/repos/dc1',
      kind: 'code',
      vcs: { type: 'none' },
      checks: [{ id: 'install', run: 'node install.mjs', when: ['**'], timeout_minutes: 1 }],
    });
    const check = territory.checks[0]!;
    const base = { kingdom, territory, touched: ['a.ts'], cwd: plot };

    const given = await runCheck(
      check,
      { ...base, run_dir: '.runs/q_20261107_d4e5f6-1', secrets: { npm_token: KNOWN } },
      TEST_HOST,
    );
    expect(given.pass).toBe(true);
    const text = await readFile(inKingdom(kingdom, given.log_path), 'utf8');
    expect(text).toContain('registry login with [redacted], again [redacted]');
    expect(text.split(KNOWN)).toHaveLength(1);

    // A quest that asks for no secret: the check gets none.
    const none = await runCheck(check, { ...base, run_dir: '.runs/q_20261107_e5f6a7-1' }, TEST_HOST);
    expect(none.pass).toBe(false);
    expect(await readFile(inKingdom(kingdom, none.log_path), 'utf8')).toContain('no NPM_TOKEN');
  });
});

describe('maskLogFile', () => {
  it('masks known values and patterns, and leaves a clean log untouched', async () => {
    const file = path.join(root, 'some.log');
    await writeFile(file, `npm ok with ${KNOWN}\ngh said ${TOKEN}\n`);
    expect(await maskLogFile(file, [KNOWN])).toBe(true);
    expect(await readFile(file, 'utf8')).toBe('npm ok with [redacted]\ngh said [redacted]\n');
    const written = (await stat(file)).mtimeMs;
    expect(await maskLogFile(file)).toBe(false);
    expect((await stat(file)).mtimeMs).toBe(written);
  });
});

describe('maskedOnClose', () => {
  it('says on the last line when the log cannot be read back, and never fails the close', async () => {
    const dir = path.join(root, 'unreadable');
    await mkdir(dir, { recursive: true });
    const written = path.join(dir, 'written.log');
    // Masking reads a log that is not there: the note says so in its place.
    const missing = path.join(dir, 'missing.log');
    await maskedOnClose(await open(written, 'a'), missing, [KNOWN]).close();
    expect(await readFile(missing, 'utf8')).toMatch(/^elvaria: this log could not be masked: .*ENOENT/);
    // A folder where the log should be: neither the read nor the note can happen, and the close still resolves.
    await expect(maskedOnClose(await open(written, 'a'), dir).close()).resolves.toBeUndefined();
  });
});
