// `elvaria doctor` on delivery (PS-08, ADR 0023): for a territory whose delivery pushes, a remote on the forge, a
// credential git gives without asking (fake helper), and the right to push (fake fetch); nothing for manual. Neither
// the token nor the account's name reaches the output or the kingdom's files.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { translator } from '@elvaria/i18n';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  baseEnv,
  foundKingdom,
  git,
  gitRepo,
  isolatedPath,
  printed,
  run,
  tempDir,
  testIo,
} from '../../test/cli.ts';
import { FAKE_TOKEN, FAKE_USER, GITHUB_REMOTE, filesHolding, useFakeHelper } from '../../test/credential.ts';
import { accessFinding, credentialFinding } from './check-delivery.ts';
import type { TempDir } from '../../test/cli.ts';
import type { HelperAnswer } from '../../test/credential.ts';
import type { Fetch } from '../io.ts';

const pushes: Fetch = () => Promise.resolve(Response.json({ permissions: { push: true } }));
const readsOnly: Fetch = () => Promise.resolve(Response.json({ permissions: { push: false } }));
const offline: Fetch = () => Promise.reject(new TypeError('fetch failed'));

// A delivery line starts with its mark and "Territory <id>", then names the mode or asks about the forge. The
// filter reads that start alone: matching words anywhere caught the Build line of a checkout whose path held
// "push", and other territory lines (its folder, git identity) carry paths too (222).
const DELIVERY_LINE =
  /^[✓✗!] Territory \S+(?: delivers by | \(|: (?:git gave|github\.com|that account|could not ask))/u;

describe('elvaria doctor: delivery (PS-08)', () => {
  let dir: TempDir;
  let kingdom: string;
  let home: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    home = path.join(dir.root, 'home');
    await mkdir(home);
  });
  afterEach(() => dir.remove());

  /** A territory attached by the CLI from a repo with `remote` as origin, its git asking the fake helper. */
  async function territory(id: string, answer: HelperAnswer, remote = GITHUB_REMOTE): Promise<string> {
    const repo = await gitRepo(path.join(dir.root, `repo ${id}`));
    git(repo, 'remote', 'add', 'origin', remote);
    await useFakeHelper(repo, dir.root, answer);
    await run(testIo(), 'territory', 'add', repo, '--id', id, '--kingdom', kingdom);
    return repo;
  }

  const setMode = async (id: string, mode: string) => {
    const io = testIo();
    if ((await run(io, 'territory', 'delivery', id, '--mode', mode, '--kingdom', kingdom)) !== 0)
      throw new Error(printed(io));
  };

  const doctor = async (fetch: Fetch = pushes) => {
    const asked: string[] = [];
    const counting: Fetch = (input, init) => {
      asked.push(new Headers(init?.headers).get('Authorization') ?? '');
      return fetch(input, init);
    };
    const env = { ...baseEnv(await isolatedPath()), HOME: home, USERPROFILE: home };
    const io = testIo({ env, home, fetch: counting });
    await run(io, 'doctor', '--kingdom', kingdom, '--locale', 'en');
    const text = printed(io);
    // The doctor prints no token and no account name, and leaves neither in the kingdom.
    expect(text.includes(FAKE_TOKEN)).toBe(false);
    expect(text).not.toContain(FAKE_USER);
    expect(await filesHolding(kingdom, FAKE_TOKEN)).toEqual([]);
    return {
      text,
      lines: text.split('\n').filter((line) => DELIVERY_LINE.test(line)),
      asked,
    };
  };

  it('says nothing about a territory that delivers by hand, written or not', async () => {
    await territory('elvaria', 'token');
    await territory('notes', 'token');
    await setMode('notes', 'manual');
    const { lines, asked } = await doctor();
    expect(lines).toEqual([]);
    expect(asked).toEqual([]);
  });

  it('finds the credential and the right to push, sending the token to the forge alone', async () => {
    await territory('elvaria', 'token');
    await setMode('elvaria', 'pr');
    const { lines, asked } = await doctor();
    expect(lines).toEqual([
      '✓ Territory elvaria (pr): git has a credential for github.com.',
      '✓ Territory elvaria: github.com lets that account push to elvaria-specs/kingdom-repo.',
    ]);
    expect(asked.length).toBe(1);
    expect(asked[0] === `Bearer ${FAKE_TOKEN}`).toBe(true);
  });

  it('fails without a credential, and says how to sign in', async () => {
    await territory('elvaria', 'nothing');
    await setMode('elvaria', 'pr_merge');
    const { text, asked } = await doctor();
    expect(text).toContain(
      '✗ Territory elvaria delivers by pr_merge, but git has no credential for github.com: the Steward could not push to elvaria-specs/kingdom-repo.',
    );
    expect(text).toContain('Sign in once from a terminal');
    expect(asked).toEqual([]);
  });

  it('fails when the account may read the repo but not push to it', async () => {
    await territory('elvaria', 'token');
    await setMode('elvaria', 'pr');
    const { text } = await doctor(readsOnly);
    expect(text).toContain('✓ Territory elvaria (pr): git has a credential for github.com.');
    expect(text).toContain(
      '✗ Territory elvaria: that account can read elvaria-specs/kingdom-repo on github.com but not push',
    );
  });

  it('only warns when the forge cannot be asked', async () => {
    await territory('elvaria', 'token');
    await setMode('elvaria', 'pr');
    const { text } = await doctor(offline);
    expect(text).toContain(
      '! Territory elvaria: could not ask github.com about elvaria-specs/kingdom-repo (fetch failed)',
    );
  });

  it('fails on a remote that names no repo on the forge, written by hand', async () => {
    await territory('lab', 'token', 'https://gitlab.com/team/repo.git');
    const file = path.join(kingdom, 'territories', 'lab', 'territory.json');
    const value = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
    await writeFile(file, JSON.stringify({ ...value, delivery: { mode: 'pr' } }));
    const { text } = await doctor();
    expect(text).toContain(
      '✗ Territory lab delivers by pr, but its remote «https://gitlab.com/team/repo.git» names no repo on github: nothing can be pushed.',
    );
  });
});

describe('the lines of a delivery check', () => {
  const subject = { id: 'elvaria', mode: 'pr', host: 'github.com', repo: 'owner/repo' };
  const ctxOn = (platform: NodeJS.Platform) => ({ t: translator('en'), io: testIo({ platform }) });

  it('tells a macOS owner to let git read the Keychain when the call was stopped', () => {
    const line = credentialFinding(ctxOn('darwin'), subject, 'timeout');
    expect(line.level).toBe('error');
    expect(line.text).toBe(
      'Territory elvaria: git gave no credential for github.com within 10 s and was stopped.',
    );
    expect(line.details?.[0]).toContain('choose Always Allow');
  });

  it('tells others the machine was busy or a window waits', () => {
    expect(credentialFinding(ctxOn('win32'), subject, 'timeout').details?.[0]).toContain('A busy machine');
  });

  it('names a missing git', () => {
    expect(credentialFinding(ctxOn('linux'), subject, 'no_git').text).toContain('git does not run there');
  });

  it.each([
    [{ kind: 'refused', status: 401 } as const, 'error', 'refused the credential for owner/repo (HTTP 401)'],
    [{ kind: 'not_found' } as const, 'error', 'shows that account no repo owner/repo'],
  ])('reads %j', (access, level, words) => {
    const line = accessFinding(ctxOn('win32'), subject, access);
    expect(line.level).toBe(level);
    expect(line.text).toContain(words);
  });
});
