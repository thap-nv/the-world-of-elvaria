import { isEventOf } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, expect, it } from 'vitest';

import { bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { createRecorder } from './record.ts';
import { verifierHandsInPart } from './review/judge.ts';
import { loadWorld } from './world.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Context } from './context.ts';
import type { Notice, Steward } from './types.ts';
import type { RunResult } from '@elvaria/runner-core';

let kingdom: Bench | undefined;
let steward: Steward | undefined;
afterEach(async () => {
  await steward?.stop();
  await kingdom?.remove();
});

it('records a partial cause without until when the settlement has no progress location', async () => {
  const partial = { result: 'partial', progress: { checked_until: 'src/app.ts' } };
  kingdom = await bench({ plays: { verdicts: { Partial: [partial, partial, partial] } } });
  steward = kingdom.steward();
  expect(await steward.start({ loop: false })).toEqual({ ok: true });
  const at = kingdom;
  await at.command('create_quest', questPayload('Partial'));
  await tickUntil(steward, at.clock, async () => {
    const quest = await at.quest('Partial');
    const judges = quest.attempt_log.filter(({ role }) => role === 'verifier');
    return judges.length === 3 && quest.verifier !== null;
  });
  const quest = await at.quest('Partial');
  const character = quest.verifier;
  if (typeof character !== 'string') throw new Error('no verifier');
  const log = { warn: (message: string) => at.warnings.push(message) };
  const world = await loadWorld(at.store, log);
  if (world === undefined) throw new Error('no world');
  const events = openEventLog(at.root);
  const record = createRecorder({
    world,
    store: at.store,
    events,
    ids: at.ids,
    log,
    stamp: () => new Date(at.clock.now()).toISOString(),
  });
  const ctx = {
    root: at.root,
    world,
    record,
    deps: {
      bell: {
        ring: (notice: Notice) => {
          at.notices.push(notice);
          return Promise.resolve();
        },
      },
      log,
    },
  } as unknown as Context;
  const result: RunResult = {
    outcome: 'completed',
    exit_code: 0,
    session_id: 'partial-without-location',
    usage: { tokens: 0 },
    duration_ms: 0,
    permission_denials: [],
    rate_limited: false,
  };
  // Settlement retains this fallback even though today's verdict schema requires progress.
  const moved = await verifierHandsInPart(
    ctx,
    { quest: quest.id, n: 1, character, session_id: result.session_id },
    result,
    {},
  );
  expect(moved.ok).toBe(true);
  const line = (await events.read()).events.findLast((event) => isEventOf(event, 'quest.infirmary'));
  expect(line?.data).toMatchObject({
    reason: { code: 'judge:partial_verdicts', params: { count: 3, run: 1 } },
    detail: { partial_verdicts: 3 },
  });
});
