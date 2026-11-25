import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { toolEnv } from './check-changed.mjs';
import type { Baseline } from './src-layout.mjs';
import {
  BASELINE_FILE,
  baselineGrowth,
  compareLayout,
  layoutViolations,
  main,
  parseBaseline,
  pruneLayout,
  workspaceFiles,
} from './src-layout.mjs';

const REPO = join(import.meta.dirname, '..');

/** `n` runtime files named `<stem><i>.ts` in `dir`. */
const many = (dir: string, n: number, stem = 'f') =>
  Array.from({ length: n }, (_, i) => `${dir}/${stem}${i}.ts`);
const empty = (): Baseline => ({
  version: 1,
  root_size: {},
  dir_size: {},
  root_spec: {},
  test_dir: {},
  name_pair: {},
});

describe('layoutViolations', () => {
  it('lets a small package keep 20 runtime files at its src root, not 21', () => {
    expect(layoutViolations(many('packages/a/src', 20)).root_size).toEqual({});
    expect(layoutViolations(many('packages/a/src', 21)).root_size).toEqual({ 'packages/a/src': 21 });
  });

  it('counts runtime files only: specs, fixtures and other files do not fill the root', () => {
    const files = [
      ...many('packages/a/src', 20),
      'packages/a/src/f0.spec.ts',
      'packages/a/src/__fixtures__/kingdom.ts',
      'packages/a/src/notes.md',
      'packages/a/README.md',
    ];
    expect(layoutViolations(files).root_size).toEqual({});
  });

  it('holds the root of a package above 40 runtime files to 10', () => {
    const big = [...many('apps/b/src', 11), ...many('apps/b/src/quest', 30)];
    expect(layoutViolations(big).root_size).toEqual({ 'apps/b/src': 11 });
    expect(layoutViolations(big.slice(1)).root_size).toEqual({});
  });

  it('holds any other folder to 30 runtime files', () => {
    expect(layoutViolations(many('packages/a/src/plot', 31)).dir_size).toEqual({ 'packages/a/src/plot': 31 });
    expect(layoutViolations(many('packages/a/src/plot', 30)).dir_size).toEqual({});
  });

  it('leaves the index.ts barrel of a folder out of its count, not the one of the root', () => {
    const plot = [...many('packages/a/src/plot', 30), 'packages/a/src/plot/index.ts'];
    expect(layoutViolations(plot).dir_size).toEqual({});
    expect(layoutViolations([...plot, 'packages/a/src/plot/extra.ts']).dir_size).toEqual({
      'packages/a/src/plot': 31,
    });
    const root = [...many('packages/a/src', 20), 'packages/a/src/index.ts'];
    expect(layoutViolations(root).root_size).toEqual({ 'packages/a/src': 21 });
  });

  it('names a root spec without its runtime file, in a package above 40 runtime files only', () => {
    const files = [
      'packages/s/src/steward.ts',
      'packages/s/src/steward.spec.ts',
      'packages/s/src/team-flow.spec.ts',
      'packages/s/src/tick/tick-flow.spec.ts',
    ];
    const big = [...files, ...many('packages/s/src/tick', 30), ...many('packages/s/src/bell', 10)];
    expect(layoutViolations(big).root_spec).toEqual({ 'packages/s/src/team-flow.spec.ts': 1 });
    expect(layoutViolations(files).root_spec).toEqual({});
  });

  it('names a test/ folder anywhere in the workspace, except inside a fixture tree', () => {
    const files = [
      'apps/cli/test/kingdom.ts',
      'apps/cli/test/fixtures/a.json',
      'packages/e/src/x/test/helper.ts',
      'packages/c/__fixtures__/repo/test/a.ts',
      'packages/c/fixtures/test/a.ts',
      'packages/c/src/test.ts',
    ];
    expect(layoutViolations(files).test_dir).toEqual({
      'apps/cli/test': 1,
      'packages/e/src/x/test': 1,
    });
  });

  it('names a singular and plural name in one folder, with -s, -es and -ies', () => {
    const files = [
      'packages/a/src/notice.ts',
      'packages/a/src/notices.ts',
      'packages/a/src/x/match.ts',
      'packages/a/src/x/matches.ts',
      'packages/a/src/x/entry.ts',
      'packages/a/src/x/entries.ts',
      'packages/a/src/x/look.spec.ts',
      'packages/a/src/x/looks.ts',
      'packages/a/src/y/look.ts',
    ];
    expect(layoutViolations(files).name_pair).toEqual({
      'packages/a/src/notice + notices': 1,
      'packages/a/src/x/match + matches': 1,
      'packages/a/src/x/entry + entries': 1,
    });
  });

  it('looks only under packages/ and apps/', () => {
    const { version: _, ...none } = empty();
    expect(layoutViolations([...many('scripts', 30), 'scripts/test/a.ts', 'apps'])).toEqual(none);
  });
});

describe('compareLayout and pruneLayout', () => {
  const baseline: Baseline = {
    ...empty(),
    root_size: { 'packages/s/src': 25 },
    test_dir: { 'apps/cli/test': 1, 'packages/e/test': 1 },
  };

  it('is quiet when today matches the baseline', () => {
    expect(compareLayout(baseline, baseline)).toEqual({ added: [], stale: [] });
  });

  it('names a count above the baseline and an entry it does not hold', () => {
    const today = { ...baseline, root_size: { 'packages/s/src': 26, 'apps/cli/src': 11 } };
    expect(compareLayout(baseline, today).added).toEqual([
      'root_size packages/s/src: 25 → 26',
      'root_size apps/cli/src (11)',
    ]);
  });

  it('names what was fixed or lowered, and prune lowers the baseline to it without adding', () => {
    const today = {
      ...empty(),
      root_size: { 'packages/s/src': 24 },
      test_dir: { 'apps/cli/test': 1 },
      name_pair: { 'packages/a/src/x + xs': 1 },
    };
    expect(compareLayout(baseline, today).stale).toEqual([
      'root_size packages/s/src: 25 → 24',
      'test_dir packages/e/test: 1 → 0',
    ]);
    expect(pruneLayout(baseline, today)).toEqual({
      ...empty(),
      root_size: { 'packages/s/src': 24 },
      test_dir: { 'apps/cli/test': 1 },
    });
  });

  it('calls a baseline grown since main what the gate would call new', () => {
    expect(baselineGrowth(baseline, { ...baseline, root_size: { 'packages/s/src': 26 } })).toEqual([
      'root_size packages/s/src: 25 → 26',
    ]);
    expect(baselineGrowth(baseline, empty())).toEqual([]);
  });
});

describe('parseBaseline', () => {
  it('fills the rules a file leaves out, and refuses an unknown rule or version', () => {
    expect(parseBaseline('{ "version": 1, "test_dir": { "apps/cli/test": 1 } }')).toEqual({
      ...empty(),
      test_dir: { 'apps/cli/test': 1 },
    });
    expect(() => parseBaseline('{ "version": 1, "root": {} }')).toThrow('unknown rules root');
    expect(() => parseBaseline('{ "version": 2 }')).toThrow('version must be 1');
  });
});

describe('main', () => {
  let root = '';
  let temp: TempDir;
  beforeEach(async () => {
    temp = await tempDir('elvaria layout');
    root = temp.root;
  });
  afterEach(() => temp.remove());

  /** A repo in a temp folder with a space in its name (§6), holding `files`. */
  function repoWith(files: readonly string[]) {
    for (const file of files) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), '');
    }
  }
  const run = (argv: string[]) => {
    const lines: string[] = [];
    return { code: main(argv, root, (line) => lines.push(line)), lines };
  };

  it('walks the workspaces into `/` paths, skipping installs and build output', () => {
    repoWith(['packages/a/src/x/y.ts', 'packages/a/node_modules/z/test/a.ts', 'apps/b/dist/test/c.js']);
    expect(workspaceFiles(root)).toEqual(['packages/a/src/x/y.ts']);
  });

  it('is red on a file added to a root already over its limit, and green with no baseline when clean', () => {
    repoWith(many('packages/a/src', 21));
    writeFileSync(
      join(root, BASELINE_FILE),
      JSON.stringify({ version: 1, root_size: { 'packages/a/src': 21 } }),
    );
    expect(run([])).toEqual({ code: 0, lines: [] });
    writeFileSync(join(root, 'packages/a/src/more.ts'), '');
    expect(run([]).code).toBe(1);
    expect(run([]).lines[0]).toBe('new: root_size packages/a/src: 21 → 22');
    rmSync(join(root, BASELINE_FILE));
    rmSync(join(root, 'packages/a/src/more.ts'));
    rmSync(join(root, 'packages/a/src/f0.ts'));
    expect(run([])).toEqual({ code: 0, lines: [] });
  });

  it('is red on a fixed entry until --prune lowers the baseline, and --prune adds nothing', () => {
    repoWith([...many('packages/a/src', 21), 'apps/cli/test/a.ts']);
    writeFileSync(
      join(root, BASELINE_FILE),
      JSON.stringify({ version: 1, root_size: { 'packages/a/src': 22 } }),
    );
    expect(run([])).toEqual({
      code: 1,
      lines: [
        'new: test_dir apps/cli/test',
        'fixed, run pnpm layout --prune: root_size packages/a/src: 22 → 21',
        'Put the file in its concept folder (implementation-plan §4.2, R1–R8).',
      ],
    });
    expect(run(['--prune']).code).toBe(1);
    expect(parseBaseline(readFileSync(join(root, BASELINE_FILE), 'utf8'))).toEqual({
      ...empty(),
      root_size: { 'packages/a/src': 21 },
    });
  });

  it('refuses an unknown argument', () => {
    repoWith([]);
    expect(run(['--fix'])).toEqual({ code: 2, lines: ['unknown argument --fix; usage: layout [--prune]'] });
  });
});

/** The baseline where this branch left main, or why there is none to compare with (as suppressions.spec.ts). */
function baselineAtBase(): { list: Baseline } | { why: string } {
  const git = (args: string[]) => {
    try {
      return execFileSync('git', args, {
        cwd: REPO,
        env: toolEnv(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      return '';
    }
  };
  for (const ref of ['origin/main', 'main']) {
    const base = git(['merge-base', 'HEAD', ref]).trim();
    if (base === '') continue;
    const text = git(['show', `${base}:${BASELINE_FILE}`]);
    if (text === '') return { why: `${ref} had no ${BASELINE_FILE} at ${base.slice(0, 7)}` };
    return { list: parseBaseline(text) };
  }
  return { why: 'git knows no origin/main or main here' };
}

describe(`the repo's ${BASELINE_FILE}`, () => {
  // `pnpm layout --prune` shrinks it as cleanup tasks land; nothing else may change it.
  const base = baselineAtBase();
  const grown = 'has not grown since this branch left main';
  if ('list' in base) {
    it(grown, () => {
      expect(
        baselineGrowth(base.list, parseBaseline(readFileSync(join(REPO, BASELINE_FILE), 'utf8'))),
      ).toEqual([]);
    });
  } else {
    it.skip(`${grown} (not compared: ${base.why})`, () => undefined);
  }
});
