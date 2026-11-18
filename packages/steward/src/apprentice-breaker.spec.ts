// §3.12 invariant 3: a quest that meets a breaker while an apprentice of its session overran or was cut goes to the
// infirmary with a note asking for a child quest. The runner writes the apprentice's lines into the quest's journal
// under the session's id; here they are written by hand, as the runner would (P1-17).
import { EVENT_VERSION, EventSchema } from '@elvaria/domain';
import { openJournal } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload } from './__fixtures__/kingdom.ts';
import { plotsOf } from './__fixtures__/cuts.ts';
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
  it.each(['overrun', 'max_turns', 'finished', 'older'])(
    'carries only the cut session apprentice note into its continuation: %s',
    async (ending) => {
      kingdom = await bench({ plays: { work: { Hangs: ['hang', 'hang'] } } });
      steward = kingdom.steward({ plots: plotsOf(kingdom, true) });
      await steward.start({ loop: false });
      await kingdom.command('create_quest', questPayload('Hangs'));
      await steward.tick();
      const started = await kingdom.quest('Hangs');
      const session = started.attempt_log.at(-1)?.session_id ?? '';
      const type = ending === 'overrun' ? 'agent.subagent.overrun' : 'agent.subagent.end';
      const data = {
        agent_type: 'apprentice',
        duration_ms: 400_000,
        ...(ending === 'overrun' ? { limit_minutes: 5 } : {}),
        ...(ending === 'max_turns' || ending === 'older' ? { stopped: 'max_turns' } : {}),
      };
      const current = kingdom;
      await openJournal(kingdom.root, started.id).append([
        runnerLine(kingdom, started.id, ending === 'older' ? 'older-session' : session, type, data),
        // Push the signal beyond the prompt's twenty-line journal tail.
        ...Array.from({ length: 21 }, () =>
          runnerLine(current, started.id, session, 'agent.subagent.end', {
            agent_type: 'apprentice',
            duration_ms: 1,
          }),
        ),
      ]);
      kingdom.clock.advance(67.5);
      await steward.tick();
      expect(await kingdom.quest('Hangs')).toMatchObject({
        status: 'returned',
        attempt_log: [{ progress: true }],
      });
      await steward.tick();
      const requests = kingdom.requests.filter(({ role }) => role === 'assignee');
      expect(requests).toHaveLength(2);
      const prompt = requests.at(-1)?.prompt.user ?? '';
      const note = 'Record the unfinished apprentice work in handover.md and propose a child quest';
      if (ending === 'overrun' || ending === 'max_turns') expect(prompt).toContain(note);
      else expect(prompt).not.toContain(note);
      expect(kingdom.notices).toEqual([]);
    },
  );

  it.each([
    ['agent.subagent.overrun', { agent_type: 'apprentice', duration_ms: 400_000, limit_minutes: 5 }, true],
    ['agent.subagent.end', { agent_type: 'apprentice', duration_ms: 9_000, stopped: 'max_turns' }, true],
    ['agent.subagent.end', { agent_type: 'apprentice', duration_ms: 9_000 }, false],
  ])('after %s %j, asks for a child quest: %s', async (type, data, asks) => {
    kingdom = await bench({ plays: { work: { Hangs: ['hang', 'hang'] } } });
    steward = kingdom.steward();
    await steward.start({ loop: false });
    await kingdom.command('create_quest', questPayload('Hangs'));
    await steward.tick();
    // The first cut of a run goes on in a fresh session (ADR 0030); the note belongs to the cut that ends in the
    // infirmary, the second one without progress.
    kingdom.clock.advance(67.5);
    await steward.tick();
    await steward.tick();
    const started = await kingdom.quest('Hangs');
    expect(started.status).toBe('working');
    const session = started.attempt_log.at(-1)?.session_id ?? '';
    const journal = openJournal(kingdom.root, started.id);
    // Another session's apprentice says nothing about this one.
    const older = { agent_type: 'apprentice', duration_ms: 400_000, limit_minutes: 5 };
    await journal.append([
      runnerLine(kingdom, started.id, 'an-older-session', 'agent.subagent.overrun', older),
    ]);
    await journal.append([runnerLine(kingdom, started.id, session, type, data)]);
    kingdom.clock.advance(67.5);
    await steward.tick();
    expect((await kingdom.quest('Hangs')).status).toBe('infirmary');
    expect(kingdom.notices.at(-1)).toMatchObject({
      kind: 'infirmary',
      reason: { code: 'breaker:no_progress', params: { trip: 'time', run: 1 } },
    });
    const notice = kingdom.notices.at(-1);
    const left = notice?.kind === 'infirmary' ? notice.detail?.apprentice_left : undefined;
    expect(left).toBe(asks ? true : undefined);
  });
});
