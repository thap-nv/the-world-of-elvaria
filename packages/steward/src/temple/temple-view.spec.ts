// What a job sees of the Temple (PS-12f): the Steward folds the log at start and only its new lines at each tick, so
// a job's `ready` reads no log. kael fails `tests_fail` three times and the first tick suspends it; the count sees the
// suspension in the same tick, forgets it once a `temple.ran` written by someone else is in the log, and the Temple is
// due only while kingdom.schedule.temple is on. Whose mana opens a session comes beside it.
import { EVENT_VERSION, EventSchema } from '@elvaria/domain';
import type { Kingdom } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { TEMPLE_CAST, templeBench } from '../__fixtures__/temple.ts';
import type { Bench } from '../__fixtures__/kingdom.ts';
import type { JobView, OnCallJob, Steward } from '../types.ts';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

const STREAK = { fail_kind: 'tests_fail', count: 3 };
const CAST = TEMPLE_CAST.map((member) => (member.id === 'kael' ? { ...member, fail: STREAK } : member));

/** A job on call that never runs and keeps every view it is shown. */
function watching(): OnCallJob & { readonly views: JobView[] } {
  const views: JobView[] = [];
  return {
    id: 'watch',
    views,
    ready: (view) => {
      views.push(view);
      return Promise.resolve(false);
    },
    run: () => Promise.resolve(),
  };
}

async function editKingdom(kingdom: Bench, edit: (value: Kingdom) => Kingdom): Promise<void> {
  const read = await kingdom.store.kingdom.read();
  if (!read.ok) throw new Error('kingdom.json');
  const written = await kingdom.store.kingdom.write(edit(read.value));
  if (!written.ok) throw new Error('kingdom.json');
}

const templeRan = (id: string, day: string) =>
  EventSchema.parse({
    v: EVENT_VERSION,
    id,
    ts: `${day}T12:00:00+07:00`,
    type: 'temple.ran',
    actor: { kind: 'character', id: 'sage' },
    data: { trigger: 'suspension', day, groups: 1, operations: 1, letters: 0, tokens: 900 },
  });

describe("the Temple's count in a job's view (PS-12f)", () => {
  it('sees a suspension in its tick, forgets it after a temple.ran written elsewhere, and is due only when on', async () => {
    current = await templeBench(CAST);
    const job = watching();
    running = current.steward({ onCall: [job] });
    expect(await running.start({ loop: false })).toEqual({ ok: true });
    await running.tick();
    const first = job.views.at(-1);
    expect(first?.temple).toEqual({
      log: { last_day: null, judged: 0, fails: 0, suspended: ['kael'] },
      due: { due: false, why: 'disabled' },
    });
    expect([...(first?.mana_open ?? [])].toSorted()).toEqual(['kael', 'sable', 'sage']);

    await editKingdom(current, (value) => ({
      ...value,
      schedule: { ...value.schedule, temple: { ...value.schedule.temple, enabled: true } },
    }));
    await running.tick();
    expect(job.views.at(-1)?.temple.due).toEqual({ due: true, trigger: 'suspension' });

    const day = first?.day ?? '';
    await openEventLog(current.root).append([templeRan(current.ids.ulid(), day)]);
    await running.tick();
    expect(job.views.at(-1)?.temple).toEqual({
      log: { last_day: day, judged: 0, fails: 0, suspended: [] },
      due: { due: false, why: 'ran_today' },
    });
  });

  it('counts what the log held before the start, and leaves out a character whose pool is off', async () => {
    current = await templeBench(CAST);
    const first = current.steward();
    expect(await first.start({ loop: false })).toEqual({ ok: true });
    await first.tick();
    await first.stop();
    await editKingdom(current, (value) => ({
      ...value,
      tribes: value.tribes.map((tribe) =>
        tribe.id === 'gemini' ? { ...tribe, pools: { gemini_models: { enabled: false } } } : tribe,
      ),
    }));
    const job = watching();
    running = current.steward({ onCall: [job] });
    expect(await running.start({ loop: false })).toEqual({ ok: true });
    await running.tick();
    expect(job.views.at(-1)?.temple.log.suspended).toEqual(['kael']);
    expect([...(job.views.at(-1)?.mana_open ?? [])].toSorted()).toEqual(['kael', 'sable']);
  });
});
