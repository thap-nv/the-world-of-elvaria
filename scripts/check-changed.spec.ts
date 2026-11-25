// plan() and parseArgs() are pure and tested in memory; changedPaths() and the dry run use a real git repo in a temp
// folder whose name has a space, with git run without the caller's GIT_* variables (the pre-push hook that runs
// these tests exports GIT_DIR; implementation-plan §6).
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { changedPaths, DEFAULT_BASE, parseArgs, plan, pnpmInvocation, toolEnv } from './check-changed.mjs';

const SCRIPT = path.join(import.meta.dirname, 'check-changed.mjs');
const lines = (paths: string[]): string[] => plan(paths).commands.map((c) => c.join(' '));

describe('plan', () => {
  it('runs every package test and the typecheck for the domain', () => {
    expect(lines(['packages/domain/src/quest/transition.ts'])).toEqual([
      'test',
      'typecheck',
      'boundaries',
      'layout',
      'knip',
      'dup',
    ]);
  });

  it('runs the tests of the package and of every package that depends on it, in one pnpm run', () => {
    expect(lines(['packages/store/src/a.ts', 'packages/runner-core/src/b.ts', 'docs/cli.md'])).toEqual([
      '--filter ...@elvaria/store --filter ...@elvaria/runner-core test',
      'boundaries',
      'layout',
      'knip',
      'dup',
      'docs:check',
    ]);
  });

  it('runs one package test for another package, keyed by its folder', () => {
    expect(lines(['packages/runner-core/src/a.ts', 'packages/runner-core/src/b.ts'])).toEqual([
      '--filter ...@elvaria/runner-core test',
      'boundaries',
      'layout',
      'knip',
      'dup',
    ]);
    expect(lines(['apps/cli/src/cli.ts'])).toEqual([
      '--filter ...@elvaria/cli test',
      'boundaries',
      'layout',
      'knip',
      'dup',
    ]);
  });

  it('lets the full test and typecheck cover the narrower ones', () => {
    expect(lines(['packages/domain/src/a.ts', 'packages/store/src/b.ts', 'scripts/c.mjs'])).toEqual([
      'test',
      'typecheck',
      'boundaries',
      'layout',
      'knip',
      'dup',
    ]);
  });

  it('keeps the root vitest and tsc for scripts and hooks, and drops them only when covered', () => {
    expect(lines(['scripts/docs-gen.mjs'])).toEqual(['exec vitest run', 'exec tsc -p tsconfig.json', 'knip']);
    expect(lines(['.claude/hooks/guard-bash.mjs'])).toEqual([
      'exec vitest run',
      'exec tsc -p tsconfig.json',
      'knip',
    ]);
    expect(lines(['scripts/a.mjs', 'packages/domain/src/a.ts'])).toEqual([
      'knip',
      'test',
      'typecheck',
      'boundaries',
      'layout',
      'dup',
    ]);
  });

  it('checks docs and generated output for i18n', () => {
    expect(lines(['packages/i18n/src/glossary.json'])).toEqual([
      '--filter ...@elvaria/i18n test',
      'boundaries',
      'docs:gen --check',
      'docs:check',
      'i18n:check',
      'layout',
      'knip',
      'dup',
    ]);
  });

  it('treats documentation, including a package README, as docs:check only', () => {
    expect(lines(['docs/glossary.md', 'CLAUDE.md', '.claude/rules/domain.md'])).toEqual(['docs:check']);
    expect(lines(['packages/store/README.md'])).toEqual(['docs:check']);
  });

  it('checks the boundaries when a workspace manifest or the boundary table moves', () => {
    expect(lines(['packages/store/package.json'])).toEqual([
      '--filter ...@elvaria/store test',
      'boundaries',
      'docs:gen --check',
      'layout',
      'knip',
      'dup',
    ]);
    expect(lines(['packages/config/boundaries.mjs'])).toContain('boundaries');
  });

  it('checks the boundaries once for workspace code, where an import cycle inside one package can hide', () => {
    expect(lines(['packages/domain/src/quest/a.ts'])).toContain('boundaries');
    expect(lines(['packages/store/src/a.ts', 'packages/steward/src/b.ts', 'apps/cli/src/c.ts'])).toEqual([
      '--filter ...@elvaria/store --filter ...@elvaria/steward --filter ...@elvaria/cli test',
      'boundaries',
      'layout',
      'knip',
      'dup',
    ]);
    expect(lines(['packages/store/README.md'])).not.toContain('boundaries');
    expect(lines(['scripts/docs-gen.mjs', 'scripts/check-changed.mjs'])).not.toContain('boundaries');
  });

  it('checks the schemas when a contract or its output moves', () => {
    expect(lines(['docs/schemas/quest.schema.json'])).toEqual(['docs:check', 'schemas --check']);
    expect(lines(['packages/domain/src/schema/quest.ts'])).toEqual([
      'test',
      'typecheck',
      'boundaries',
      'layout',
      'schemas --check',
      'knip',
      'dup',
    ]);
  });

  it('runs knip for code, its config and the root manifest, not for documentation', () => {
    expect(lines(['knip.json'])).toEqual(['knip']);
    expect(lines(['package.json'])).toEqual(['knip']);
    expect(lines(['packages/store/src/io/atomic.ts'])).toEqual([
      '--filter ...@elvaria/store test',
      'boundaries',
      'layout',
      'knip',
      'dup',
    ]);
    expect(lines(['packages/store/README.md', 'docs/cli.md'])).not.toContain('knip');
  });

  it('runs dup for workspace code, the clone list and its detector, not for other scripts or documentation', () => {
    expect(lines(['shape-clones.json'])).toEqual(['dup']);
    expect(lines(['scripts/shape-detect.mjs'])).toEqual([
      'exec vitest run',
      'exec tsc -p tsconfig.json',
      'knip',
      'dup',
    ]);
    expect(lines(['scripts/docs-gen.mjs', 'packages/store/README.md'])).not.toContain('dup');
  });

  it('reports the paths no rule covers and has nothing to run for them', () => {
    expect(plan(['eslint.config.mjs', 'pnpm-lock.yaml'])).toEqual({
      commands: [],
      unmatched: ['eslint.config.mjs', 'pnpm-lock.yaml'],
    });
    expect(plan([])).toEqual({ commands: [], unmatched: [] });
  });
});

describe('parseArgs', () => {
  it('defaults to origin/main, runs for real, and reads both spellings of --base', () => {
    expect(parseArgs([])).toEqual({ base: DEFAULT_BASE, dryRun: false });
    expect(parseArgs(['--dry-run', '--base', 'dev'])).toEqual({ base: 'dev', dryRun: true });
    expect(parseArgs(['--base=v1'])).toEqual({ base: 'v1', dryRun: false });
  });

  it('refuses an unknown argument and a missing ref', () => {
    expect(parseArgs(['--nope'])).toHaveProperty('error');
    expect(parseArgs(['--base'])).toEqual({ error: '--base needs a ref' });
  });
});

describe('pnpmInvocation', () => {
  it('runs the script pnpm run named with node, so no .cmd shim and no shell', () => {
    expect(pnpmInvocation(['test'], { npm_execpath: 'C:/p/pnpm.cjs' }, 'win32')).toEqual({
      file: process.execPath,
      args: ['C:/p/pnpm.cjs', 'test'],
    });
    expect(pnpmInvocation(['test'], { npm_execpath: '/bin/pnpm' }, 'linux')).toEqual({
      file: '/bin/pnpm',
      args: ['test'],
    });
  });

  it('falls back to pnpm on PATH off Windows and refuses on Windows', () => {
    expect(pnpmInvocation(['test'], {}, 'linux')).toEqual({ file: 'pnpm', args: ['test'] });
    expect(pnpmInvocation(['test'], {}, 'win32')).toHaveProperty('error');
  });
});

it('passes on only the variables the tools need', () => {
  expect(toolEnv({ PATH: '/bin', SECRET_TOKEN: 'x' })).toEqual({ PATH: '/bin' });
});

describe('in a git repo', () => {
  let dir: string;
  let temp: TempDir;
  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: toolEnv() }).trim();
  const put = async (file: string, text = 'x'): Promise<void> => {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await writeFile(path.join(dir, file), text);
  };

  beforeEach(async () => {
    temp = await tempDir('check changed');
    dir = temp.root;
    git('init', '-q', '-b', 'main');
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@example.com');
    git('config', 'commit.gpgsign', 'false');
    await put('docs/old.md');
    await put('.gitignore', 'ignored/\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    git('checkout', '-q', '-b', 'work');
  });

  afterEach(() => temp.remove());

  it('lists committed, uncommitted and untracked paths against the merge-base, not what main gained since', async () => {
    await put('packages/store/src/a.ts');
    git('add', '-A');
    git('commit', '-q', '-m', 'work');
    git('checkout', '-q', 'main');
    await put('packages/steward/src/later.ts');
    git('add', '-A');
    git('commit', '-q', '-m', 'main moves');
    git('checkout', '-q', 'work');
    await put('docs/old.md', 'changed');
    await put('scripts/new.mjs');
    await put('ignored/x.ts');
    expect(changedPaths(dir, 'main')).toEqual(['docs/old.md', 'packages/store/src/a.ts', 'scripts/new.mjs']);
  });

  it('prints the plan and runs nothing with --dry-run', async () => {
    await put('packages/domain/src/a.ts');
    await put('eslint.config.mjs');
    const code = [
      `import { main } from ${JSON.stringify(pathToFileURL(SCRIPT).href)};`,
      `process.exitCode = main(['--base', 'main', '--dry-run'], ${JSON.stringify(dir)}, console.log);`,
    ].join('\n');
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
      encoding: 'utf8',
      env: toolEnv(),
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('2 changed path(s)');
    expect(run.stdout).toContain('no rule for eslint.config.mjs');
    expect(run.stdout).toContain('pnpm test\n  pnpm typecheck');
  });
});
