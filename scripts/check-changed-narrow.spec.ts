import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { batches, narrowCommands } from './check-changed-narrow.mjs';
import { changedPaths, main, parseArgs, plan, toolEnv } from './check-changed.mjs';

let dir: string;
const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: dir, env: toolEnv(), encoding: 'utf8' }).trim();
beforeEach(async () => {
  vi.stubEnv('ELVARIA_CHECK_BASE', '');
  dir = await mkdtemp(path.join(tmpdir(), 'narrow checks '));
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.com');
  git('config', 'commit.gpgsign', 'false');
  await writeFile(path.join(dir, 'base.md'), 'base');
  git('add', '-A');
  git('commit', '-qm', 'base');
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true, maxRetries: 3 });
});

it('compares directly with the supplied commit, including when it is not an ancestor', async () => {
  const base = git('rev-parse', 'HEAD');
  await writeFile(path.join(dir, 'parent.md'), 'parent quest');
  git('add', '-A');
  git('commit', '-qm', 'parent quest');
  vi.stubEnv('ELVARIA_CHECK_BASE', git('rev-parse', 'HEAD'));
  await writeFile(path.join(dir, 'child.md'), 'child quest');
  expect(changedPaths(dir, base)).toEqual(['child.md']);
  git('checkout', '-qb', 'other', base);
  expect(changedPaths(dir, base)).toEqual(['child.md', 'parent.md']);
});

it.each([
  ['test', ['test']],
  ['typecheck', ['typecheck']],
  ['schemas', ['schemas', '--check']],
  ['boundaries', ['boundaries']],
  ['layout', ['layout']],
  ['knip', ['knip']],
  ['dup', ['dup']],
  ['i18n', ['i18n:check']],
])('selects only the %s group', (only, expected) => {
  const commands = plan([
    'packages/domain/src/schema/quest.ts',
    'packages/i18n/package.json',
    'docs/guide.md',
  ]).commands;
  expect(narrowCommands(commands, [], dir, only)).toEqual([expected]);
});

it('selects both documentation checks in the docs group', () => {
  const commands = plan(['packages/i18n/package.json']).commands;
  expect(narrowCommands(commands, [], dir, 'docs')).toEqual([['docs:gen', '--check'], ['docs:check']]);
});

it('selects root test and typecheck commands too', () => {
  const commands = plan(['scripts/example.mjs']).commands;
  expect(narrowCommands(commands, [], dir, 'test')).toEqual([['exec', 'vitest', 'run']]);
  expect(narrowCommands(commands, [], dir, 'typecheck')).toEqual([['exec', 'tsc', '-p', 'tsconfig.json']]);
});

it('lints code and formats existing changed files, skipping deleted files', async () => {
  await writeFile(path.join(dir, 'a file.ts'), 'export {};');
  await writeFile(path.join(dir, 'guide.md'), 'text');
  const paths = ['a file.ts', 'guide.md', 'deleted.ts'];
  expect(narrowCommands([], paths, dir, 'lint')).toEqual([
    ['exec', 'eslint', '--no-warn-ignored', '--', './a file.ts'],
  ]);
  expect(narrowCommands([], paths, dir, 'format')).toEqual([
    ['exec', 'prettier', '--check', '--ignore-unknown', '--', './a file.ts', './guide.md'],
  ]);
});

it('splits long Windows argument lists without losing or duplicating paths', () => {
  const paths = Array.from({ length: 100 }, (_, i) => `${i}/${'x'.repeat(200)}.ts`);
  const commands = batches(['exec', 'eslint'], paths);
  expect(commands.length).toBeGreaterThan(1);
  expect(commands.flatMap((command) => command.slice(2))).toEqual(paths);
  expect(commands.every((command) => command.join(' ').length < 12_000)).toBe(true);
});

it('rejects missing and unknown groups and documents the uncovered exit code', () => {
  expect(parseArgs(['--only'])).toHaveProperty('error');
  expect(parseArgs(['--only', 'bogus'])).toHaveProperty('error');
  expect(parseArgs(['--only=lint'])).toEqual({ base: 'origin/main', dryRun: false, only: 'lint' });
  const output: string[] = [];
  expect(main(['--help'], dir, (line) => output.push(line))).toBe(0);
  expect(output.join('\n')).toContain('Uncovered paths exit 3');
});

it('keeps legacy defaults but refuses uncovered paths in narrow mode, even for --only', async () => {
  await writeFile(path.join(dir, 'unknown.txt'), 'text');
  const output: string[] = [];
  const out = (line: string): void => {
    output.push(line);
  };
  expect(main(['--base', 'main', '--dry-run'], dir, out)).toBe(0);
  expect(output.join('\n')).not.toContain('pnpm exec prettier');
  expect(main(['--base', 'main', '--only', 'test', '--dry-run'], dir, out)).toBe(3);
  vi.stubEnv('ELVARIA_CHECK_BASE', git('rev-parse', 'HEAD'));
  expect(main(['--dry-run'], dir, out)).toBe(3);
  expect(output.join('\n')).toContain('no rule for unknown.txt');
});

it('uses the environment base and prints only the selected group through main', async () => {
  await writeFile(path.join(dir, 'CLAUDE.md'), 'text');
  vi.stubEnv('ELVARIA_CHECK_BASE', git('rev-parse', 'HEAD'));
  const output: string[] = [];
  expect(main(['--only', 'format', '--dry-run'], dir, (line) => output.push(line))).toBe(0);
  expect(output.join('\n')).toContain('pnpm exec prettier --check --ignore-unknown -- ./CLAUDE.md');
  expect(output.join('\n')).not.toContain('pnpm docs:check');
});

it('executes legacy defaults unchanged, adds formatting with env, and reserves exit 3 for uncovered paths', async () => {
  const tools = await mkdtemp(path.join(tmpdir(), 'check commands '));
  const log = path.join(tools, 'commands.jsonl');
  const runner = path.join(tools, 'pnpm.mjs');
  const record = `import { appendFileSync } from 'node:fs';
appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + '\\n');`;
  try {
    await writeFile(runner, record);
    vi.stubEnv('npm_execpath', runner);
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    await writeFile(path.join(dir, 'CLAUDE.md'), 'text');
    expect(main([], dir, () => undefined)).toBe(0);
    expect(await readFile(log, 'utf8')).toBe('["docs:check"]\n');
    vi.stubEnv('ELVARIA_CHECK_BASE', git('rev-parse', 'HEAD'));
    expect(main([], dir, () => undefined)).toBe(0);
    expect(await readFile(log, 'utf8')).toBe(
      '["docs:check"]\n["docs:check"]\n["exec","prettier","--check","--ignore-unknown","--","./CLAUDE.md"]\n',
    );
    await writeFile(runner, `${record}\nprocess.exitCode = 3;`);
    expect(main(['--only', 'docs'], dir, () => undefined)).toBe(1);
  } finally {
    await rm(tools, { recursive: true, force: true, maxRetries: 3 });
  }
});
