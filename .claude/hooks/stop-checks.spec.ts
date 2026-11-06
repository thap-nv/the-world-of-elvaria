import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO } from './hook-io.mjs';
import { changedFiles, checksFor, diffTouchesImports } from './stop-checks.mjs';

const status = (...entries: string[]): string => `${entries.join('\0')}\0`;
const file = (path: string, untracked = false) => ({ path, untracked });
const noRead = (): string => '';

/** A `git diff --unified=0` of one file with the given changed lines. */
const diffOf = (path: string, ...lines: string[]): string =>
  [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`, '@@ -1 +1 @@', ...lines].join('\n');

describe('changedFiles', () => {
  it('reads modified, added, deleted and untracked paths, and skips the old path of a rename', () => {
    expect(
      changedFiles(
        status(
          ' M packages/domain/src/a.ts',
          'A  CLAUDE.md',
          ' D old.md',
          'R  new.ts',
          'old.ts',
          '?? .claude/x.mjs',
        ),
      ),
    ).toEqual([
      file('packages/domain/src/a.ts'),
      file('CLAUDE.md'),
      file('old.md'),
      file('new.ts'),
      file('.claude/x.mjs', true),
    ]);
  });

  it('gives nothing for a clean tree', () => {
    expect(changedFiles('')).toEqual([]);
  });
});

describe('diffTouchesImports', () => {
  it('sees an added or removed import, re-export, dynamic import or require in workspace code', () => {
    expect(
      diffTouchesImports(diffOf('packages/store/src/a.ts', "+import { x } from '@elvaria/domain';")),
    ).toBe(true);
    expect(diffTouchesImports(diffOf('apps/cli/src/a.ts', "-import type { Y } from './y.ts';"))).toBe(true);
    expect(diffTouchesImports(diffOf('packages/eventlog/src/a.ts', "+export { z } from './z.ts';"))).toBe(
      true,
    );
    expect(
      diffTouchesImports(diffOf('packages/eventlog/src/a.ts', "+  await import('@elvaria/domain');")),
    ).toBe(true);
  });

  it('ignores other lines, other files and the file headers', () => {
    expect(
      diffTouchesImports(diffOf('packages/store/src/a.ts', '+const x = 1;', '-export const y = 2;')),
    ).toBe(false);
    expect(diffTouchesImports(diffOf('scripts/docs-gen.mjs', "+import { x } from './x.mjs';"))).toBe(false);
    expect(diffTouchesImports(diffOf('packages/store/README.md', '+import is a word here'))).toBe(false);
    expect(diffTouchesImports(diffOf('packages/hooks/dist/a.js', "+import x from 'y';"))).toBe(false);
  });
});

describe('checksFor', () => {
  it('runs boundaries for the boundary table, a workspace manifest or a changed import', () => {
    expect(checksFor([file('packages/config/boundaries.mjs')], '', noRead)).toEqual(['boundaries']);
    expect(checksFor([file('apps/cli/package.json')], '', noRead)).toEqual(['boundaries']);
    const diff = diffOf('packages/store/src/a.ts', "+import { x } from '@elvaria/domain';");
    expect(checksFor([file('packages/store/src/a.ts')], diff, noRead)).toEqual(['boundaries']);
  });

  it('runs boundaries for a new workspace file that imports, not for one that does not', () => {
    const files = [file('packages/runner-core/src/index.ts', true)];
    expect(checksFor(files, '', () => "export * from './runner.ts';\n")).toEqual(['boundaries']);
    expect(checksFor(files, '', () => 'export const X = 1;\n')).toEqual([]);
  });

  it('runs i18n:check for a locale or the glossary', () => {
    expect(checksFor([file('packages/i18n/src/locales/vi.json')], '', noRead)).toEqual(['i18n']);
    expect(
      checksFor([file('packages/i18n/src/glossary.json'), file('apps/cli/package.json')], '', noRead),
    ).toEqual(['boundaries', 'i18n']);
  });

  it('runs nothing for docs, plain code changes or files outside the workspaces', () => {
    const files = [file('CLAUDE.md'), file('docs/cli.md'), file('scripts/x.mjs', true)];
    expect(
      checksFor(files, diffOf('packages/store/src/a.ts', '+const x = 1;'), () => "import x from 'y';"),
    ).toEqual([]);
  });
});

describe('stop-checks.mjs as Claude Code runs it', () => {
  it('lets the agent end at once when it was already sent back once', () => {
    const result = spawnSync(process.execPath, [join(REPO, '.claude/hooks/stop-checks.mjs')], {
      input: JSON.stringify({ hook_event_name: 'Stop', stop_hook_active: true }),
      encoding: 'utf8',
    });
    expect(result).toMatchObject({ status: 0, stderr: '' });
  });
});
