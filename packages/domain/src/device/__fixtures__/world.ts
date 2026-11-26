// A small world over two territories for the specs of scopeState and scopeEvents: a quest, a memo and a character on
// each, a memo of no quest, a campaign, and lines built by hand around them.
import {
  CAMPAIGNS,
  CHARACTER_VIEW,
  KINGDOM,
  QUEST_VIEW,
  TERRITORY_VIEW,
} from '../../world/__fixtures__/examples.ts';
import { worldStateOf } from '../../world/world-state.ts';
import type { CharacterId, MemoId, MemoKindId, QuestId, TerritoryId, Ulid } from '../../core/ids.ts';
import type { Event } from '../../schema/event/event.ts';
import type { CharacterView } from '../../world/character-view.ts';
import type { MemoView } from '../../world/memo-view.ts';
import type { QuestView } from '../../world/quest-view.ts';
import type { WorldState } from '../../world/world-state.ts';

export const HOME = TERRITORY_VIEW.id;
export const AWAY = 'elvaria' as TerritoryId;

export const Q_HOME: QuestView = QUEST_VIEW;
export const Q_AWAY: QuestView = { ...QUEST_VIEW, id: 'q_20261106_9p4r8d' as QuestId, territory: AWAY };
/** A quest of the territory the state does not hold yet. */
export const Q_LATER = 'q_20261107_2w6t9c' as QuestId;

/** Holds the quest at home; `sable` judges the one away. */
export const THORN: CharacterView = { ...CHARACTER_VIEW, current: { quest: Q_HOME.id, role: 'assignee' } };
export const SABLE: CharacterView = {
  ...CHARACTER_VIEW,
  id: 'sable' as CharacterId,
  name: 'Sable',
  current: { quest: Q_AWAY.id, role: 'verifier' },
};

const memo = (id: string, quest: QuestId | null): MemoView => ({
  id: id as MemoId,
  kind: 'proposal' as MemoKindId,
  quest,
  route: null,
});
export const M_HOME = memo('m_20261106_aaaaaa', Q_HOME.id);
export const M_AWAY = memo('m_20261106_bbbbbb', Q_AWAY.id);
export const M_LOOSE = memo('m_20261106_cccccc', null);
export const M_LATER = memo('m_20261106_dddddd', Q_LATER);

const base = worldStateOf({
  kingdom: KINGDOM,
  territories: [],
  characters: [],
  quests: [],
  campaigns: CAMPAIGNS,
});

export const WORLD: WorldState = {
  ...base,
  territories: { [HOME]: TERRITORY_VIEW, [AWAY]: { ...TERRITORY_VIEW, id: AWAY, name: 'Elvaria' } },
  quests: { [Q_HOME.id]: Q_HOME, [Q_AWAY.id]: Q_AWAY },
  characters: { [THORN.id]: THORN, [SABLE.id]: SABLE },
  memos: { [M_HOME.id]: M_HOME, [M_AWAY.id]: M_AWAY, [M_LOOSE.id]: M_LOOSE },
};

let serial = 0;

/** A line of `type`; the envelope fields given (`quest`, `territory`) as in the log. */
export function line(type: string, data: Record<string, unknown>, envelope: Partial<Event> = {}): Event {
  serial += 1;
  return {
    v: 2,
    id: `01M6QC${String(serial).padStart(20, '0')}` as Ulid,
    ts: '2026-11-06T09:00:00+07:00',
    type,
    actor: { kind: 'steward' },
    data,
    ...envelope,
  };
}

/** A quest line carrying the quest after it, and the characters it moved. */
export const questLine = (type: string, quest: QuestView, characters?: readonly CharacterView[]): Event =>
  line(type, { quest, ...(characters === undefined ? {} : { characters }) }, { quest: quest.id });
