// PS-12d: `elvaria temple evidence` over a kingdom on disk: three runs failed with one kind make a group whose notes
// are redacted and cut, a line of the Monk the ledger knows is shown, and nothing is written.
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ScriptureLedgerSchema, VerdictSchema } from '@elvaria/domain';
import type { TempleEvidence } from '@elvaria/domain';
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, printed, run, tempDir, testIo } from '../../test/cli.ts';
import { OTHER_QUEST_ID, QUEST_ID, plantQuests, questFixture } from '../../test/quest.ts';
import type { TempDir } from '../../test/cli.ts';

const TOKEN = `ghp_${'a'.repeat(36)}`;
const MONK_LINE = 'L_20261105_4k2pqz';
const QUESTS = [QUEST_ID, OTHER_QUEST_ID, 'q_20261106_9p5q4c'] as const;
const at = (hour: number) => `2026-11-06T${String(hour).padStart(2, '0')}:00:00+07:00`;

describe('elvaria temple evidence (PS-12d)', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  /** Three runs of thorn, each failed `incomplete`; the first verdict's notes carry a token and run long. */
  async function stage(): Promise<void> {
    const quests = QUESTS.map((id, index) =>
      questFixture('archived', id, {
        attempts: 1,
        attempt_log: [
          {
            n: 1,
            character: 'thorn',
            role: 'assignee',
            started_at: at(8 + index),
            ended_at: at(9 + index),
            outcome: 'submitted',
            session_id: `s-${index}`,
            tokens: 1000,
            run_dir: `.runs/${id}-1`,
          },
        ],
      }),
    );
    await plantQuests(kingdom, ...quests);
    const store = openKingdom(kingdom);
    for (const [index, id] of QUESTS.entries())
      await store.verdicts.write(
        VerdictSchema.parse({
          version: 1,
          id: `${id}-1`,
          quest_id: id,
          attempt: 1,
          verifier_id: 'vesper',
          ritual: 'build_review',
          checks: [],
          result: 'fail',
          fail_kind: 'incomplete',
          notes:
            index === 0
              ? `Pushed with ${TOKEN}. ${'The README is missing. '.repeat(40)}`
              : 'The README is missing.',
          by_human: false,
          session_id: `v-${id}`,
          created_at: at(20),
        }),
      );
    await mkdir(path.join(kingdom, 'temple'), { recursive: true });
    await writeFile(
      path.join(kingdom, 'temple', 'scripture.md'),
      `- [${MONK_LINE}] {fail_kind=incomplete} Tick each done-when item.\n- {fail_kind=style} Keep lines short.\n`,
      'utf8',
    );
    const ledger = ScriptureLedgerSchema.parse({
      version: 1,
      lessons: [
        {
          id: MONK_LINE,
          source: 'monk',
          source_verdict: `${QUEST_ID}-1`,
          added_at: '2026-11-05T09:00:00+07:00',
        },
      ],
    });
    await writeFile(path.join(kingdom, 'temple', 'scripture.json'), JSON.stringify(ledger), 'utf8');
  }

  async function evidence(
    ...args: string[]
  ): Promise<{ code: number; text: string; out: readonly string[] }> {
    const io = testIo({ platform: 'win32' });
    const code = await run(io, 'temple', 'evidence', ...args, '--kingdom', kingdom, '--locale', 'en');
    return { code, text: printed(io), out: io.printed.out };
  }

  it('prints the repeated failure with redacted notes cut at 600 characters, and writes nothing', async () => {
    await stage();
    const before = await readdir(kingdom, { recursive: true });
    const { code, out } = await evidence();
    expect(code).toBe(0);
    expect(out[0]).toBe('incomplete: 3 failed runs');
    expect(out[1]).toContain(`${QUEST_ID}-1 (—, —, `);
    expect(out[1]).not.toContain(TOKEN);
    expect(out[1]).toContain('Pushed with [redacted].');
    expect(out[1]?.endsWith('…')).toBe(true);
    expect(out[2]).toContain(`${OTHER_QUEST_ID}-1`);
    expect(out.at(-1)).toMatch(
      /^1 repeated failures, 2 lines of scripture, 0 worth a review: \d+ characters\.$/,
    );
    expect(await readdir(kingdom, { recursive: true })).toEqual(before);
  });

  it("gives the Monk's pack as JSON: who wrote each line, the checks, the scripts", async () => {
    await stage();
    const { code, text } = await evidence('--json');
    expect(code).toBe(0);
    const pack = JSON.parse(text) as TempleEvidence;
    expect(pack.groups.map(({ group, members }) => [group, members.length])).toEqual([['incomplete', 3]]);
    expect(pack.groups[0]?.members[0]?.notes).toHaveLength(600);
    expect(pack.lines.map(({ owner, source, fail_kind }) => [owner, source, fail_kind])).toEqual([
      ['temple', 'monk', 'incomplete'],
      ['temple', 'user', 'style'],
    ]);
    expect(pack.scripts.length).toBeGreaterThan(0);
    expect(pack.dropped).toEqual([]);
  });

  it('says the Temple would call no model when nothing repeats', async () => {
    const { code, out } = await evidence();
    expect(code).toBe(0);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(
      /^No repeated failure and no line worth a review: the Temple would call no model \(0 lines of scripture, \d+ characters\)\.$/,
    );
  });
});
