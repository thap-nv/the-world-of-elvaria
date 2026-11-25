// The pre-commit secret scan. Fake tokens are put together at run time, so neither this gate nor the pre-push scan
// takes the spec's own source for a leak. The end-to-end cases run in real git repos in a temp folder whose name has a
// space, with git run without the caller's GIT_* variables (implementation-plan §6).
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadPatterns, scanStaged } from './scan-staged-secrets.mjs';

const SCRIPT = path.join(import.meta.dirname, 'scan-staged-secrets.mjs');

/** A body no pattern or message of the script could print by itself: a leak shows as a hit on this. */
const BODY = ['Zq9Xw8', 'Vu7Ts6', 'Rq5Po4', 'Nm3Lk2'].join('');

const PEM_NAME = 'RSA PRIVATE KEY-----';

/** One fake secret per specific pattern of redact-patterns.json, keyed by the pattern id. */
const SPECIFIC_TOKENS: Record<string, string> = {
  private_key: ['-----BEGIN ', PEM_NAME, '\n', BODY, '\n-----END ', PEM_NAME].join(''),
  jwt: ['eyJ', 'hbGciOiJIUzI1NiJ9', '.eyJ', 'zdWIiOiJmYWtlIn0', '.', BODY].join(''),
  anthropic_api_key: ['sk-ant-', 'api03-', BODY, BODY].join(''),
  openai_api_key: ['sk-proj-', BODY, BODY].join(''),
  google_api_key: ['AIza', BODY, BODY.slice(0, 11)].join(''),
  github_fine_grained_token: ['github_pat_', BODY, BODY].join(''),
  github_token: ['ghp_', BODY, BODY].join(''),
  slack_token: ['xoxb-', '123456789012-', BODY].join(''),
  aws_access_key_id: ['AKIA', BODY.slice(0, 16).toUpperCase()].join(''),
};

/** One fake value for each of the three shared patterns, which only warn. */
const SHARED_VALUES: Record<string, string> = {
  bearer_token: `Authorization: Bearer ${BODY}`,
  url_credentials: ['postgres://app', ':', BODY, '@db.example'].join(''),
  secret_assignment: `const token = "${BODY}";`,
};

const entries = loadPatterns();

describe('scanStaged', () => {
  it('has a fake secret for every specific pattern of the file, and one for every shared one', () => {
    const specificIds = entries
      .filter((e: { warn_only?: boolean }) => !e.warn_only)
      .map(({ id }: { id: string }) => id);
    const warnIds = entries
      .filter((e: { warn_only?: boolean }) => e.warn_only)
      .map(({ id }: { id: string }) => id);
    expect(specificIds.toSorted()).toEqual(Object.keys(SPECIFIC_TOKENS).toSorted());
    expect(warnIds.toSorted()).toEqual(Object.keys(SHARED_VALUES).toSorted());
  });

  it('treats a pattern missing warn_only as blocking', () => {
    const custom = [{ id: 'legacy_pattern', regex: 'LEGACY_[0-9]+', flags: '' }];
    const result = scanStaged([{ path: 'src/a.ts', content: 'LEGACY_123456\n' }], custom);
    expect(result.blocked).toEqual([{ file: 'src/a.ts', line: 1, pattern: 'legacy_pattern' }]);
    expect(result.warned).toEqual([]);
  });

  it.each(Object.entries(SPECIFIC_TOKENS))('blocks %s with its file, line and pattern', (id, token) => {
    const result = scanStaged([{ path: 'src/a.ts', content: `const ok = 1;\n// x\n${token}\n` }], entries);
    expect(result.blocked).toContainEqual({ file: 'src/a.ts', line: 3, pattern: id });
  });

  it.each(Object.entries(SHARED_VALUES))('only warns of %s', (id, value) => {
    const result = scanStaged([{ path: 'docs/x.md', content: `${value}\n` }], entries);
    expect(result.blocked).toEqual([]);
    expect(result.warned).toContainEqual({ file: 'docs/x.md', line: 1, pattern: id });
  });

  it('lets a clean file through', () => {
    const content = 'export const answer = 42;\n// api key: set it in the treasury\n';
    expect(scanStaged([{ path: 'src/clean.ts', content }], entries)).toEqual({ blocked: [], warned: [] });
  });

  it('skips a binary file and a deleted one, whatever they hold', () => {
    const token = SPECIFIC_TOKENS.anthropic_api_key ?? '';
    const content = Buffer.concat([Buffer.from([0x89, 0x50, 0]), Buffer.from(token)]);
    const files = [
      { path: 'logo.png', content },
      { path: 'gone.ts', content: null },
    ];
    expect(scanStaged(files, entries)).toEqual({ blocked: [], warned: [] });
  });

  it('names each file once per pattern and keeps the files apart', () => {
    const token = SPECIFIC_TOKENS.github_token ?? '';
    const result = scanStaged(
      [
        { path: 'one.txt', content: `${token}\n${token}\n` },
        { path: 'two.txt', content: `\n${token}` },
      ],
      entries,
    );
    expect(result.blocked).toEqual([
      { file: 'one.txt', line: 1, pattern: 'github_token' },
      { file: 'two.txt', line: 2, pattern: 'github_token' },
    ]);
  });
});

/** What git and node need, without the GIT_* variables a hook exports. */
function testEnv(): Record<string, string> {
  const keys = ['SystemRoot', 'HOME', 'USERPROFILE', 'TEMP', 'TMP', 'TMPDIR'];
  const env = Object.fromEntries(keys.flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : [])));
  return { ...env, PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ''}` };
}

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', env: testEnv(), stdio: 'pipe' }).trim();

/** The script as `.husky/pre-commit` runs it, in `cwd`. */
function scan(cwd: string): { status: number | null; out: string } {
  const run = spawnSync(process.execPath, [SCRIPT], { cwd, encoding: 'utf8', env: testEnv() });
  return { status: run.status, out: `${run.stdout}${run.stderr}` };
}

describe('the script, in a repo', () => {
  let root = '';
  let temp: TempDir;
  let repo = '';

  beforeEach(async () => {
    temp = await tempDir('elvaria scan');
    root = temp.root;
    repo = path.join(root, 'repo');
    await mkdir(repo);
    git(repo, 'init', '-q');
    git(repo, 'config', 'user.name', 'Test');
    git(repo, 'config', 'user.email', 'test@example.invalid');
    git(repo, 'config', 'core.autocrlf', 'false');
  });

  afterEach(async () => {
    await temp.remove();
  });

  const put = (file: string, text: string): Promise<void> => writeFile(path.join(repo, file), text);

  it('stops a commit that stages a fake token and names its file and pattern, never the token', async () => {
    const token = SPECIFIC_TOKENS.anthropic_api_key ?? '';
    await mkdir(path.join(repo, 'dir with space'));
    await put('dir with space/key.ts', `export const key = '${token}';\n`);
    await put('clean.ts', 'export const a = 1;\n');
    git(repo, 'add', '--all');
    const { status, out } = scan(repo);
    expect(status).toBe(1);
    expect(out).toContain('dir with space/key.ts:1: anthropic_api_key');
    expect(out).not.toContain('clean.ts');
    expect(out).not.toContain(BODY.slice(0, 4));
    expect(out).not.toContain('sk-ant');
  });

  it('passes a commit of clean files', async () => {
    await put('clean.ts', 'export const a = 1;\n');
    git(repo, 'add', '--all');
    expect(scan(repo)).toEqual({ status: 0, out: '' });
  });

  it('warns of a shared pattern, names the file and the pattern, and lets the commit go', async () => {
    await put('auth.ts', `${SHARED_VALUES.secret_assignment}\n`);
    git(repo, 'add', '--all');
    const { status, out } = scan(repo);
    expect(status).toBe(0);
    expect(out).toContain('auth.ts:1: secret_assignment');
    expect(out).not.toContain(BODY.slice(0, 4));
  });

  it('reads the staged version, not the working tree', async () => {
    const token = SPECIFIC_TOKENS.github_token ?? '';
    await put('a.txt', `${token}\n`);
    git(repo, 'add', 'a.txt');
    await put('a.txt', 'cleaned after staging\n');
    expect(scan(repo).status).toBe(1);

    await put('a.txt', 'clean\n');
    git(repo, 'add', 'a.txt');
    await put('a.txt', `${token}\n`);
    expect(scan(repo)).toEqual({ status: 0, out: '' });
  });

  it('skips a deleted file and a binary one', async () => {
    const token = SPECIFIC_TOKENS.anthropic_api_key ?? '';
    await put('old.txt', `${token}\n`);
    git(repo, 'add', 'old.txt');
    git(repo, 'commit', '-q', '-m', 'old');
    git(repo, 'rm', '-q', 'old.txt');
    await writeFile(path.join(repo, 'blob.bin'), Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(token)]));
    git(repo, 'add', 'blob.bin');
    expect(scan(repo)).toEqual({ status: 0, out: '' });
  });
});
