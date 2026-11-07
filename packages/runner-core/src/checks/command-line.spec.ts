import { describe, expect, it } from 'vitest';

import { splitCommandLine } from './command-line.ts';

describe('splitCommandLine', () => {
  it.each([
    ['pnpm -r test', ['pnpm', '-r', 'test']],
    ['  pnpm   lint  ', ['pnpm', 'lint']],
    ['node "D:/Tool - DC1/scripts/check.mjs" --fast', ['node', 'D:/Tool - DC1/scripts/check.mjs', '--fast']],
    ["node -e 'process.exit(a && b ? 0 : 1)'", ['node', '-e', 'process.exit(a && b ? 0 : 1)']],
    ['node scripts\\check.mjs', ['node', 'scripts\\check.mjs']],
    ['git diff --stat ""', ['git', 'diff', '--stat', '']],
    ['pnpm --filter="@elvaria/x" test', ['pnpm', '--filter=@elvaria/x', 'test']],
    ['vitest run src/*.spec.ts', ['vitest', 'run', 'src/*.spec.ts']],
  ])('%s', (line, words) => {
    expect(splitCommandLine(line)).toEqual({ ok: true, value: words });
  });

  it.each([
    'pnpm lint && pnpm test',
    'pnpm test | tee out.log',
    'pnpm test > out.log',
    'echo $HOME',
    'pnpm test; pnpm lint',
    'pnpm test\npnpm lint',
    'node `which x`',
    '(cd web && pnpm e2e)',
  ])('refuses shell syntax: %s', (line) => {
    expect(splitCommandLine(line)).toEqual({ ok: false, error: 'shell_syntax' });
  });

  it('refuses an empty line and an unclosed quote', () => {
    expect(splitCommandLine('   ')).toEqual({ ok: false, error: 'empty' });
    expect(splitCommandLine('node "a b')).toEqual({ ok: false, error: 'unclosed_quote' });
  });
});
