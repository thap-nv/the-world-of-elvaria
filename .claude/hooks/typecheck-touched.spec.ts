import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO } from './hook-io.mjs';
import { reportOf, tsconfigOf } from './typecheck-touched.mjs';

const exists = (path: string): boolean =>
  ['packages/domain/tsconfig.json', 'apps/cli/tsconfig.json'].includes(path);

describe('tsconfigOf', () => {
  it('gives the workspace tsconfig for its TypeScript and JS files', () => {
    expect(tsconfigOf('packages/domain/src/quest/transition.ts', exists)).toBe(
      'packages/domain/tsconfig.json',
    );
    expect(tsconfigOf('apps/cli/src/cli.spec.ts', exists)).toBe('apps/cli/tsconfig.json');
    expect(tsconfigOf('packages/domain/vitest.config.mjs', exists)).toBe('packages/domain/tsconfig.json');
  });

  it('gives the root tsconfig for scripts/, root config files and these hooks', () => {
    expect(tsconfigOf('scripts/docs-gen.mjs', exists)).toBe('tsconfig.json');
    expect(tsconfigOf('commitlint.config.mjs', exists)).toBe('tsconfig.json');
    expect(tsconfigOf('.claude/hooks/guard-bash.mjs', exists)).toBe('tsconfig.json');
  });

  it('skips what no program covers: other files, build output, a workspace without tsconfig', () => {
    expect(tsconfigOf('CLAUDE.md', exists)).toBeUndefined();
    expect(tsconfigOf('packages/i18n/src/locales/vi.json', exists)).toBeUndefined();
    expect(tsconfigOf('packages/hooks/dist/elvaria-hook.js', exists)).toBeUndefined();
    expect(tsconfigOf('packages/runner-core/src/index.ts', exists)).toBeUndefined();
    expect(tsconfigOf('design/project/app.js', exists)).toBeUndefined();
  });

  it('finds the real workspace tsconfig on disk by default', () => {
    expect(tsconfigOf('packages/eventlog/src/index.ts')).toBe('packages/eventlog/tsconfig.json');
  });
});

describe('reportOf', () => {
  const rel = 'packages/domain/src/a.ts';
  const here = (n: number) => `${rel}(${String(n)},1): error TS2322: Type 'string' is not assignable.`;
  const other = (n: number) =>
    String.raw`packages\domain\src\b.ts(${String(n)},1): error TS2304: Cannot find name.`;

  it('shows errors of the edited file in full and summarizes the others, backslashes or not', () => {
    const output = [here(1), here(2), other(3), other(4), 'Found 4 errors.'].join('\n');
    expect(reportOf(output, rel, 'packages/domain/tsconfig.json')).toBe(
      [
        `Typecheck failed (packages/domain/tsconfig.json) after editing ${rel}:`,
        here(1),
        here(2),
        '… 2 error(s) in other files, e.g.:',
        other(3),
        other(4),
        '',
      ].join('\n'),
    );
  });

  it('caps both lists', () => {
    const output = [
      ...Array.from({ length: 30 }, (_, i) => here(i)),
      ...Array.from({ length: 9 }, (_, i) => other(i)),
    ];
    const lines = reportOf(output.join('\n'), rel, 'tsconfig.json').trimEnd().split('\n');
    expect(lines).toHaveLength(1 + 20 + 1 + 3);
    expect(lines[21]).toBe('… 9 error(s) in other files, e.g.:');
  });

  it('says nothing when tsc failed without a type error', () => {
    expect(reportOf('Cannot find module typescript', rel, 'tsconfig.json')).toBe('');
  });
});

describe('typecheck-touched.mjs as Claude Code runs it', () => {
  const hook = (filePath: string) =>
    spawnSync(process.execPath, [join(REPO, '.claude/hooks/typecheck-touched.mjs')], {
      input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: filePath } }),
      encoding: 'utf8',
      timeout: 100_000,
    });

  it('typechecks the owner of an edited file that type-checks, and exits 0', () => {
    expect(hook(join(REPO, 'packages/i18n/src/index.ts'))).toMatchObject({ status: 0, stderr: '' });
  }, 100_000);

  it('exits 0 at once for a file outside the repo or outside every program', () => {
    expect(hook(join(REPO, '..', 'elsewhere.ts')).status).toBe(0);
    expect(hook(join(REPO, 'CLAUDE.md')).status).toBe(0);
  });
});
