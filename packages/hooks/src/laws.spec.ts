import { describe, expect, it } from 'vitest';

import { DC1_LAWS } from './__fixtures__/claude-payloads.ts';
import {
  NO_LAWS,
  commandViolation,
  commandWords,
  compileLaws,
  forbiddenPathOf,
  normalizeCommand,
  pathSegments,
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

describe('compileLaws', () => {
  it('breaks the laws on a pattern that is not a regular expression', () => {
    const broken = compileLaws({ forbidden_commands: ['git (push'] });
    expect(broken.broken).toMatch(/not a regular expression/);
    expect(broken.commands).toEqual([]);
  });

  it('compiles nothing from nothing', () => {
    expect(compileLaws({})).toEqual(NO_LAWS);
  });
});
