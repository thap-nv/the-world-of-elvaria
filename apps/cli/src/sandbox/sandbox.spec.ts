import { appendFile, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ok } from '@elvaria/domain';
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, printed, run, tempDir, testIo } from '../../test/cli.ts';
import type { TempDir, TestIo } from '../../test/cli.ts';

const DATE = '2026-11-06';
const dayFile = (kingdom: string, date = DATE) => path.join(kingdom, 'events', 'sandbox', `${date}.jsonl`);

describe('elvaria sandbox generate', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const generate = (io: TestIo, ...args: string[]) =>
    run(io, 'sandbox', 'generate', '--kingdom', kingdom, ...args);

  it('writes one fake day to events/sandbox/ and nothing else of the kingdom', async () => {
    const before = await readdir(kingdom, { recursive: true });
    const io = testIo();
    expect(await generate(io, '--day', 'busy', '--seed', '42', '--date', DATE)).toBe(0);
    const [summary, written, hint] = io.printed.out;
    expect(summary).toMatch(
      /^Đã sinh ngày giả «busy» \(seed 42\) cho 2026-11-06: \d+ dòng, 14 nhiệm vụ, 7 nhân vật\.$/,
    );
    expect(written).toBe(`Ghi vào ${dayFile(kingdom)}`);
    expect(hint).toContain(`elvaria sandbox replay "${dayFile(kingdom)}" --speed 20`);
    const added = (await readdir(kingdom, { recursive: true })).filter((entry) => !before.includes(entry));
    expect(added.toSorted()).toEqual([
      path.join('events', 'sandbox'),
      path.join('events', 'sandbox', `${DATE}.jsonl`),
    ]);
  });

  it('writes the same file for the same seed, and replaces it when run again', async () => {
    await generate(testIo(), '--seed', '7', '--date', DATE);
    const first = await readFile(dayFile(kingdom), 'utf8');
    await generate(testIo(), '--seed', '8', '--date', DATE);
    await generate(testIo(), '--seed', '7', '--date', DATE);
    expect(await readFile(dayFile(kingdom), 'utf8')).toBe(first);
  });

  it('draws a seed and takes today in the kingdom zone when neither is given, and says which', async () => {
    const io = testIo();
    expect(await generate(io, '--day', 'quiet')).toBe(0);
    expect(io.printed.out[0]).toMatch(/^Đã sinh ngày giả «quiet» \(seed \d+\) cho 2026-11-06: /);
  });

  it('refuses a wrong day, seed or date as a usage error', async () => {
    const io = testIo();
    const code = await generate(io, '--day', 'stormy', '--seed=-1', '--date', '06/11/2026');
    expect(code).toBe(2);
    expect(io.printed.err).toEqual([
      '--day chỉ nhận một trong: busy, quiet, mana-out.',
      '--seed phải là số nguyên từ 0 đến 4294967295.',
      '--date phải là một ngày có thật dạng YYYY-MM-DD, ví dụ 2026-11-06.',
    ]);
    expect(await generate(testIo(), '--seed', '4294967296')).toBe(2);
  });

  it('refuses a date that does not exist, and a kingdom without a tribe of the cast', async () => {
    const io = testIo();
    expect(await generate(io, '--date', '2026-02-30')).toBe(1);
    expect(printed(io)).toContain('--date phải là một ngày có thật');
    const store = openKingdom(kingdom);
    await store.kingdom.update((current) =>
      ok({ ...current, tribes: current.tribes.filter(({ id }) => id !== 'gemini') }),
    );
    const lonely = testIo();
    expect(await generate(lonely, '--date', DATE)).toBe(1);
    expect(lonely.printed.err).toEqual([
      'Kịch bản cần tộc gemini trong kingdom.tribes (elvaria init ghi sẵn claude và gemini).',
    ]);
  });

  it('says what the registry lacks, and refuses a registry that does not load', async () => {
    const tags = path.join(kingdom, 'registry', 'tags.json');
    const registry = JSON.parse(await readFile(tags, 'utf8')) as { tags: { id: string }[] };
    await writeFile(
      tags,
      JSON.stringify({ ...registry, tags: registry.tags.filter(({ id }) => id !== 'e2e') }),
    );
    // The default kinds choose a ritual by the e2e tag (P1-20): an owner who drops the tag drops those overrides too.
    const kindsFile = path.join(kingdom, 'registry', 'kinds.json');
    const kinds = JSON.parse(await readFile(kindsFile, 'utf8')) as { kinds: Record<string, unknown>[] };
    const plain = kinds.kinds.map(({ ritual_overrides: _dropped, ...kind }) => kind);
    await writeFile(kindsFile, JSON.stringify({ ...kinds, kinds: plain }));
    const io = testIo();
    expect(await generate(io, '--date', DATE)).toBe(1);
    expect(io.printed.err).toEqual(['Kịch bản cần tag «e2e» trong registry của vương quốc.']);
    await rm(tags);
    const broken = testIo();
    expect(await generate(broken, '--date', DATE)).toBe(1);
    expect(printed(broken)).toContain('tags.json');
  });
});

describe('elvaria sandbox replay', () => {
  let dir: TempDir;
  let kingdom: string;
  let file: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    await run(
      testIo(),
      'sandbox',
      'generate',
      '--kingdom',
      kingdom,
      '--day',
      'mana-out',
      '--seed',
      '42',
      '--date',
      DATE,
    );
    file = dayFile(kingdom);
  });
  afterEach(() => dir.remove());

  const lines = async () => (await readFile(file, 'utf8')).trimEnd().split('\n');

  it('prints the whole day as a timeline, paced by --speed', async () => {
    const io = testIo();
    expect(await run(io, 'sandbox', 'replay', file, '--kingdom', kingdom, '--speed', '20')).toBe(0);
    const count = (await lines()).length;
    const out = io.printed.out;
    expect(out[0]).toMatch(
      new RegExp(
        `^── DỮ LIỆU GIẢ · ngày 2026-11-06 · ${count} dòng · 08:30–\\d\\d:\\d\\d · nhanh ×20, khoảng \\d+ phút ──$`,
      ),
    );
    expect(out[1]).toBe('08:30:00  Lãnh thổ «Web Portal» gia nhập vương quốc');
    expect(out).toContain('08:30:03  Thorn xuất hiện: Hiệp sĩ cấp 3, tộc claude');
    expect(out.at(-1)).toBe(`── hết ngày giả: ${count} dòng ──`);
    expect(out).toHaveLength(count + 2);
    expect(out.some((line) => line.includes('Tộc claude hết mana (claude): cả tộc ngủ'))).toBe(true);
    // Every placeholder of every sentence was filled.
    expect(out.filter((line) => /\{[a-z_]+\}/.test(line))).toEqual([]);
    expect(io.slept.length).toBeGreaterThan(0);
    expect(io.printed.err).toEqual([]);
  });

  it('speaks English with --locale en, and works without a kingdom, naming classes by id', async () => {
    const english = testIo({ env: {} });
    expect(await run(english, 'sandbox', 'replay', file, '--locale', 'en', '--speed', '1000')).toBe(0);
    expect(english.printed.out).toContain('08:30:03  Thorn arrives: knight, level 3, tribe claude');
    expect(english.printed.out.filter((line) => /\{[a-z_]+\}/.test(line))).toEqual([]);
  });

  it('skips a line that is not an event, says so, and fails', async () => {
    await appendFile(file, '{"not":"an event"}\n');
    const io = testIo();
    expect(await run(io, 'sandbox', 'replay', file, '--kingdom', kingdom, '--speed', '1000')).toBe(1);
    expect(io.printed.err).toHaveLength(1);
    expect(io.printed.err[0]).toMatch(/^Dòng ở byte \d+ bị bỏ qua \(/);
    expect(io.printed.out.at(-1)).toMatch(/dòng, 1 dòng lỗi ──$/);
  });

  it('refuses a missing or empty file, a wrong speed and a destination that does not exist yet', async () => {
    const missing = testIo();
    expect(
      await run(missing, 'sandbox', 'replay', path.join(dir.root, 'none.jsonl'), '--kingdom', kingdom),
    ).toBe(1);
    expect(printed(missing)).toContain('Sinh một ngày bằng: elvaria sandbox generate --day busy');
    await writeFile(file, '');
    const empty = testIo();
    expect(await run(empty, 'sandbox', 'replay', file, '--kingdom', kingdom)).toBe(1);
    expect(printed(empty)).toContain('không có dòng nào đọc được');
    for (const speed of ['0', '-2', 'fast']) {
      expect(await run(testIo(), 'sandbox', 'replay', file, '--speed', speed)).toBe(2);
    }
    const herald = testIo();
    expect(await run(herald, 'sandbox', 'replay', file, '--to', 'herald')).toBe(2);
    expect(printed(herald)).toContain('--to chỉ nhận một trong: terminal.');
  });

  it('fails when the kingdom it was told to use is not one', async () => {
    const io = testIo();
    expect(await run(io, 'sandbox', 'replay', file, '--kingdom', dir.root)).toBe(1);
    expect(printed(io)).toContain('chưa phải một vương quốc');
  });
});
