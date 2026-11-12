// A submitted quest whose judges are all held by their mana (PS-03, (d) of the P1-50 report): thorn (Claude, Sonnet)
// hands it in, orin (Gemini, Argon) is the only judge, and the Gemini account is spent. The bell rings once; once the
// gauge reopens, the judge's session opens as before (ADR 0008 unchanged).
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { statusIs } from './__fixtures__/review.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Digest, DigestRequest, Steward } from './types.ts';
import type { ProbeResult } from '@elvaria/runner-core';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

const RESETS = '2026-11-07T14:00:00+07:00';

describe('a quest whose judges are all held by their mana', () => {
  it('rings once and is in the digest, then is judged once the gauge reopens', async () => {
    const gemini = { spent: true };
    const probe = (): ProbeResult =>
      gemini.spent
        ? { status: 'rate_limited', windows: [{ window: 'five_hour', used_pct: 100, resets_at: RESETS }] }
        : { status: 'ok' };
    current = await bench({
      cast: [
        { id: 'thorn', cls: 'knight', level: 5 },
        { id: 'orin', cls: 'judge', tribe: 'gemini', model: 'gemini-4-argon-medium' },
      ],
      probes: { gemini: probe },
    });
    const asked: DigestRequest[] = [];
    const digest: Digest = {
      write: (request) => Promise.resolve(void asked.push(request)).then(() => `digest/${request.day}.md`),
    };
    // The digest at 09:30, after the quest is in review.
    const kingdom = current;
    const settings = await kingdom.store.kingdom.read();
    if (!settings.ok) throw new Error('kingdom.json');
    const schedule = { ...settings.value.schedule, digest: { enabled: true, at: '09:30' } };
    await kingdom.store.kingdom.write({ ...settings.value, schedule });
    running = kingdom.steward({ digest });
    expect(await running.start({ loop: false })).toEqual({ ok: true });
    await kingdom.command('create_quest', questPayload('Judged later'));
    await tickUntil(running, kingdom.clock, statusIs(kingdom, 'Judged later', 'review'));
    for (let tick = 0; tick < 3; tick += 1) await running.tick();
    const quest = await kingdom.quest('Judged later');
    expect(quest).toMatchObject({ status: 'review', verifier: null });
    const rung = () => kingdom.notices.filter(({ kind }) => kind === 'judge_mana');
    expect(rung()).toEqual([
      {
        kind: 'judge_mana',
        quest: { id: quest.id, title: 'Judged later', rank: 'D' },
        classes: ['judge'],
        gauges: [{ tribe: 'gemini', pool: 'gemini', resets_at: RESETS }],
      },
    ]);
    await tickUntil(running, kingdom.clock, () => Promise.resolve(asked.length === 1));
    expect(asked[0]?.items).toEqual([
      expect.objectContaining({ group: 'must', kind: 'judge_mana', quest: quest.id, class: 'judge' }),
      expect.objectContaining({ group: 'can_wait', kind: 'mana_asleep', tribe: 'gemini', pool: 'gemini' }),
    ]);
    // The window resets at 14:00 and the account comes back: the probe wakes the pool, and orin judges as before.
    gemini.spent = false;
    kingdom.clock.advance(5 * 60);
    await tickUntil(running, kingdom.clock, statusIs(kingdom, 'Judged later', 'done'));
    expect(rung()).toHaveLength(1);
    expect((await kingdom.quest('Judged later')).attempt_log.at(-1)).toMatchObject({ character: 'orin' });
  });
});
