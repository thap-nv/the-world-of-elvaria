import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { TerritorySchema } from '@elvaria/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  baseEnv,
  foundKingdom,
  gitRepo,
  isolatedPath,
  printed,
  run,
  tempDir,
  testIo,
} from '../../test/cli.ts';
import { territoryCommands } from './check-commands.ts';
import type { TempDir } from '../../test/cli.ts';

/** A program no machine has: `sh` would be found on macOS and Linux, where git's folder is /usr/bin. */
const ABSENT = 'elvaria-no-such-program';

const check = (id: string, run: string | string[], extra: Record<string, unknown> = {}) => ({
  id,
  run,
  when: ['**'],
  timeout_minutes: 5,
  ...extra,
});

describe('territoryCommands', () => {
  it('lists commands.* first, then each check’s run and cleanup, a list command by command', () => {
    const territory = TerritorySchema.parse({
      version: 1,
      id: 'dc1',
      name: 'DC1',
      path: 'D:/dc1',
      kind: 'code',
      vcs: { type: 'none' },
      commands: {
        setup: 'pnpm install',
        reset: ['sh init.sh', 'docker compose down -v'],
        generate: ['pnpm schemas'],
      },
      checks: [
        check('e2e', ['sh init.sh', 'pnpm e2e'], { cleanup: 'pnpm e2e:down' }),
        check('lint', 'pnpm lint'),
      ],
    });
    expect(territoryCommands(territory)).toEqual([
      { field: 'commands.setup', line: 'pnpm install' },
      { field: 'commands.reset', line: 'sh init.sh' },
      { field: 'commands.reset', line: 'docker compose down -v' },
      { field: 'commands.generate', line: 'pnpm schemas' },
      { field: 'checks.e2e.run', line: 'sh init.sh' },
      { field: 'checks.e2e.run', line: 'pnpm e2e' },
      { field: 'checks.e2e.cleanup', line: 'pnpm e2e:down' },
      { field: 'checks.lint.run', line: 'pnpm lint' },
    ]);
  });
});

describe('elvaria doctor: the programs of territory commands (P1-41)', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  /** A territory attached by the CLI, then given these commands and checks by hand, as owners fill them. */
  async function territory(name: string, fill: Record<string, unknown>): Promise<void> {
    const repo = await gitRepo(path.join(dir.root, name));
    await run(testIo(), 'territory', 'add', repo, '--kingdom', kingdom);
    const file = path.join(kingdom, 'territories', name, 'territory.json');
    const value = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
    await writeFile(file, JSON.stringify({ ...value, ...fill }));
  }

  const doctor = async (...dirs: string[]) => {
    const io = testIo({ env: baseEnv(await isolatedPath(...dirs)) });
    const code = await run(io, 'doctor', '--kingdom', kingdom, '--locale', 'en');
    return { code, text: printed(io) };
  };

  it('names each program the Steward cannot find, with the commands and the territory', async () => {
    await territory('dc1', {
      commands: { setup: 'node --version', reset: [`${ABSENT} infra/init.sh`, 'git status'] },
      checks: [
        check('e2e', [`${ABSENT} infra/init.sh`, 'node e2e.mjs'], { cleanup: 'git clean -fdx' }),
        check('drift', 'node gen.mjs | git diff --exit-code'),
      ],
    });
    await territory('notes', {
      commands: { setup: 'node --version' },
      checks: [check('lint', 'git diff --check')],
    });
    const { code, text } = await doctor();
    expect(code).toBe(1);
    expect(text).toContain(
      [
        `✗ Territory dc1: ${ABSENT} is not on PATH, so these commands cannot start:`,
        `    commands.reset: ${ABSENT} infra/init.sh`,
        `    checks.e2e.run: ${ABSENT} infra/init.sh`,
        '    doctor looks on the PATH of the shell it runs in, as elvaria run does',
      ].join('\n'),
    );
    expect(text).toContain(
      [
        '✗ Territory dc1: these commands hold shell syntax (a pipe, &&, $VAR, a redirection, an unclosed quote); the Steward runs commands without a shell, so they cannot start:',
        '    checks.drift.run: node gen.mjs | git diff --exit-code',
      ].join('\n'),
    );
    expect(text).not.toMatch(/✗ Territory dc1: (node|git) /);
    expect(text).toContain('✓ Territory notes: the programs of its 2 commands are on PATH (node, git).');
  });

  it('says nothing of a territory without commands', async () => {
    await territory('bare', {});
    const { text } = await doctor();
    expect(text).toContain('✓ Territory bare: ');
    expect(text).not.toContain('Territory bare: the programs');
  });

  it.runIf(process.platform === 'win32')(
    'names a .bat on PATH that only a shell can start (Windows)',
    async () => {
      const bin = path.join(dir.root, 'bin');
      await mkdir(bin);
      await writeFile(path.join(bin, 'legacy.bat'), '@echo legacy\r\n');
      await territory('old', { checks: [check('legacy', 'legacy --all')] });
      const { code, text } = await doctor(bin);
      expect(code).toBe(1);
      expect(text).toContain(
        `✗ Territory old: legacy is ${path.join(bin, 'legacy.bat')}, which only a shell can start`,
      );
      expect(text).toContain('    checks.legacy.run: legacy --all');
    },
  );
});
