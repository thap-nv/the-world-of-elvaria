import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { toolEnv } from './check-changed.mjs';
import type { CloneList, ListedPair } from './shape-clones.mjs';
import {
  LIST_FILE,
  compareClones,
  listGrowth,
  main,
  parseList,
  pruneList,
  runtimeSources,
} from './shape-clones.mjs';

const REPO = join(import.meta.dirname, '..');

const pair = (a: string, b: string, tokens: number) => ({ a, b, tokens, linesA: '1-9', linesB: '3-11' });
const listed = (a: string, b: string, tokens: number, reason?: string): ListedPair =>
  reason === undefined ? { a, b, tokens, status: 'unreviewed' } : { a, b, tokens, status: 'kept', reason };
const list = (...pairs: ListedPair[]): CloneList => ({ version: 1, pairs });

describe('parseList', () => {
  it('reads a list, and refuses a wrong version, order, count, status, a kept pair without a reason, a pair twice', () => {
    const ok = list(listed('a.ts', 'b.ts', 70), listed('a.ts', 'c.ts', 61, 'two contracts'));
    expect(parseList(JSON.stringify(ok))).toEqual(ok);
    const bad = (value: unknown) => () => parseList(JSON.stringify(value));
    expect(bad({ version: 2, pairs: [] })).toThrow('version must be 1');
    expect(bad({ version: 1 })).toThrow('pairs must be a list');
    expect(bad(list(listed('b.ts', 'a.ts', 70)))).toThrow('a before b');
    expect(bad(list(listed('a.ts', 'b.ts', 0)))).toThrow('tokens must be a count');
    expect(bad(list({ ...listed('a.ts', 'b.ts', 70), status: 'kept' }))).toThrow('needs a reason');
    expect(bad(list(listed('a.ts', 'b.ts', 70, ' ')))).toThrow('needs a reason');
    expect(bad({ version: 1, pairs: [{ a: 'a.ts', b: 'b.ts', tokens: 70, status: 'seen' }] })).toThrow(
      'status must be unreviewed or kept',
    );
    expect(bad(list(listed('a.ts', 'b.ts', 70), listed('a.ts', 'b.ts', 80)))).toThrow('listed twice');
  });
});

describe('compareClones and pruneList', () => {
  const baseline = list(
    listed('a.ts', 'b.ts', 70),
    listed('a.ts', 'c.ts', 90, 'why'),
    listed('c.ts', 'd.ts', 65),
  );

  it('is quiet when today matches the list', () => {
    const today = [pair('a.ts', 'b.ts', 70), pair('a.ts', 'c.ts', 90), pair('c.ts', 'd.ts', 65)];
    expect(compareClones(baseline, today)).toEqual({ added: [], stale: [] });
  });

  it('names a pair the list does not hold and a listed pair that grew, with their lines', () => {
    const today = [
      pair('a.ts', 'b.ts', 71),
      pair('a.ts', 'c.ts', 90),
      pair('c.ts', 'd.ts', 65),
      pair('b.ts', 'e.ts', 60),
    ];
    expect(compareClones(baseline, today).added).toEqual([
      'grew 70 → 71 tokens a.ts:1-9 ~ b.ts:3-11',
      '60 tokens b.ts:1-9 ~ e.ts:3-11',
    ]);
  });

  it('names what shrank or went, and prune lowers the list to it, keeping status and reason, adding nothing', () => {
    const today = [pair('a.ts', 'b.ts', 70), pair('a.ts', 'c.ts', 80), pair('d.ts', 'e.ts', 99)];
    expect(compareClones(baseline, today).stale).toEqual(['a.ts ~ c.ts: 90 → 80', 'c.ts ~ d.ts: 65 → 0']);
    expect(pruneList(baseline, today)).toEqual(
      list(listed('a.ts', 'b.ts', 70), listed('a.ts', 'c.ts', 80, 'why')),
    );
  });
});

describe('listGrowth', () => {
  const base = list(listed('a.ts', 'b.ts', 70), listed('a.ts', 'c.ts', 90, 'why'));

  it('lets the unreviewed pairs only shrink or leave, and a kept pair come in or grow', () => {
    expect(listGrowth(base, list(listed('a.ts', 'b.ts', 60)))).toEqual([]);
    expect(
      listGrowth(
        base,
        list(
          listed('a.ts', 'b.ts', 70, 'looked'),
          listed('a.ts', 'c.ts', 99, 'why'),
          listed('x.ts', 'y.ts', 61, 'new'),
        ),
      ),
    ).toEqual([]);
  });

  it('names an unreviewed pair added, raised, or turned back from kept', () => {
    expect(
      listGrowth(
        base,
        list(listed('a.ts', 'b.ts', 71), listed('a.ts', 'c.ts', 90), listed('x.ts', 'y.ts', 61)),
      ),
    ).toEqual([
      'unreviewed a.ts ~ b.ts: 70 → 71',
      'new unreviewed a.ts ~ c.ts',
      'new unreviewed x.ts ~ y.ts',
    ]);
  });
});

/** A function of about 100 tokens; `n` renames it, which leaves its shape alone. */
const body = (n: string) => `export function ${n}Parts(${n}Input: string, ${n}Limit: number): string[] {
  const ${n}Out: string[] = [];
  for (const ${n}Part of ${n}Input.split('${n},')) {
    if (${n}Part.length > ${n}Limit + 1) continue;
    const ${n}Trimmed = ${n}Part.trim();
    if (${n}Trimmed === '') ${n}Out.push('${n}-empty');
    else ${n}Out.push(${n}Trimmed.toUpperCase());
  }
  return ${n}Out.length > 0 ? ${n}Out : ['${n}'];
}
`;

describe('main', () => {
  let root = '';
  afterEach(() => {
    rmSync(root, { recursive: true, force: true, maxRetries: 10 });
  });

  /** A repo in a temp folder with a space in its name (§6), holding `files`. */
  function repoWith(files: Record<string, string>) {
    root = mkdtempSync(join(tmpdir(), 'elvaria dup '));
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), text);
    }
  }
  const run = (argv: string[]) => {
    const lines: string[] = [];
    return { code: main(argv, root, (line) => lines.push(line)), lines };
  };
  const writeList = (value: CloneList) => {
    writeFileSync(join(root, LIST_FILE), JSON.stringify(value));
  };

  it('reads runtime code only: no spec, barrel, tool config, test helper, install or build output', () => {
    const skipped = [
      'a.spec.ts',
      'index.ts',
      'vitest.config.ts',
      '__fixtures__/f.ts',
      'node_modules/m/n.ts',
      'dist/d.mjs',
    ];
    repoWith({
      'packages/a/src/x.ts': 'x',
      'apps/b/src/y.mjs': 'y',
      'apps/b/src/z.md': 'z',
      'packages/a/fixtures/f.ts': 'f',
      'apps/b/test/t.ts': 't',
      ...Object.fromEntries(skipped.map((file) => [`packages/a/src/${file}`, 'skip'])),
    });
    expect(runtimeSources(root)).toEqual([
      { path: 'packages/a/src/x.ts', text: 'x' },
      { path: 'apps/b/src/y.mjs', text: 'y' },
    ]);
  });

  it('is red on a new pair until it is listed as kept, and red again when it grows', () => {
    repoWith({ 'packages/a/src/a.ts': body('a'), 'packages/b/src/b.ts': body('b') });
    expect(run([])).toEqual({
      code: 1,
      lines: [
        'new: 101 tokens packages/a/src/a.ts:1-10 ~ packages/b/src/b.ts:1-10',
        `Move the shared shape to a common home (implementation-plan §4.2, R7), or list the pair in ${LIST_FILE} as kept with a reason.`,
      ],
    });
    writeList(list(listed('packages/a/src/a.ts', 'packages/b/src/b.ts', 101, 'two adapters, one CLI each')));
    expect(run([])).toEqual({ code: 0, lines: [] });
    writeFileSync(join(root, 'packages/a/src/a.ts'), `${body('a')}${body('c')}`);
    writeFileSync(join(root, 'packages/b/src/b.ts'), `${body('b')}${body('d')}`);
    expect(run([]).lines[0]).toBe(
      'new: grew 101 → 202 tokens packages/a/src/a.ts:1-20 ~ packages/b/src/b.ts:1-20',
    );
  });

  it('is red on a fixed pair until --prune drops it', () => {
    repoWith({ 'packages/a/src/a.ts': body('a'), 'packages/b/src/b.ts': 'export const b = 1;\n' });
    writeList(list(listed('packages/a/src/a.ts', 'packages/b/src/b.ts', 101)));
    expect(run([])).toEqual({
      code: 1,
      lines: ['fixed, run pnpm dup --prune: packages/a/src/a.ts ~ packages/b/src/b.ts: 101 → 0'],
    });
    expect(run(['--prune'])).toEqual({ code: 0, lines: [] });
    expect(parseList(readFileSync(join(root, LIST_FILE), 'utf8'))).toEqual(list());
  });

  it('prints the shares with --stats, and refuses an unknown argument', () => {
    repoWith({ 'apps/a/src/a.ts': body('a'), 'apps/a/src/b.ts': body('b') });
    writeList(list(listed('apps/a/src/a.ts', 'apps/a/src/b.ts', 101)));
    expect(run(['--stats'])).toEqual({
      code: 0,
      lines: [
        'files 2, tokens 202, in a clone 202 (100.00 %)',
        'file pairs 1; from 60 tokens 1, from 100 1, from 200 0',
      ],
    });
    expect(run(['--fix'])).toEqual({
      code: 2,
      lines: ['unknown argument --fix; usage: dup [--prune] [--stats]'],
    });
  });
});

/** The list where this branch left main, or why there is none to compare with (as src-layout.spec.ts). */
function listAtBase(): { list: CloneList } | { why: string } {
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
    const text = git(['show', `${base}:${LIST_FILE}`]);
    if (text === '') return { why: `${ref} had no ${LIST_FILE} at ${base.slice(0, 7)}` };
    return { list: parseList(text) };
  }
  return { why: 'git knows no origin/main or main here' };
}

describe(`the repo's ${LIST_FILE}`, () => {
  // AH-14 turns unreviewed pairs into kept ones or moves them to a common home; nothing adds an unreviewed one.
  const base = listAtBase();
  const grown = 'holds no unreviewed pair this branch added or raised';
  if ('list' in base) {
    it(grown, () => {
      expect(listGrowth(base.list, parseList(readFileSync(join(REPO, LIST_FILE), 'utf8')))).toEqual([]);
    });
  } else {
    it.skip(`${grown} (not compared: ${base.why})`, () => undefined);
  }
});
