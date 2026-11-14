// §3.12 invariant 3: a quest that meets a breaker while an apprentice of its session overran or was cut goes to the
// infirmary with a note asking for a child quest. The runner writes the apprentice's lines into the quest's journal
// under the session's id; here they are written by hand, as the runner would (P1-17).
import { EVENT_VERSION, EventSchema } from '@elvaria/domain';
import { openJournal } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload } from './__fixtures__/kingdom.ts';
import { APPRENTICE_LEFT } from './infirmary.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Steward } from './types.ts';

let kingdom: Bench | undefined;
let steward: Steward | undefined;
afterEach(async () => {
  await steward?.stop();
  await kingdom?.remove();
  steward = undefined;
  kingdom = undefined;
});

/** A line the runner writes for the session `session` of `quest`. */
const runnerLine = (k: Bench, quest: string, session: string, type: string, data: Record<string, unknown>) =>
  EventSchema.parse({
    v: EVENT_VERSION,
    id: k.ids.ulid(),
    ts: '2026-11-07T09:10:00+07:00',
    type,
    actor: { kind: 'character', id: 'thorn' },
    quest,
    attempt: 1,
    session,
    data,
  });

describe('a breaker after an apprentice ran long or was cut', () => {
  it.each([
    ['agent.subagent.overrun', { agent_type: 'apprentice', duration_ms: 400_000, limit_minutes: 5 }, true],
    ['agent.subagent.end', { agent_type: 'apprentice', duration_ms: 9_000, stopped: 'max_turns' }, true],
    ['agent.subagent.end', { agent_type: 'apprentice', duration_ms: 9_000 }, false],
  ])('after %s %j, asks for a child quest: %s', async (type, data, asks) => {
    kingdom = await bench({ plays: { work: { Hangs: ['hang'] } } });
    steward = kingdom.steward();
    await steward.start({ loop: false });
    await kingdom.command('create_quest', questPayload('Hangs'));
    await steward.tick();
    const started = await kingdom.quest('Hangs');
    const session = started.attempt_log.at(-1)?.session_id ?? '';
    const journal = openJournal(kingdom.root, started.id);
    // Another session's apprentice says nothing about this one.
    const older = { agent_type: 'apprentice', duration_ms: 400_000, limit_minutes: 5 };
    await journal.append([
      runnerLine(kingdom, started.id, 'an-older-session', 'agent.subagent.overrun', older),
    ]);
    await journal.append([runnerLine(kingdom, started.id, session, type, data)]);
    kingdom.clock.advance(45);
    await steward.tick();
    expect((await kingdom.quest('Hangs')).status).toBe('infirmary');
    expect(kingdom.notices.at(-1)).toMatchObject({
      kind: 'infirmary',
      reason: `breaker:time: ran 45 min, limit 45 min${asks ? APPRENTICE_LEFT : ''}`,
    });
  });
});
