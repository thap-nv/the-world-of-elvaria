// What a territory's quests need from the machine (P1-56, (c) and (h) of the P1-50 report): Docker running when a
// command uses it, a git identity, `.claude/rules/` within `laws.patch_paths`; and `territory add` saying so for the
// rules. Each is a warning: a doctor that fails on a stopped Docker Desktop would say the kingdom is broken.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  baseEnv,
  fakeTool,
  foundKingdom,
  git,
  gitRepo,
  isolatedPath,
  printed,
  run,
  tempDir,
  testIo,
} from '../../test/cli.ts';
import type { TempDir } from '../../test/cli.ts';

describe('elvaria doctor: what the quests of a territory need of the machine (P1-56)', () => {
  let dir: TempDir;
  let kingdom: string;
  let home: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    // An empty home folder: the machine's own `~/.gitconfig` must not give a test repo an identity.
    home = path.join(dir.root, 'home');
    await mkdir(home);
  });
  afterEach(() => dir.remove());

  /** A territory attached by the CLI, then given these fields by hand, as owners fill them. */
  async function territory(name: string, fill: Record<string, unknown> = {}): Promise<string> {
    const repo = await gitRepo(path.join(dir.root, name));
    await run(testIo(), 'territory', 'add', repo, '--kingdom', kingdom);
    const file = path.join(kingdom, 'territories', name, 'territory.json');
    const value = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
    await writeFile(file, JSON.stringify({ ...value, ...fill }));
    return repo;
  }

  const doctor = async (...dirs: string[]) => {
    const env = { ...baseEnv(await isolatedPath(...dirs)), HOME: home, USERPROFILE: home };
    const io = testIo({ env, home });
    await run(io, 'doctor', '--kingdom', kingdom, '--locale', 'en');
    const text = printed(io);
    // This kingdom has no tribe CLI, so the doctor fails on that; what these checks add is a warning, never an error.
    const errors = text.split('\n').filter((line) => line.startsWith('✗'));
    expect(errors.filter((line) => /docker|user\.email|\.claude\/rules/i.test(line))).toEqual([]);
    return { text };
  };

  describe('the git identity of the repo', () => {
    it('warns when the repo has no user.email, with how to set one, and does not fail the doctor', async () => {
      const repo = await territory('dc1');
      const { text } = await doctor();
      expect(text).toContain('! Territory dc1: git has no user.email in the repo');
      expect(text).toContain(`git -C "${repo.replaceAll('\\', '/')}" config user.name "<name>"`);
      expect(text).not.toContain('Territory dc1: git has an identity');
    });

    it('is satisfied by the repo’s own identity', async () => {
      const repo = await territory('dc1');
      git(repo, 'config', 'user.email', 'owner@example.com');
      const { text } = await doctor();
      expect(text).toContain('✓ Territory dc1: git has an identity (user.email).');
      expect(text).not.toContain('git has no user.email');
    });

    it('is satisfied by the owner’s identity for every repo, and says nothing of a territory that is no repo', async () => {
      await territory('dc1');
      await writeFile(path.join(home, '.gitconfig'), '[user]\n\temail = owner@example.com\n');
      await mkdir(path.join(dir.root, 'notes'));
      await run(testIo(), 'territory', 'add', path.join(dir.root, 'notes'), '--kingdom', kingdom);
      const { text } = await doctor();
      expect(text).toContain('✓ Territory dc1: git has an identity (user.email).');
      expect(text).not.toContain('Territory notes: git');
    });
  });

  describe('.claude/rules/ and laws.patch_paths', () => {
    const planted = async (repo: string) => {
      await mkdir(path.join(repo, '.claude', 'rules', 'web'), { recursive: true });
      await writeFile(path.join(repo, '.claude', 'rules', 'api.md'), '# api\n');
      await writeFile(path.join(repo, '.claude', 'rules', 'web', 'forms.md'), '# forms\n');
    };

    it('names the rule files no glob of patch_paths covers, and the glob to add', async () => {
      await planted(await territory('dc1', { laws: { patch_paths: ['.husky/**', '.claude/rules/api.md'] } }));
      const { text } = await doctor();
      expect(text).toContain(
        [
          '! Territory dc1: 1 files under .claude/rules are not in laws.patch_paths; Claude Code cannot write them, so a character has to ask the owner instead of editing. Add ".claude/rules/**" to laws.patch_paths in territories/dc1/territory.json:',
          '    .claude/rules/web/forms.md',
        ].join('\n'),
      );
    });

    it('is satisfied by .claude/rules/** and says nothing of a repo without the folder', async () => {
      await planted(await territory('dc1', { laws: { patch_paths: ['.claude/rules/**'] } }));
      await territory('plain');
      const { text } = await doctor();
      expect(text).toContain('✓ Territory dc1: the 2 files under .claude/rules are all in laws.patch_paths.');
      expect(text).not.toContain('Territory plain: the');
      expect(text).not.toContain('Territory plain: 0');
    });

    it('is said by territory add, which has no patch_paths yet', async () => {
      const repo = await gitRepo(path.join(dir.root, 'dc1'));
      await planted(repo);
      const io = testIo();
      expect(await run(io, 'territory', 'add', repo, '--kingdom', kingdom, '--locale', 'en')).toBe(0);
      expect(io.printed.out.at(-1)).toBe(
        'Hint: the repo has 2 files under .claude/rules that Claude Code cannot write; add ".claude/rules/**" to laws.patch_paths in territories/dc1/territory.json so characters can change them as a patch.',
      );
      const plain = await gitRepo(path.join(dir.root, 'plain'));
      const quiet = testIo();
      expect(await run(quiet, 'territory', 'add', plain, '--kingdom', kingdom, '--locale', 'en')).toBe(0);
      expect(quiet.printed.out.join('\n')).not.toContain('Hint');
    });
  });

  describe('Docker', () => {
    const uses = { commands: { reset: 'docker compose down -v' } };

    it('says nothing when no territory has a command that uses docker', async () => {
      await territory('dc1', { commands: { reset: 'pnpm reset' } });
      const { text } = await doctor();
      expect(text.toLowerCase()).not.toContain('docker');
    });

    it('is satisfied by a daemon that answers, naming the territories that use it', async () => {
      await territory('dc1', { ...uses, checks: [] });
      await territory('web', {
        checks: [{ id: 'e2e', run: 'pnpm e2e:docker', when: ['**'], timeout_minutes: 5 }],
      });
      await territory('notes');
      const bin = path.dirname(await fakeTool(path.join(dir.root, 'bin'), 'docker', '27.4.1'));
      const { text } = await doctor(bin);
      expect(text).toContain(
        '✓ Docker is running (server 27.4.1); territories dc1, web have commands that use docker.',
      );
    });

    it('warns when the daemon does not answer, with the commands that need it', async () => {
      await territory('dc1', uses);
      const bin = path.dirname(await fakeTool(path.join(dir.root, 'bin'), 'docker', '', 1));
      const { text } = await doctor(bin);
      expect(text).toContain(
        [
          '! Docker is not running (docker info does not answer) and territories dc1 have commands that use docker: open Docker Desktop (or start the daemon) before elvaria run. With Docker off, resets and e2e checks fail on the environment: the Steward opens no judge and demotes nobody, but runs them again every 10 minutes until Docker is up.',
          '    dc1: commands.reset: docker compose down -v',
        ].join('\n'),
      );
    });

    // A command that starts with docker already has its own error, the missing program of P1-41; this line is for the
    // commands that reach docker through something else (`pnpm e2e:docker`).
    it('warns when there is no docker program, for a command that reaches it through another one', async () => {
      await territory('dc1', {
        checks: [{ id: 'e2e', run: 'node e2e.mjs --docker', when: ['**'], timeout_minutes: 5 }],
      });
      const { text } = await doctor();
      expect(text).toContain(
        '! The docker program is not on PATH, and territories dc1 have commands that use docker.',
      );
    });
  });
});
