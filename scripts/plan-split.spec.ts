import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { run } from './plan-split.mjs';

const SCRIPT = fileURLToPath(new URL('plan-split.mjs', import.meta.url));
const PLAN = 'docs/implementation-plan.md';
const DIR = 'docs/implementation-plan';
const ITEMS = ['| # | Task | File chạm | Xong khi | Trạng thái |', '|---|---|---|---|---|'];

/** A plan in the shape of docs/implementation-plan.md before P1-52, small. */
const MONOLITH = [
  '# Plan',
  '',
  'Intro with [adr](adr/0001.md).',
  '',
  '---',
  '',
  '## 1. Repo',
  '',
  '```txt',
  '## 9. not a heading',
  '```',
  '',
  'See [guide](guides/a.md) and [`CLAUDE.md`](../CLAUDE.md).',
  '',
  '---',
  '',
  '## 3. Core',
  '',
  'One line.',
  '',
  '### 3.0 Facts',
  '',
  'Facts.',
  '',
  '### 3.1 Steward',
  '',
  'Steward, see [plan](plans/phase-1.5.md).',
  '',
  '---',
  '',
  '## 8. Work',
  '',
  'Rules.',
  '',
  '### Giai đoạn 1 — Real',
  '',
  ...ITEMS,
  '| P1-01 | Two [g](guides/b.md) | f | d | xong (2026-11-07, def) |',
  '| P1-02 | Three | f | d | chưa làm |',
  '',
  '---',
  '',
  '## 10. Questions',
  '',
  'Q.',
  '',
  '---',
  '',
  '## 11. Log',
  '',
  '| Ngày | Quyết định |',
  '|---|---|',
  '| 2026-11-06 | first, see [report](reports/x.md) |',
  '| 2026-11-07 | second |',
  '',
].join('\n');

/** An in-memory repo; the plan's links point to files it does not need to hold. */
function memory(files: Record<string, string>) {
  const written: string[] = [];
  return {
    files,
    written,
    list: () => Object.keys(files),
    read: (file: string) => files[file],
    write: (file: string, text: string) => {
      files[file] = text;
      written.push(file);
    },
  };
}

describe('the first split', () => {
  it('writes the index and one file per section, mechanism, done subsection and day, losing no line', () => {
    const repo = memory({ [PLAN]: MONOLITH });
    const result = run([], repo);
    expect(result).toMatchObject({ code: 0 });
    expect(result.text).toMatch(/^plan-split: 32 lines before, 0 lost, \d+ added, 7 files\n/);
    expect(repo.written.sort()).toEqual(
      [
        PLAN,
        `${DIR}/1-repo-structure.md`,
        `${DIR}/3.0-cli-facts.md`,
        `${DIR}/3.1-steward.md`,
        `${DIR}/8-done-phase-1.md`,
        `${DIR}/11-2026-11-06.md`,
        `${DIR}/11-2026-11-07.md`,
      ].sort(),
    );
  });

  it('keeps the preamble, §8 without its done rows, §10 and the head of §11 in the index, with the contents', () => {
    const repo = memory({ [PLAN]: MONOLITH });
    run([], repo);
    const index = repo.files[PLAN] ?? '';
    expect(index).toMatch(/^# Plan\n\nIntro with \[adr\]\(adr\/0001\.md\)\.\n\n---\n\n## Mục lục\n/);
    expect(index).toContain(
      '| §3 Core · §3.0 Facts | [3.0-cli-facts.md](implementation-plan/3.0-cli-facts.md) |',
    );
    expect(index).toContain('[2026-11-06](implementation-plan/11-2026-11-06.md) · [2026-11-07]');
    expect(index).toContain('| P1-02 | Three | f | d | chưa làm |');
    expect(index).not.toContain('P1-01');
    expect(index).toContain('## 10. Questions\n\nQ.\n\n---\n\n## 11. Log\n\nCác dòng của nhật ký');
    expect(index).not.toMatch(/## 1\. |## 3\. |\| 2026-11-06/);
  });

  it('moves each line as it was, its relative links rewritten one folder down', () => {
    const repo = memory({ [PLAN]: MONOLITH });
    run([], repo);
    expect(repo.files[`${DIR}/1-repo-structure.md`]).toContain(
      '```txt\n## 9. not a heading\n```\n\nSee [guide](../guides/a.md) and [`CLAUDE.md`](../../CLAUDE.md).\n',
    );
    expect(repo.files[`${DIR}/3.1-steward.md`]).toMatch(/^# Kế hoạch triển khai Elvaria · §3\.1 Steward\n/);
    expect(repo.files[`${DIR}/8-done-phase-1.md`]).toMatch(
      /\| P1-01 \| Two \[g\]\(\.\.\/guides\/b\.md\) \|.*\|\n$/,
    );
    expect(repo.files[`${DIR}/11-2026-11-06.md`]).toMatch(
      /\| 2026-11-06 \| first, see \[report\]\(\.\.\/reports\/x\.md\) \|\n$/,
    );
  });

  it('reads a CRLF checkout, and writes nothing under --check but says it would', () => {
    const repo = memory({ [PLAN]: MONOLITH.replaceAll('\n', '\r\n') });
    const result = run(['--check'], repo);
    expect(result.code).toBe(1);
    expect(result.text).toMatch(/plan-split: 7 files would change: run pnpm plan:split$/);
    expect(repo.written).toEqual([]);
  });

  it('refuses a section it has no file for, a plan without §11, a file over 150 KB, and no plan', () => {
    const extra = MONOLITH.replace('## 10. Questions', '## 12. New\n\n---\n\n## 10. Questions');
    expect(run([], memory({ [PLAN]: extra })).text).toContain('§12 has no file');
    expect(run([], memory({ [PLAN]: MONOLITH.split('\n---\n\n## 11.')[0] ?? '' })).text).toBe(
      'plan-split: the plan has no 11 section',
    );
    const big = MONOLITH.replace('Facts.', `Facts ${'x'.repeat(160 * 1024)}`);
    const large = run([], memory({ [PLAN]: big }));
    expect(large.code).toBe(1);
    expect(large.text).toContain(`over 150 KB: ${DIR}/3.0-cli-facts.md`);
    expect(run([], memory({}))).toEqual({ code: 1, text: `plan-split: no ${PLAN}` });
  });
});

describe('a later run on the split plan', () => {
  const split = () => {
    const repo = memory({ [PLAN]: MONOLITH });
    run([], repo);
    repo.written.length = 0;
    return repo;
  };

  it('finds nothing to move right after the split', () => {
    const repo = split();
    const check = run(['--check'], repo);
    expect(check.code).toBe(0);
    expect(check.text).toMatch(/nothing to move$/);
    expect(run([], repo).text).toMatch(/0 files written$/);
  });

  it('moves a row marked done to the end of its done file, and the table goes when it is empty', () => {
    const repo = split();
    repo.files[PLAN] = (repo.files[PLAN] ?? '').replace('chưa làm', 'xong (2026-11-12, 123)');
    const result = run([], repo);
    expect(result).toMatchObject({ code: 0 });
    expect(result.text).toMatch(
      /^plan-split: \d+ lines before, 0 lost, 0 added, 2 lines of emptied table heads dropped, /,
    );
    expect(repo.files[PLAN]).not.toContain('P1-02');
    expect(repo.files[PLAN]).not.toContain(ITEMS[0]);
    expect(repo.files[`${DIR}/8-done-phase-1.md`]).toMatch(
      /\| P1-01 .*\n\| P1-02 \| Three \| f \| d \| xong \(2026-11-12, 123\) \|\n$/,
    );
  });

  it('starts a done file the first time a subsection has a done row', () => {
    const done = `${DIR}/8-done-phase-1.md`;
    const repo = memory(Object.fromEntries(Object.entries(split().files).filter(([file]) => file !== done)));
    repo.files[PLAN] = (repo.files[PLAN] ?? '').replace('chưa làm', 'xong (2026-11-12, 123)');
    run([], repo);
    expect(repo.files[done]).toMatch(
      /^# Kế hoạch triển khai Elvaria · §8, task đã xong: Giai đoạn 1 — Real\n/,
    );
    expect(repo.files[PLAN]).toContain('[8-done-phase-1.md](implementation-plan/8-done-phase-1.md)');
  });

  it('refuses an index without §8', () => {
    expect(run([], memory({ [PLAN]: '# Plan\n' }))).toEqual({
      code: 1,
      text: `plan-split: ${PLAN} has no §8`,
    });
  });
});

describe('plan-split.mjs as a process', () => {
  it('reads the repo, loses no line, and writes nothing under --check', () => {
    const result = spawnSync(process.execPath, [SCRIPT, '--check'], {
      env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '' },
      encoding: 'utf8',
    });
    expect(`${result.stdout}${result.stderr}`).toMatch(/^plan-split: \d+ lines before, 0 lost, /);
  });
});
