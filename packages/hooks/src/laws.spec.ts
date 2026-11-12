import { describe, expect, it } from 'vitest';

import { DC1_LAWS } from './__fixtures__/claude-payloads.ts';
import {
  NO_LAWS,
  commandViolation,
  commandWords,
  compileLaws,
  forbiddenPathOf,
  matchingGlobOf,
  normalizeCommand,
  pathSegments,
  shellWriteTargets,
} from './laws.ts';

const laws = compileLaws(DC1_LAWS);

describe('pathSegments', () => {
  it.each([
    ['C:\\repo\\.elvaria\\worktrees\\q\\.env', ['C:', 'repo', '.elvaria', 'worktrees', 'q', '.env']],
    ['/Users/me/repo/./src/../.env', ['Users', 'me', 'repo', '.env']],
    ['../../../.env', ['.env']],
    ['C:/repo//infra\\secrets/key', ['C:', 'repo', 'infra', 'secrets', 'key']],
    ['.env::$DATA', ['.env']],
    ['.env:secret', ['.env']],
    ['.env. ', ['.env']],
  ])('%s', (raw, segments) => {
    expect(pathSegments(raw)).toEqual(segments);
  });
});

describe('forbiddenPathOf', () => {
  it.each([
    'C:\\Users\\dev\\repo\\.elvaria\\worktrees\\q_20261106_7k3m2a\\.env',
    'C:\\Users\\dev\\repo\\.ENV',
    'c:/users/dev/repo/.env.local',
    '.env',
    './apps/api/.env',
    '/Users/dev/repo/infra/secrets/db.key',
    'D:\\other\\infra\\secrets',
    '..\\..\\..\\infra\\secrets\\prod\\key.pem',
    'C:\\repo\\.env::$DATA',
    'C:\\repo\\.env.',
  ])('forbids %s', (raw) => {
    expect(forbiddenPathOf(raw, laws)).toBeDefined();
  });

  it.each([
    'C:\\Users\\dev\\repo\\apps\\api\\src\\env.ts',
    '/Users/dev/repo/.envrc-docs/readme.md',
    'infra/secretsmanager.md',
    'infra/README.md',
    '',
  ])('allows %s', (raw) => {
    expect(forbiddenPathOf(raw, laws)).toBeUndefined();
  });

  it('names the glob that forbids the path', () => {
    expect(forbiddenPathOf('C:\\repo\\infra\\secrets\\a', laws)).toBe('infra/secrets/**');
  });

  it('forbids nothing without laws', () => {
    expect(forbiddenPathOf('.env', NO_LAWS)).toBeUndefined();
  });
});

describe('normalizeCommand and commandWords', () => {
  it('drops quotes, backticks and escapes, and collapses blanks', () => {
    expect(normalizeCommand('  "git"   pu\\sh  `origin`  ')).toBe('git push origin');
  });

  it('splits a line at blanks and shell operators', () => {
    expect(commandWords('cat .env|grep KEY; type "C:\\repo\\.env" > out && x=--file=.env')).toEqual([
      'cat',
      '.env',
      'grep',
      'KEY',
      'type',
      'C:\\repo\\.env',
      'out',
      'x',
      '--file',
      '.env',
    ]);
  });
});

describe('commandViolation', () => {
  it.each([
    'git push origin quest/q_20261106_7k3m2a',
    'git -C C:\\repo push',
    'GIT PUSH',
    '"git" "push"',
    'git   push --force',
    'g\\it push',
    'pnpm drizzle-kit push',
    'docker compose -f x.yml down -v',
  ])('blocks the forbidden command %s', (command) => {
    expect(commandViolation(command, laws)).toMatch(/forbidden pattern/);
  });

  it.each([
    'cat .env',
    'type .env',
    'Get-Content .env',
    'Get-Content -Path "C:\\Users\\dev\\repo\\.env"',
    'cat apps/api/.env.local',
    'less ./infra/secrets/prod.key',
    "node -e \"require('fs').readFileSync('.env')\"",
    'cp .env /tmp/x',
    'Copy-Item -Path .env -Destination out.txt',
    'source .env',
  ])('blocks %s, which touches a forbidden path', (command) => {
    expect(commandViolation(command, laws)).toMatch(/forbidden path/);
  });

  it.each([
    'pnpm test',
    'git status',
    'git diff --stat',
    'pnpm --filter @dc1/api test -- env.spec.ts',
    'Get-ChildItem -Recurse src',
    'echo pushing is not allowed',
  ])('allows %s', (command) => {
    expect(commandViolation(command, laws)).toBeUndefined();
  });
});

describe('read-only paths in shell lines (P1-24)', () => {
  const generated = compileLaws({ ...DC1_LAWS, read_only_paths: ['docs/glossary.md', 'docs/schemas/**'] });

  it.each([
    ['pnpm docs:gen > docs/glossary.md', 'docs/glossary.md'],
    ['node gen.mjs >> "docs/schemas/kind.schema.json"', 'docs/schemas/kind.schema.json'],
    ['pnpm docs:gen 2>&1 1> D:\\repo\\docs\\glossary.md', 'D:\\repo\\docs\\glossary.md'],
    ['Get-Content x | Set-Content -Path docs/glossary.md', 'docs/glossary.md'],
    ['echo x | tee -a docs/glossary.md', 'docs/glossary.md'],
    ["'x' | Out-File docs/glossary.md", 'docs/glossary.md'],
  ])('blocks %s, which writes a read-only path itself', (command, target) => {
    expect(commandViolation(command, generated)).toBe(
      `${target} is read-only (${target.includes('schemas') ? 'docs/schemas/**' : 'docs/glossary.md'}): only the territory's generators write it; change its source and run the generator`,
    );
  });

  it.each([
    'pnpm docs:gen',
    'pnpm docs:gen --check',
    'git add docs/glossary.md',
    'git diff docs/glossary.md',
    // P1-16, quest D2: the law stopped a commit whose message named the page.
    'git commit -m "feat: add todo-scan" -m "docs/glossary.md still needs pnpm docs:gen"',
    'pnpm test 2>&1',
  ])('allows %s, which reads or names a read-only path but does not write it', (command) => {
    expect(commandViolation(command, generated)).toBeUndefined();
  });

  it('finds redirection targets and the arguments of a writer, nothing else', () => {
    expect(shellWriteTargets('a > b 2>&1 >> c &> d >| e')).toEqual(['b', 'c', 'd', 'e']);
    expect(shellWriteTargets('pnpm x; Add-Content -Path f -Value y')).toEqual(['-Path', 'f', '-Value', 'y']);
    expect(shellWriteTargets('git diff | less')).toEqual([]);
  });
});

describe('compileLaws', () => {
  it('compiles read-only and CLI-protected paths apart from the forbidden ones', () => {
    const compiled = compileLaws({ read_only_paths: ['docs/glossary.md'] }, { cliProtected: ['.husky/**'] });
    expect(compiled.paths).toEqual([]);
    expect(matchingGlobOf('docs/glossary.md', compiled.readOnly)).toBe('docs/glossary.md');
    expect(matchingGlobOf('C:\\repo\\.husky\\pre-push', compiled.cliProtected)).toBe('.husky/**');
    expect(forbiddenPathOf('docs/glossary.md', compiled)).toBeUndefined();
  });

  it('compiles the patch paths only with the file the patch goes to (P1-28)', () => {
    const laws = { patch_paths: ['.husky/**'] };
    const patched = compileLaws(laws, { cliProtected: ['.husky/**'], patchFile: 'elvaria.patch' });
    expect(matchingGlobOf('.husky/pre-push', patched.patchPaths)).toBe('.husky/**');
    expect(patched.patchFile).toBe('elvaria.patch');
    expect(compileLaws(laws, { cliProtected: ['.husky/**'] }).patchPaths).toEqual([]);
    // P1-56: which of the protected globs are Elvaria's own rule; none unless the policy says so.
    const own = compileLaws(laws, { cliProtected: ['.git/**'], ownProtected: ['.git/**'] });
    expect(own.ownProtected).toEqual(['.git/**']);
    expect(compileLaws(laws, { cliProtected: ['.git/**'] }).ownProtected).toEqual([]);
  });

  it('breaks the laws on a pattern that is not a regular expression', () => {
    const broken = compileLaws({ forbidden_commands: ['git (push'] });
    expect(broken.broken).toMatch(/not a regular expression/);
    expect(broken.commands).toEqual([]);
  });

  it('compiles nothing from nothing', () => {
    expect(compileLaws({})).toEqual(NO_LAWS);
  });
});
