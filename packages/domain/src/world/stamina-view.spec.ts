// sessionStaminaOf (PS-28): the bar of each quest's open session folded from log lines, as a journal holds them.
import { describe, expect, it } from 'vitest';

import { CAMPAIGNS, CHARACTERS, KINGDOM, QUESTS, QUEST_VIEW, TERRITORIES } from './__fixtures__/examples.ts';
import { reduce } from './reduce.ts';
import { sessionStaminaOf } from './stamina-view.ts';
import { worldStateOf } from './world-state.ts';
import type { CharacterId } from '../core/ids.ts';
import type { Role } from '../schema/common.ts';
import type { Event } from '../schema/event/event.ts';
import type { QuestView } from './quest-view.ts';

const Q = QUEST_VIEW.id;
const THORN = 'thorn' as CharacterId;
const WREN = 'wren' as CharacterId;
const KAEL = 'kael' as CharacterId;
const STEWARD = { kind: 'steward' } as const;
let minute = 0;

function line(type: string, fields: Partial<Event>, data: Record<string, unknown> = {}): Event {
  minute += 1;
  const ts = `2026-11-17T18:${String(minute % 60).padStart(2, '0')}:00+07:00`;
  return {
    v: 2,
    id: `L${String(minute)}` as Event['id'],
    ts,
    type,
    actor: STEWARD,
    quest: Q,
    attempt: 1,
    ...fields,
    data,
  };
}

interface Seat {
  readonly session?: string;
  readonly attempt?: number;
  readonly assignee?: CharacterId | null;
  readonly verifier?: CharacterId | null;
}

/** A line of the Steward that moves the quest, with its view after the move. */
const moved = (type: string, status: QuestView['status'], seat: Seat = {}): Event => {
  const { session, attempt = 1, assignee = THORN, verifier = null } = seat;
  const view = { ...QUEST_VIEW, status, assignee, verifier };
  return line(type, { attempt, ...(session === undefined ? {} : { session }) }, { quest: view });
};
const start = (session: string, who = THORN, attempt = 1) =>
  line(
    'agent.session.start',
    { session, attempt, actor: { kind: 'character', id: who } },
    { session, model: 'm' },
  );
const notch = (session: string, used: number, role: Role = 'assignee', limit = 300_060) =>
  line(
    'agent.session.usage',
    { session },
    { role, measure: 'tokens', used, limit, pct: (used * 100) / limit, soft_pct: 85, hard_pct: 150 },
  );
const wrapUp = (session: string) =>
  line('agent.session.wrap_up', { session }, { measure: 'tokens', used: 1, limit: 2, pct: 50 });
const end = (session: string, outcome = 'completed') =>
  line('agent.session.end', { session, actor: { kind: 'character', id: THORN } }, { outcome });

/** An assignee's session S opened the way the Steward opens one: the quest line, then the hook's start. */
const opened = (session: string, attempt = 1) => [
  moved('quest.started', 'working', { session, attempt }),
  start(session, THORN, attempt),
];

describe('sessionStaminaOf', () => {
  it('opens a full bar at the start, sets it at each notch, marks the reminder, and closes it at the end', () => {
    const begun = [moved('quest.claimed', 'claimed'), ...opened('s1')];
    expect(sessionStaminaOf(begun).get(Q)).toEqual({
      quest: Q,
      session: 's1',
      role: 'assignee',
      character: THORN,
      attempt: 1,
      left_pct: 100,
      zone: 'ok',
      stamina: undefined,
      at: undefined,
      reminded: false,
      previous: undefined,
    });
    const notched = notch('s1', 256_060);
    const running = [...begun, notch('s1', 100_000), notched, wrapUp('s1')];
    const bar = sessionStaminaOf(running).get(Q);
    expect(bar).toMatchObject({ zone: 'wrap_up', at: notched.ts, reminded: true });
    expect(bar?.stamina).toMatchObject({ measure: 'tokens', used: 256_060, notch: 5 });
    expect(bar?.left_pct).toBeCloseTo(43.1092, 3);
    expect(sessionStaminaOf([...running, end('s1')]).size).toBe(0);
  });

  it('gives a fresh session after a cut that goes on (ADR 0030) a full bar, and says where the last one was cut', () => {
    const cut = notch('s1', 462_564);
    const events = [
      ...opened('s1'),
      notch('s1', 256_060),
      cut,
      end('s1', 'killed'),
      moved('quest.returned', 'returned'),
      ...opened('s2'),
    ];
    const bar = sessionStaminaOf(events).get(Q);
    expect(bar).toMatchObject({ session: 's2', left_pct: 100, zone: 'ok', reminded: false });
    expect(bar?.previous).toMatchObject({
      session: 's1',
      outcome: 'killed',
      stamina: { measure: 'tokens', used: 462_564, left_pct: 0 },
    });
    // The CLI that stopped itself at its own ceiling is a cut too.
    const stopped = [
      ...opened('s1'),
      end('s1', 'max_turns'),
      moved('quest.returned', 'returned'),
      ...opened('s2'),
    ];
    expect(sessionStaminaOf(stopped).get(Q)?.previous).toEqual({
      session: 's1',
      outcome: 'max_turns',
      stamina: undefined,
    });
  });

  it('keeps no bar after two cuts in a row without progress send the quest to the infirmary', () => {
    const events = [
      ...opened('s1'),
      notch('s1', 462_564),
      end('s1', 'killed'),
      moved('quest.returned', 'returned'),
      ...opened('s2'),
      notch('s2', 470_000),
      end('s2', 'killed'),
      moved('quest.infirmary', 'infirmary'),
    ];
    expect(sessionStaminaOf(events).size).toBe(0);
  });

  it("gives the judge's session of the quest a bar of its own, with no previous", () => {
    const events = [
      ...opened('s1'),
      notch('s1', 100_000),
      end('s1'),
      moved('quest.submitted', 'review'),
      moved('quest.started', 'review', { session: 'v1', verifier: WREN }),
      start('v1', WREN),
      notch('v1', 300_000, 'verifier', 600_120),
    ];
    const bar = sessionStaminaOf(events).get(Q);
    expect(bar).toMatchObject({ session: 'v1', role: 'verifier', character: WREN, previous: undefined });
    expect(bar?.stamina).toMatchObject({ role: 'verifier', mark_left_pct: undefined, zone: 'ok' });
  });

  it('names no previous cut when the session before was killed for something else, or belongs elsewhere', () => {
    const asleep = [
      ...opened('s1'),
      end('s1', 'killed'),
      moved('quest.paused', 'paused_mana'),
      moved('quest.resumed', 'working', { session: 's2' }),
    ];
    expect(sessionStaminaOf(asleep).get(Q)).toMatchObject({ session: 's2', previous: undefined });
    const crashed = [
      ...opened('s1'),
      end('s1', 'error'),
      moved('quest.returned', 'returned'),
      ...opened('s2'),
    ];
    expect(sessionStaminaOf(crashed).get(Q)?.previous).toBeUndefined();
    const nextRun = [
      ...opened('s1'),
      end('s1', 'killed'),
      moved('quest.returned', 'returned'),
      ...opened('s2', 2),
    ];
    expect(sessionStaminaOf(nextRun).get(Q)).toMatchObject({ attempt: 2, previous: undefined });
    const judgeCut = [
      moved('quest.started', 'review', { session: 'v1', verifier: WREN }),
      end('v1', 'killed'),
      moved('quest.returned', 'returned'),
      moved('quest.started', 'review', { session: 'v2', verifier: KAEL }),
    ];
    expect(sessionStaminaOf(judgeCut).get(Q)).toMatchObject({ session: 'v2', previous: undefined });
    const judgeAfterCut = [...opened('s1'), end('s1', 'killed'), moved('quest.returned', 'returned')];
    const judged = [...judgeAfterCut, moved('quest.started', 'review', { session: 'v1', verifier: WREN })];
    expect(sessionStaminaOf(judged).get(Q)).toMatchObject({ role: 'verifier', previous: undefined });
    // A session resumed under its own id (an answer within resume_after_answer_minutes) did not go on from a cut.
    const resumed = [
      ...opened('s1'),
      end('s1', 'killed'),
      moved('quest.returned', 'returned'),
      ...opened('s1'),
    ];
    expect(sessionStaminaOf(resumed).get(Q)).toMatchObject({ session: 's1', previous: undefined });
  });

  it('closes a bar whose end line never came once a quest line says its seat is empty', () => {
    expect(sessionStaminaOf([...opened('s1'), moved('quest.infirmary', 'infirmary')]).size).toBe(0);
    const judge = [moved('quest.started', 'review', { session: 'v1', verifier: WREN })];
    expect(sessionStaminaOf([...judge, moved('quest.verdict', 'review')]).size).toBe(0);
    expect(sessionStaminaOf([...judge, moved('quest.done', 'done', { verifier: WREN })]).size).toBe(0);
    expect(sessionStaminaOf([...judge, moved('quest.edited', 'review', { verifier: WREN })]).size).toBe(1);
    // A start whose seat no line named yet waits for one: a claim does not hold it, the start that follows does.
    const early = [start('s1'), moved('quest.claimed', 'claimed', { session: 's1' })];
    expect(sessionStaminaOf(early).size).toBe(0);
    expect(sessionStaminaOf([start('s1'), moved('quest.edited', 'working')]).get(Q)?.role).toBeUndefined();
    expect(sessionStaminaOf([...early, ...opened('s1')]).get(Q)).toMatchObject({ role: 'assignee' });
  });

  it("gives a healer's session its seat as a doer, the healer's and not the assignee's (ADR 0034)", () => {
    const view = { ...QUEST_VIEW, status: 'healing', assignee: THORN, verifier: null } as const;
    const healing = line('quest.healing', { session: 'h1' }, { healer: WREN, quest: view });
    const bar = sessionStaminaOf([healing, notch('h1', 1)]).get(Q);
    expect(bar).toMatchObject({ session: 'h1', role: 'assignee', character: WREN });
    // A later line of the quest in healing keeps the seat; one that names no healer leaves it unknown.
    expect(sessionStaminaOf([healing, moved('quest.edited', 'healing')]).get(Q)?.character).toBe(WREN);
    const unnamed = moved('quest.edited', 'healing', { session: 'h2' });
    expect(sessionStaminaOf([unnamed]).get(Q)).toMatchObject({ role: 'assignee', character: undefined });
    expect(sessionStaminaOf([healing, moved('quest.submitted', 'review')]).size).toBe(0);
  });

  it("opens a bar from a notch or a reminder when the reader missed the start, as a journal's tail does", () => {
    expect(sessionStaminaOf([notch('s1', 300_000)]).get(Q)).toMatchObject({
      session: 's1',
      role: 'assignee',
      character: undefined,
    });
    expect(sessionStaminaOf([wrapUp('s1')]).get(Q)).toMatchObject({ role: 'assignee', reminded: true });
    expect(sessionStaminaOf([notch('s1', 1, 'verifier'), wrapUp('s1')]).get(Q)?.role).toBe('verifier');
  });

  it('takes the character of a machine run from nobody, and keeps the one the start line named', () => {
    const machine = [moved('quest.started', 'working', { session: 'm1', assignee: null })];
    expect(sessionStaminaOf(machine).get(Q)?.character).toBeUndefined();
    const named = [start('s1', KAEL), moved('quest.started', 'working', { session: 's1' })];
    expect(sessionStaminaOf(named).get(Q)?.character).toBe(KAEL);
  });

  it('is kept by nobody: the world state passes a notch line by (P0-09)', () => {
    const state = worldStateOf({
      kingdom: KINGDOM,
      territories: TERRITORIES,
      characters: CHARACTERS,
      quests: QUESTS,
      campaigns: CAMPAIGNS,
    });
    expect(reduce(state, [notch('s1', 300_000), wrapUp('s1')])).toBe(state);
  });

  it('is not broken by lines without a quest or a session, repeated lines, late lines and types it does not know', () => {
    const events = [
      line('mana.level', { quest: undefined }),
      line('agent.tool', { session: 's0' }, { tool: 'read' }),
      line('quest.escaped', {}, { quest: Q }),
      line('quest.unclaimable', {}, { reason: 'level_too_low' }),
      line('memo.closed', {}, { quest: Q }),
      line('stamina.future', { session: 's1' }),
      end('s0', 'killed'),
      ...opened('s1'),
      ...opened('s1'),
      notch('s1', 100_000),
      notch('s1', 100_000),
      line('agent.tool', { session: 's1' }, { tool: 'read' }),
      line(
        'quest.edited',
        { session: 's1' },
        { quest: { ...QUEST_VIEW, status: 'working', assignee: THORN } },
      ),
    ];
    const bar = sessionStaminaOf(events).get(Q);
    expect(bar).toMatchObject({ session: 's1', previous: undefined });
    expect(bar?.stamina?.used).toBe(100_000);
    const late = [...events, end('s1'), end('s1'), notch('s1', 200_000), wrapUp('s1')];
    expect(sessionStaminaOf(late).size).toBe(0);
  });
});
