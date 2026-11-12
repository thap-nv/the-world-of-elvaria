import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { EventSchema, VerdictSchema } from '@elvaria/domain';
import type { Attempt, Metrics } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, printed, run, tempDir, testIo } from '../../test/cli.ts';
import { OTHER_QUEST_ID, QUEST_ID, plantQuests, questFixture } from '../../test/quest.ts';
import { readMetricsSource } from './read.ts';
import type { TempDir, TestIo } from '../../test/cli.ts';

const DAY = '2026-11-06';
const at = (hour: number) => `${DAY}T${String(hour).padStart(2, '0')}:00:00+07:00`;
const NOTES = 'The README still names the old command.';

const entry = (quest: string, n: number, role: Attempt['role'], character: string, hour: number) => ({
  n,
  character,
  role,
  started_at: at(hour),
  ended_at: at(hour + 1),
  outcome: 'submitted',
  session_id: `s-${quest.slice(-2)}-${role}-${n}`,
  tokens: 1000,
  run_dir: role === 'verifier' ? `.runs/${quest}-${n}/verify` : `.runs/${quest}-${n}`,
});

const verdict = (quest: string, n: number, fields: Record<string, unknown>) =>
  VerdictSchema.parse({
    version: 1,
    id: `${quest}-${n}`,
    quest_id: quest,
    attempt: n,
    verifier_id: 'vesper',
    ritual: 'build_review',
    checks: [],
    result: 'pass',
    by_human: false,
    session_id: `s-${quest.slice(-2)}-verifier-${n}`,
    created_at: at(n * 2 + 1),
    ...fields,
  });

const owner = (quest: string, n: number, fields: Record<string, unknown>) =>
  verdict(quest, n, {
    id: `${quest}-${n}-user`,
    verifier_id: 'user',
    by_human: true,
    session_id: undefined,
    ...fields,
  });

/**
 * One quest redone after a style fail and sealed, one the owner returned after the judge passed it; a return
 * command applied, a seal (not an intervention) applied, and two files in inbox/done the reader cannot use.
 */
async function stageDay(kingdom: string): Promise<void> {
  await plantQuests(
    kingdom,
    questFixture('archived', QUEST_ID, {
      attempts: 2,
      attempt_log: [
        entry(QUEST_ID, 1, 'assignee', 'thorn', 1),
        entry(QUEST_ID, 1, 'verifier', 'vesper', 2),
        entry(QUEST_ID, 2, 'assignee', 'thorn', 3),
        entry(QUEST_ID, 2, 'verifier', 'vesper', 4),
      ],
      seal: { at: at(6) },
    }),
    questFixture('returned', OTHER_QUEST_ID, {
      assignee: 'thorn',
      attempts: 1,
      attempt_log: [
        entry(OTHER_QUEST_ID, 1, 'assignee', 'thorn', 1),
        entry(OTHER_QUEST_ID, 1, 'verifier', 'vesper', 2),
      ],
    }),
  );
  const store = openKingdom(kingdom);
  for (const judged of [
    verdict(QUEST_ID, 1, { result: 'fail', fail_kind: 'style', notes: NOTES }),
    verdict(QUEST_ID, 2, {}),
    owner(QUEST_ID, 2, { created_at: at(6) }),
    verdict(OTHER_QUEST_ID, 1, {}),
    owner(OTHER_QUEST_ID, 1, {
      result: 'fail',
      fail_kind: 'other',
      notes: NOTES,
      rejudge: true,
      created_at: at(7),
    }),
  ])
    await store.verdicts.write(judged);
  const commands = [
    { kind: 'return', payload: { quest: OTHER_QUEST_ID, notes: NOTES } },
    { kind: 'seal', payload: { quest: QUEST_ID } },
  ] as const;
  const ids = ['01JC0000000000000000000001', '01JC0000000000000000000002'];
  for (const [index, command] of commands.entries()) {
    await store.inbox.write({ version: 1, id: ids[index] ?? '', ts: at(7), source: 'cli', ...command });
    await store.inbox.ack(ids[index] ?? '');
  }
  const line = (id: string, type: string, data: Record<string, unknown>) =>
    EventSchema.parse({ v: 1, id, ts: at(8), type, actor: { kind: 'steward' }, data });
  await openEventLog(kingdom).append([
    line('01JC0000000000000000000010', 'agent.session.start', {
      session: 's-2a-assignee-1',
      model: 'claude-sonnet-5-5',
    }),
    ...ids.map((id, index) =>
      line(`01JC000000000000000000002${index}`, 'command.applied', { command_id: id }),
    ),
  ]);
  const done = path.join(kingdom, 'inbox', 'done');
  await writeFile(path.join(done, 'torn.json'), '{"version":', 'utf8');
  await writeFile(path.join(done, 'odd.json'), '{"version":1,"kind":"nothing"}', 'utf8');
}

describe('elvaria metrics', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const elvaria = (io: TestIo, ...args: string[]) =>
    run(io, 'metrics', ...args, '--kingdom', kingdom, '--locale', 'en');

  it('prints the ledger of a day and names the files it could not read, writing nothing', async () => {
    await stageDay(kingdom);
    const before = await readdir(kingdom, { recursive: true });
    const io = testIo();
    expect(await elvaria(io, '--since', DAY, '--until', DAY)).toBe(0);
    const text = printed(io);
    expect(text).toContain(`Metrics (${DAY} → ${DAY})`);
    expect(text).toContain('Runs: 6 (6 character sessions, 0 machine runs); 0 sessions stopped by mana');
    expect(text).toContain('Rework: 2 sessions (infra 0, output 2, question 0, unknown 0).');
    expect(text).toContain('First pass: 0/2 quests (0 %).');
    expect(text).toContain('Escaped defects (the owner returned a passed run): 1.');
    expect(text).toContain('Owner interventions: 1 commands, on 1 of 2 quests.');
    expect(text).toContain('Sealed quests: 1, 4000 tokens in all, 240.0 minutes on average');
    expect(text).toMatch(/output\s+verdict fail kind\s+style\s+1\s+1\s+2/);
    expect(text).toMatch(/claude-sonnet-5-5\s+0\s+1\s+0 %/);
    expect(text).toMatch(new RegExp(`${OTHER_QUEST_ID}\\s+1\\s+other\\s+yes`));
    expect(io.printed.err).toEqual([
      'Skipped, unreadable: inbox/done/odd.json: does not match the inbox command schema',
      'Skipped, unreadable: inbox/done/torn.json: not JSON',
    ]);
    expect(await readdir(kingdom, { recursive: true })).toEqual(before);
  });

  it('prints the whole ledger as JSON', async () => {
    await stageDay(kingdom);
    const io = testIo();
    expect(await elvaria(io, '--json')).toBe(0);
    const metrics = JSON.parse(io.printed.out.join('\n')) as Metrics;
    expect(metrics.window).toEqual({});
    expect(metrics.rework.map(({ cause, value }) => `${cause} ${String(value)}`)).toEqual([
      'output style',
      'output style',
    ]);
    expect(metrics.owner_commands.find(({ kind }) => kind === 'return')?.count).toBe(1);
  });

  it("reads what PS-01b writes: a command's kind, checks set aside for their environment, reads by file", async () => {
    await stageDay(kingdom);
    const line = (
      id: string,
      type: string,
      data: Record<string, unknown>,
      more: Record<string, unknown> = {},
    ) => EventSchema.parse({ v: 1, id, ts: at(9), type, actor: { kind: 'steward' }, data, ...more });
    const read = (id: string) =>
      line(id, 'agent.tool', { tool: 'read', path: 'apps/web/vi.json' }, { session: 's-9', quest: QUEST_ID });
    await openEventLog(kingdom).append([
      // A retry whose file left inbox/done: its line alone says what it was.
      line('01JC0000000000000000000030', 'command.applied', {
        command_id: '01JC0000000000000000000003',
        kind: 'retry',
      }),
      line(
        '01JC0000000000000000000031',
        'check.end',
        {
          outcome: 'fail',
          checks: [{ id: 'e2e', pass: false, duration_ms: 900 }],
          environment: { check: 'e2e', line: 'Cannot connect to the Docker daemon' },
        },
        { quest: QUEST_ID, attempt: 2 },
      ),
      ...['32', '33', '34'].map((n) => read(`01JC00000000000000000000${n}`)),
    ]);
    const io = testIo();
    expect(await elvaria(io, '--since', DAY, '--until', DAY)).toBe(0);
    const text = printed(io);
    expect(text).toContain('Owner interventions: 2 commands, on 1 of 2 quests.');
    expect(text).toContain('Check runs set aside for their environment (Docker down, a container gone): 1.');
    expect(text).toContain('File reads: 3; 1 files a session read more than once.');
    expect(text).toContain('Files a session read again (at most 10 rows, the most read first)');
    expect(text).toMatch(new RegExp(`s-9\\s+${QUEST_ID}\\s+apps/web/vi\\.json\\s+3`));
    expect(text).toMatch(/retry\s+1/);
  });

  it('says there is nothing to measure in a new kingdom', async () => {
    const io = testIo();
    expect(await elvaria(io, '--since', DAY)).toBe(0);
    expect(printed(io)).toContain(`Metrics (${DAY} → …)`);
    expect(printed(io)).toContain('None.');
    expect(printed(io)).toContain('Sealed quests: 0, 0 tokens in all, — minutes on average');
  });

  it('refuses a day that is not one, and a window that ends before it starts', async () => {
    for (const [args, message] of [
      [['--since', '2026-11-6'], '--since takes a day as yyyy-mm-dd, not "2026-11-6".'],
      [['--until', '2026-02-30'], '--until takes a day as yyyy-mm-dd, not "2026-02-30".'],
      [['--until', '2026-13-01'], '--until takes a day as yyyy-mm-dd, not "2026-13-01".'],
      [['--since', '2026-11-07', '--until', DAY], `--since 2026-11-07 comes after --until ${DAY}.`],
    ] as const) {
      const io = testIo();
      expect(await elvaria(io, ...args)).toBe(2);
      expect(io.printed.err).toEqual([message]);
    }
  });

  it('needs a kingdom', async () => {
    const io = testIo();
    expect(await run(io, 'metrics', '--locale', 'en')).toBe(1);
  });
});

describe('readMetricsSource', () => {
  let dir: TempDir;
  beforeEach(async () => {
    dir = await tempDir();
  });
  afterEach(() => dir.remove());

  it('reads a folder with no kingdom files as an empty ledger, and names a bad quest file', async () => {
    await mkdir(path.join(dir.root, 'quests'), { recursive: true });
    await writeFile(path.join(dir.root, 'quests', `${QUEST_ID}.json`), '{}', 'utf8');
    const source = await readMetricsSource(dir.root);
    expect(source.input).toEqual({ quests: [], verdicts: [], events: [], commands: [] });
    expect(source.skipped).toHaveLength(1);
    expect(source.skipped[0]).toContain(`quests/${QUEST_ID}.json`);
  });

  it('names an event line it could not read with its file and offset', async () => {
    await mkdir(path.join(dir.root, 'events'), { recursive: true });
    await writeFile(path.join(dir.root, 'events', `${DAY}.jsonl`), 'not json\n', 'utf8');
    const source = await readMetricsSource(dir.root);
    expect(source.skipped).toEqual([expect.stringMatching(new RegExp(`^events/${DAY}\\.jsonl@0: `))]);
  });
});
