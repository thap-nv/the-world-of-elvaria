import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { MemoSchema, TerritorySchema, TribeIdSchema, createIdSource } from '@elvaria/domain';
import type { Quest } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { translator } from '@elvaria/i18n';
import { createFakeRunner, openFileTreasury } from '@elvaria/runner-core';
import type { AgentRunner } from '@elvaria/runner-core';
import { createSteward, folderPlots } from '@elvaria/steward';
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TZ, foundKingdom, run, tempDir, testIo } from '../../test/cli.ts';
import { consoleBell } from '../run/bell.ts';
import { sayCommand } from './say.ts';
import type { TempDir, TestIo } from '../../test/cli.ts';
import type { Runners } from './hearing.ts';

const REPLIES = path.join(
  import.meta.dirname,
  ...['..', '..', '..', '..', 'packages', 'chancellor', 'src', '__fixtures__', 'structured-output'],
);
const replyOf = async (name: string): Promise<unknown> =>
  JSON.parse(await readFile(path.join(REPLIES, `${name}.json`), 'utf8'));

const CLAUDE = TribeIdSchema.parse('claude');
const MEMO = MemoSchema.parse({
  version: 1,
  id: 'm_20261106_4k2pqz',
  kind: 'proposal',
  from: 'thorn',
  quest: 'q_20261106_7k3m2a',
  attempt: 1,
  to: { route: 'chancellor' },
  body: 'Kiểm tra link trong README.md.',
  refs: ['README.md'],
  state: 'open',
  filed_at: '2026-11-06T08:10:00+07:00',
});

/** A FakeRunner whose sessions end with `structured` as their structured output, as `--json-schema` gives it. */
function replying(structured: unknown): AgentRunner {
  const fake = createFakeRunner();
  return {
    ...fake,
    spawn: async (req) => {
      const session = await fake.spawn(req);
      return { ...session, wait: async () => ({ ...(await session.wait()), structured }) };
    },
  };
}

describe('elvaria say', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    await openKingdom(kingdom).territories.write(
      TerritorySchema.parse({
        version: 1,
        id: 'dc1-se-team',
        name: 'dc1-se-team',
        path: path.join(dir.root, 'dc1-se-team').replaceAll('\\', '/'),
        kind: 'code',
        vcs: { type: 'git', default_branch: 'main' },
        commands: {},
        checks: [],
        laws: { forbidden_paths: [], forbidden_commands: [] },
        secrets_allowed: ['database_url'],
      }),
    );
  });
  afterEach(() => dir.remove());

  const summon = async (id: string, klass: string) => {
    expect(await run(testIo(), 'character', 'add', id, '--class', klass, '--kingdom', kingdom)).toBe(0);
  };

  const say = (io: TestIo, words: string, runners: Runners) =>
    sayCommand({ runnersOf: () => runners }).run(
      { values: { kingdom }, positionals: [words] },
      { io, locale: 'en', localeFromFlag: true, t: translator('en') },
    );

  /** One tick of the Steward, with no runner: it applies the inbox and starts nothing. */
  async function stewardTick(): Promise<readonly Quest[]> {
    const io = testIo();
    const ids = createIdSource({ clock: io.clock, random: io.random, tz: TZ });
    if (!ids.ok) throw new Error('tz');
    const store = openKingdom(kingdom);
    const steward = createSteward({
      store,
      events: openEventLog(kingdom),
      runners: {},
      plots: folderPlots(kingdom),
      // No session opens here, so no env and no secret is needed (P1-10).
      env: {},
      treasury: openFileTreasury(path.join(dir.root, 'no-treasury.json')),
      clock: io.clock,
      ids: ids.value,
      bell: consoleBell(translator('en'), io),
      log: { warn: () => undefined },
    });
    await steward.start({ loop: false });
    const report = await steward.tick();
    await steward.stop();
    expect(report.commands.rejected).toBe(0);
    return (await store.quests.list()).items;
  }

  it('sends the drafts to the Steward, which writes them as drafts under the ids the CLI printed', async () => {
    await summon('aldric', 'chancellor');
    const io = testIo();
    expect(
      await say(io, 'Viết lại docs/architecture.md theo 18 ADR', {
        [CLAUDE]: replying(await replyOf('split')),
      }),
    ).toBe(0);
    const ids = io.printed.out.flatMap((line) => /^Draft (q_\S+):/.exec(line)?.[1] ?? []);
    expect(io.printed.out[0]).toBe('Chancellor Aldric is listening…');
    expect(ids).toHaveLength(3);
    expect(io.printed.out).toContain(
      `Draft ${ids[0] ?? ''}: «Chia việc viết lại docs/architecture.md» (plan, rank C, Mage)`,
    );
    expect(io.printed.out.slice(-3)).toEqual([
      `Once the Steward has applied the commands (elvaria run), confirm each draft so it opens: elvaria quest confirm ${ids[0] ?? ''}`,
      'The Chancellor asks: Giữ nguyên thứ tự mục hiện có của docs/architecture.md hay sắp lại theo ADR?',
      expect.stringContaining('To answer, speak again') as string,
    ]);
    const quests = new Map((await stewardTick()).map((quest) => [quest.id, quest]));
    const [plan, first, second] = ids.map((id) => quests.get(id as Quest['id']));
    expect([plan?.status, first?.status, second?.status]).toEqual(['draft', 'draft', 'draft']);
    expect(plan).toMatchObject({
      created_by: 'chancellor',
      blocked: { question: expect.any(String) as string },
    });
    expect(first).toMatchObject({ depends_on: [ids[0]], parent_id: ids[0] });
    expect(second).toMatchObject({ depends_on: [ids[1]], parent_id: ids[0] });
  });

  it('prints the brief of work for the council, whose plan quest opens with it and waits for the seal (PS-06)', async () => {
    await summon('aldric', 'chancellor');
    const io = testIo();
    const council = { [CLAUDE]: replying(await replyOf('council')) };
    expect(await say(io, 'Lý do của trạm xá thành mã cộng chuỗi VI/EN', council)).toBe(0);
    const id = /^Draft (q_\S+):/.exec(io.printed.out[1] ?? '')?.[1] ?? '';
    expect(io.printed.out).toContain(`The Chancellor's brief for plan ${id}:`);
    expect(io.printed.out).toContain('  Out of scope: Đổi giao diện của thế giới');
    expect(io.printed.out).toContain(
      '  Question: Giữ chuỗi cũ trong event log? Recommended: Không: log mang mã',
    );
    expect(io.printed.out.at(-1)).toContain(`the recommended answers: elvaria quest confirm ${id}.`);
    const [plan] = await stewardTick();
    expect(plan).toMatchObject({ id, status: 'draft', kind: 'plan', seal_required: true });
    expect(plan?.estimate).toEqual({ tokens: 300_000, minutes: 40 });
    expect(plan?.description).toMatch(/^## Brief\n\n### Goal\n/);
  });

  it('names a script-tier draft by its script, and sends only what the kingdom has', async () => {
    await summon('aldric', 'chancellor');
    const link = testIo();
    expect(
      await say(link, 'Kiểm tra link trong docs', { [CLAUDE]: replying(await replyOf('link-check')) }),
    ).toBe(0);
    expect(link.printed.out[1]).toMatch(
      /^Draft q_\S+: «Kiểm tra link nội bộ trong docs» \(batch, rank E, script link-check\)$/,
    );
    const io = testIo();
    expect(await say(io, 'Thêm trạng thái đơn hàng', { [CLAUDE]: replying(await replyOf('screened')) })).toBe(
      0,
    );
    expect(io.printed.err).toEqual([
      'Dropped the draft «Hiện trạng thái đơn hàng trên web»: tag web_ui is not in registry/tags.json.',
      'Dropped the draft «Đồng bộ đơn hàng lên kho lưu trữ»: the territory does not allow secret aws_secret_access_key.',
      'Dropped the draft «Viết e2e cho trạng thái đơn hàng»: it needs draft d2, which was dropped.',
    ]);
    expect((await stewardTick()).map(({ title, status }) => [title, status]).sort()).toEqual([
      ['Kiểm tra link nội bộ trong docs', 'draft'],
      ['Thêm cột trạng thái cho bảng đơn hàng', 'draft'],
    ]);
  });

  it('still asks its question when no draft is left, and sends nothing', async () => {
    await summon('aldric', 'chancellor');
    const vague = (await replyOf('vague')) as { drafts: Record<string, unknown>[] };
    const offTags = { ...vague, drafts: vague.drafts.map((draft) => ({ ...draft, tags: ['ui'] })) };
    const io = testIo();
    expect(await say(io, 'Làm cho trang chủ tốt hơn', { [CLAUDE]: replying(offTags) })).toBe(1);
    expect(io.printed.out.slice(1, 2)).toEqual([
      'The Chancellor asks: Tốt hơn ở mặt nào: tốc độ tải, giao diện, hay nội dung?',
    ]);
    expect(io.printed.err.at(-1)).toBe('No draft is left to send.');
    expect(await openKingdom(kingdom).inbox.read()).toEqual([]);
  });

  it('says why the Chancellor gave nothing, and where its run is', async () => {
    await summon('aldric', 'chancellor');
    const io = testIo();
    const limited = createFakeRunner({ scenarioOf: () => 'rate_limit' });
    expect(await say(io, 'Kiểm tra link trong docs', { [CLAUDE]: limited })).toBe(1);
    expect(io.printed.err[0]).toBe(
      "The Chancellor's tribe has run out of mana for now; try again when it is back.",
    );
    expect(io.printed.err[1]).toMatch(/^The prompt and the session's output are in .*chancellor-/);
    const invalid = testIo();
    expect(
      await say(invalid, 'Làm cho tốt hơn', { [CLAUDE]: replying(await replyOf('two-questions')) }),
    ).toBe(1);
    expect(invalid.printed.err.slice(0, 2)).toEqual([
      "The Chancellor's reply does not follow the quest-draft contract:",
      '  drafts.1.question: the Chancellor asks at most one question',
    ]);
    const silent = testIo();
    expect(await say(silent, 'Làm cho tốt hơn', { [CLAUDE]: createFakeRunner() })).toBe(1);
    expect(silent.printed.err[0]).toBe("The Chancellor's session ended without a reply (outcome completed).");
  });

  it('needs an idle Chancellor whose tribe runs, and some words', async () => {
    await summon('thorn', 'knight');
    const io = testIo();
    expect(await say(io, 'Kiểm tra link', { [CLAUDE]: replying({}) })).toBe(1);
    expect(io.printed.err[0]).toMatch(
      /^Nobody can speak as the Chancellor: summon an idle character of class chancellor/,
    );
    await summon('aldric', 'chancellor');
    const asleep = testIo();
    expect(await say(asleep, 'Kiểm tra link', {})).toBe(1);
    expect(asleep.printed.err[0]).toMatch(/^Nobody can speak as the Chancellor/);
    const empty = testIo();
    expect(await run(empty, 'say', '  ', '--kingdom', kingdom, '--locale', 'en')).toBe(2);
    expect(empty.printed.err).toEqual([
      'Say something: elvaria say "<what you want done>", or hand over a letter: elvaria say --memo <memo>.',
    ]);
  });

  it("hands the Chancellor a letter with --memo, the owner's words after it, and drafts that close it (PS-02, PS-03b)", async () => {
    await summon('aldric', 'chancellor');
    await openKingdom(kingdom).memos.write(MEMO);
    const heard: string[] = [];
    const fake = replying(await replyOf('link-check'));
    const listening: AgentRunner = {
      ...fake,
      spawn: (req) => {
        heard.push(req.prompt.user);
        return fake.spawn(req);
      },
    };
    const io = testIo();
    const asked = sayCommand({ runnersOf: () => ({ [CLAUDE]: listening }) }).run(
      { values: { kingdom, memo: MEMO.id }, positionals: ['Chỉ docs/'] },
      { io, locale: 'en', localeFromFlag: true, t: translator('en') },
    );
    expect(await asked).toBe(0);
    expect(heard[0]).toContain(
      `A letter (proposal) that thorn wrote while working on quest q_20261106_7k3m2a: ${MEMO.body} Files: README.md.\n\nChỉ docs/`,
    );
    expect(io.printed.out.at(-1)).toBe(
      `The drafts carry letter ${MEMO.id}: confirming one of them closes the letter as handled by that quest (elvaria quest confirm <id>).`,
    );
    const inbox = await openKingdom(kingdom).inbox.read();
    expect(
      inbox.map(
        ({ command }) => command.ok && command.value.kind === 'create_quest' && command.value.payload.memos,
      ),
    ).toEqual([[MEMO.id]]);
    const unknown = testIo();
    expect(
      await run(unknown, 'say', '--memo', 'm_20261106_000000', '--kingdom', kingdom, '--locale', 'en'),
    ).toBe(1);
    expect(unknown.printed.err).toEqual(['There is no letter m_20261106_000000.']);
  });
});
