// `elvaria chronicle` and the Steward's chronicle files (P2-06): the day's ledger in the owner's language, built by
// the machine from the log; the port writes the pair once, redacted, and the command prints it or builds it live.
import { ChronicleLedgerSchema, EVENT_VERSION, EventSchema, dayLedgerOf } from '@elvaria/domain';
import type { Event } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { translator } from '@elvaria/i18n';
import { simulateDay } from '@elvaria/sandbox';
import { inKingdom, openKingdom, pathExists, readTextFile, writeFileAtomic } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TZ, foundKingdom, run, tempDir, testIo } from '../__fixtures__/cli.ts';
import { QUEST_ID, plantQuests, questFixture } from '../__fixtures__/quest.ts';
import { fileChronicle } from './chronicle-file.ts';
import type { TempDir } from '../__fixtures__/cli.ts';

const TOKEN = `sk-ant-${'x'.repeat(24)}`;

/** A judge's pass on the planted quest at `ts` (no data schema to satisfy). */
const pass = (ts: string): Event =>
  EventSchema.parse({
    v: EVENT_VERSION,
    id: '01JC0000000000000000000P06',
    ts,
    actor: { kind: 'character', id: 'lyra' },
    type: 'verdict.pass',
    quest: QUEST_ID,
    data: { verdict: `${QUEST_ID}-1` },
  });

describe('elvaria chronicle', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const chronicle = async (...extra: string[]) => {
    const io = testIo();
    const code = await run(io, 'chronicle', '--kingdom', kingdom, '--locale', 'en', ...extra);
    return { code, out: io.printed.out, err: io.printed.err };
  };

  it('says a quiet day had nothing, built live, and writes nothing', async () => {
    expect((await chronicle()).out).toEqual([
      '# Chronicle of Bình Minh · 2026-11-06',
      '',
      'The machine wrote this part from the event log; no model wrote it and it spent no mana.',
      '',
      'Nothing to tell of this day: no quest done, returned, sealed, sent to the infirmary or delivered; no verdict, no level gained or lost, no pool asleep or awake.',
      '',
      'No chronicle/2026-11-06.md yet: this one was built on the spot from the event log, and no file was written.',
    ]);
    expect(await pathExists(inKingdom(kingdom, 'chronicle/2026-11-06.md'))).toBe(false);
  });

  it("tells a day's lines at the kingdom's local time, with the quest's title from its file", async () => {
    await plantQuests(kingdom, questFixture('done'));
    // 01:30 UTC is 08:30 in Ho Chi Minh City, on the 6th.
    await openEventLog(kingdom).append([pass('2026-11-06T01:30:00Z')]);
    const { out } = await chronicle('--day', '2026-11-06');
    expect(out).toContain('- Verdict: pass: 1');
    expect(out).toContain('- Quests named: 1');
    expect(out.find((line) => line.startsWith('- 08:30'))).toBe(
      `- 08:30 · Verdict: pass: ${QUEST_ID} “Thêm script pnpm check”, territory do-an`,
    );
    expect((await chronicle('--day', '2026-11-05')).out).toContain(
      'Nothing to tell of this day: no quest done, returned, sealed, sent to the infirmary or delivered; no verdict, no level gained or lost, no pool asleep or awake.',
    );
  });

  it("prints the Steward's file when there is one", async () => {
    await writeFileAtomic(inKingdom(kingdom, 'chronicle/2026-11-04.md'), '# Written\n\nBy the Steward.\n');
    expect((await chronicle('--day', '2026-11-04')).out).toEqual(['# Written', '', 'By the Steward.']);
  });

  it('refuses a day that is not one', async () => {
    const { code, err } = await chronicle('--day', '6/11');
    expect(code).toBe(2);
    expect(err).toEqual(['--day must be a day, YYYY-MM-DD.']);
  });
});

describe("the Steward's chronicle port", () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const ledgerOf = (title: string) => {
    const quest = questFixture('done', QUEST_ID, { title });
    const ledger = dayLedgerOf(
      [pass('2026-11-06T08:30:00+07:00')],
      { tz: TZ, characters: [], quests: [quest] },
      '2026-11-06',
    );
    if (!ledger.ok) throw new Error('fixture: ledger');
    return ledger.value;
  };

  it('writes the ledger and its words once, redacted, in the owner’s language', async () => {
    const port = fileChronicle(translator('vi'), kingdom, 'Bình Minh');
    expect(await port.write({ day: '2026-11-06', ledger: ledgerOf(`Rotate ${TOKEN}`) })).toBe(
      'chronicle/2026-11-06.md',
    );
    const markdown = await readTextFile(inKingdom(kingdom, 'chronicle/2026-11-06.md'));
    const json = await readTextFile(inKingdom(kingdom, 'chronicle/2026-11-06.json'));
    expect(markdown).toContain('# Biên niên sử Bình Minh · 2026-11-06');
    expect(markdown).toContain(`- 08:30 · Phán quyết đạt: ${QUEST_ID} «Rotate [redacted]»`);
    expect(`${markdown}${json}`).not.toContain(TOKEN);
    const saved = ChronicleLedgerSchema.parse(JSON.parse(json ?? ''));
    expect(saved.entries[0]?.title).toBe('Rotate [redacted]');

    await port.write({ day: '2026-11-06', ledger: ledgerOf('Another title') });
    expect(await readTextFile(inKingdom(kingdom, 'chronicle/2026-11-06.md'))).toBe(markdown);
  });
});

describe('the ledger of a sandbox day', () => {
  let dir: TempDir;
  beforeEach(async () => {
    dir = await tempDir();
  });
  afterEach(() => dir.remove());

  it('counts what the day did, type by type', async () => {
    const store = openKingdom(await foundKingdom(dir.root));
    const [kingdom, registry] = await Promise.all([store.kingdom.read(), store.loadRegistry()]);
    if (!kingdom.ok || !registry.ok) throw new Error('fixture: kingdom');
    const day = simulateDay({
      day: 'busy',
      seed: 7,
      date: '2026-11-06',
      kingdom: kingdom.value,
      registry: registry.value,
    });
    if (!day.ok) throw new Error('fixture: day');
    const { events, evening } = day.value;
    const ledger = dayLedgerOf(
      events,
      { tz: TZ, characters: evening.characters, quests: evening.quests },
      '2026-11-06',
    );
    if (!ledger.ok) throw new Error('no ledger');
    const lines = (type: string) => events.filter((event) => event.type === type).length;
    expect(lines('quest.done')).toBeGreaterThan(0);
    expect(ledger.value.counts).toEqual({
      quest_done: lines('quest.done'),
      quest_returned: lines('quest.returned'),
      quest_sealed: lines('quest.sealed'),
      quest_infirmary: lines('quest.infirmary'),
      quest_delivered: lines('quest.delivered'),
      quest_merged: lines('delivery.merged'),
      verdict_pass: lines('verdict.pass'),
      verdict_fail: lines('verdict.fail'),
      level_up: lines('character.level_up'),
      level_down: lines('character.level_down'),
      pool_asleep: lines('mana.exhausted'),
      pool_awake: lines('mana.restored'),
    });
  });
});
