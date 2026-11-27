// `elvaria digest` without a Steward (P2-04): the waits only the running Steward knew before come from their lines of
// the log, a quest no judge may take and a tribe held by its CLI; and the list is the one the Steward's digest and the
// herald build from the same files and log (attentionOf).
import { EVENT_VERSION, EventSchema, attentionOf, ok } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { translator } from '@elvaria/i18n';
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../__fixtures__/cli.ts';
import { OTHER_QUEST_ID, QUEST_ID, plantQuests, questFixture } from '../__fixtures__/quest.ts';
import { digestMarkdown } from './markdown.ts';
import type { TempDir } from '../__fixtures__/cli.ts';

const AGY = 'C:/Users/owner/.gemini/bin/agy.exe';

let serial = 0;
const line = (type: string, data: Record<string, unknown>, quest?: string) => {
  serial += 1;
  return EventSchema.parse({
    v: EVENT_VERSION,
    id: `01JCF8X4Z6Q3W9N2M5R7T8V${String(serial).padStart(3, '0')}`,
    ts: '2026-11-06T08:40:00+07:00',
    type,
    actor: { kind: 'steward' },
    ...(quest === undefined ? {} : { quest }),
    data,
  });
};

const inReview = (id: string) =>
  questFixture('review', id, {
    assignee: 'thorn',
    attempts: 1,
    attempt_log: [
      {
        n: 1,
        character: 'thorn',
        role: 'assignee',
        started_at: '2026-11-06T08:10:00+07:00',
        ended_at: '2026-11-06T08:30:00+07:00',
        outcome: 'submitted',
        run_dir: `.runs/${id}-1`,
      },
    ],
  });

describe('elvaria digest without a Steward', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    // gemini's agy pinned at 1.5.6, never checked since: the version a hold is held to.
    const updated = await openKingdom(kingdom).kingdom.update((value) =>
      ok({
        ...value,
        tribes: value.tribes.map((tribe) =>
          tribe.id === 'gemini'
            ? { ...tribe, enabled: true, tool: { path: AGY, version: '1.5.6', auth: 'login' as const } }
            : tribe,
        ),
      }),
    );
    expect(updated.ok).toBe(true);
  });
  afterEach(() => dir.remove());

  const digest = async () => {
    const io = testIo();
    expect(await run(io, 'digest', '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    return io.printed.out;
  };

  it('names a quest waiting for a judge and a tribe held by its CLI, from their lines', async () => {
    await plantQuests(
      kingdom,
      inReview(QUEST_ID),
      inReview(OTHER_QUEST_ID),
      questFixture('open', 'q_20261106_9p4r8d'),
    );
    await openEventLog(kingdom).append([
      line('quest.judge_wait', { reason: 'unjudgeable' }, QUEST_ID),
      line(
        'quest.judge_wait',
        { reason: 'judge_mana', gauges: [{ tribe: 'gemini', pool: 'gemini_models' }] },
        OTHER_QUEST_ID,
      ),
      line('quest.judge_wait', { reason: null }, OTHER_QUEST_ID),
      line('quest.unclaimable', { reason: 'no_class', rank: 'D', class: 'knight' }, 'q_20261106_9p4r8d'),
      line('tribe.held', { tribe: 'gemini', hold: { path: AGY, version: '1.5.8', checked: '1.5.6' } }),
    ]);
    const out = (await digest()).join('\n');
    expect(out).toContain(
      `- Quest ${QUEST_ID} «Thêm script pnpm check» waits in review, but the kingdom has nobody who may judge it.`,
    );
    expect(out).not.toContain(`- Quest ${OTHER_QUEST_ID}`);
    expect(out).toContain(
      '- Quest q_20261106_9p4r8d «Thêm script pnpm check» (rank D) is one nobody can take.',
    );
    expect(out).toContain(
      `- Tribe gemini: its CLI ${AGY} now says 1.5.8, not 1.5.6, the version its last check with the real CLI passed on; the Steward opens no new session for it.`,
    );
    expect(out).toContain('the digest the Steward writes to digest/ lists the same');
  });

  it('lists what attentionOf lists from the same files and log', async () => {
    await plantQuests(kingdom, inReview(QUEST_ID), questFixture('draft', OTHER_QUEST_ID));
    await openEventLog(kingdom).append([line('quest.judge_wait', { reason: 'unjudgeable' }, QUEST_ID)]);
    const store = openKingdom(kingdom);
    const [settings, territories, characters, quests, memos, verdicts, registry, log] = await Promise.all([
      store.kingdom.read(),
      store.territories.list(),
      store.characters.list(),
      store.quests.list(),
      store.memos.list(),
      store.verdicts.list(),
      store.loadRegistry(),
      openEventLog(kingdom).read(),
    ]);
    if (!settings.ok || !registry.ok) throw new Error('fixture: kingdom');
    const items = attentionOf(
      {
        kingdom: settings.value,
        territories: territories.items,
        characters: characters.items,
        quests: quests.items,
        memos: memos.items,
        verdicts: verdicts.items,
        registry: registry.value,
        events: log.events,
      },
      testIo().clock.now(),
    );
    expect(items.map(({ kind }) => kind)).toEqual(['unjudgeable', 'draft']);
    const markdown = digestMarkdown(translator('en'), { day: '2026-11-06', name: 'Bình Minh', items });
    expect((await digest()).slice(0, -2)).toEqual(markdown.trimEnd().split('\n'));
  });
});
