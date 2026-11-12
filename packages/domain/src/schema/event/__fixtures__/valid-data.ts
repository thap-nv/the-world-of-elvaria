// One valid `data` per event type that has a data schema, for event.spec.ts: the table must name every one of
// them (its type says so). Out of the spec, whose file reached its limit when the upgrade.* lines came (PS-04b).
import { CHARACTER_VIEW, QUEST_VIEW, TERRITORY_VIEW } from '../../../world/__fixtures__/examples.ts';
import type { TypedEventType } from '../event-data.ts';

export const ULID = '01JCFB7Q2R8S4T6V9W3X5Y1Z0A';

// The views of the v1 examples: what the Steward writes after a change (world/*-view.ts).
export const QUEST_CHANGE = { quest: QUEST_VIEW, characters: [CHARACTER_VIEW] };
export const CHARACTER_CHANGE = { character: CHARACTER_VIEW };
export const TERRITORY_CHANGE = { territory: TERRITORY_VIEW };
export const POOL = { tribe: 'gemini', pool: 'gemini_models' };
/** Two commits of the Elvaria repo: the build pinned before an upgrade, and the one it moves to. */
export const SHA_OLD = '4bc14e9d0c2a7f1e3b5d6a8c9e0f1a2b3c4d5e6f';
export const SHA_NEW = 'b0b2605a1c3e5f7a9b1d3f5a7c9e1b3d5f7a9c1e';

// One valid `data` per type that has a data schema: the table must name every one of them.
export const VALID_DATA: Record<TypedEventType, Record<string, unknown>> = {
  'quest.drafted': QUEST_CHANGE,
  'quest.created': { quest: QUEST_VIEW },
  'quest.claimed': QUEST_CHANGE,
  'quest.released': QUEST_CHANGE,
  'quest.started': QUEST_CHANGE,
  'quest.submitted': QUEST_CHANGE,
  'quest.returned': QUEST_CHANGE,
  'quest.verdict': QUEST_CHANGE,
  'quest.done': QUEST_CHANGE,
  'quest.sealed': QUEST_CHANGE,
  'quest.archived': { ...QUEST_CHANGE, characters: [] },
  'quest.blocked': QUEST_CHANGE,
  'quest.unblocked': QUEST_CHANGE,
  'quest.paused': QUEST_CHANGE,
  'quest.resumed': QUEST_CHANGE,
  'quest.infirmary': {
    reason: 'breaker:commit: elvaria.patch was not applied: touches src/a.ts',
    trip: 'commit',
    detail: { patch: 'touches src/a.ts', wip: 'hook refused', apprentice_left: true },
    ...QUEST_CHANGE,
  },
  'quest.delivered': QUEST_CHANGE,
  'quest.edited': { quest: QUEST_VIEW },
  'quest.unclaimable': {
    reason: 'level_too_low',
    rank: 'A',
    class: 'knight',
    best_character: 'thorn',
    best_level: 5,
  },
  'character.created': CHARACTER_CHANGE,
  'character.sleep': CHARACTER_CHANGE,
  'character.wake': CHARACTER_CHANGE,
  'character.meditate': CHARACTER_CHANGE,
  'character.suspend': CHARACTER_CHANGE,
  'character.release': CHARACTER_CHANGE,
  'character.swamp': CHARACTER_CHANGE,
  'character.level_up': CHARACTER_CHANGE,
  'character.level_down': CHARACTER_CHANGE,
  'character.model_changed': CHARACTER_CHANGE,
  'territory.attached': TERRITORY_CHANGE,
  'territory.surveyed': TERRITORY_CHANGE,
  'territory.health': TERRITORY_CHANGE,
  'mana.exhausted': POOL,
  'mana.restored': { ...POOL, model: 'argon' },
  'agent.tool': { tool: 'bash', command: 'pnpm test', exit: 0, duration_ms: 5120, url: 'https://x.dev' },
  'agent.tool.blocked': { tool: 'write', reason: 'forbidden path .env' },
  'agent.session.start': { session: 'abc-123', model: 'claude-opus-4.1' },
  'agent.session.end': { outcome: 'completed', usage: { tokens: 18_000, turns: 12 } },
  'agent.subagent.end': { agent_type: 'apprentice', duration_ms: 90_000, stopped: 'max_turns' },
  'agent.subagent.overrun': { agent_type: 'apprentice', duration_ms: 400_000, limit_minutes: 5 },
  'check.start': {},
  'check.end': { outcome: 'fail', checks: [{ id: 'unit', pass: false, duration_ms: 900 }] },
  'mana.signal': { error: 'rate_limit', source: 'stop_failure' },
  'mana.level': { tribe: 'claude', pool: 'claude', window: 'weekly', used_pct: 0, source: 'estimate' },
  'mana.warning': {
    tribe: 'gemini',
    pool: 'gemini_models',
    window: 'weekly',
    used_pct: 88.5,
    source: 'rate_limits',
    model: 'argon',
  },
  'command.applied': { command_id: ULID },
  'command.rejected': { command_id: ULID, reason: 'quest is not awaiting_seal' },
  'plot.patched': { file: 'elvaria.patch', paths: ['.husky/pre-push'] },
  'plot.merged': {
    into: 'quest/q_20261109_y90za6',
    merged: ['quest/q_20261109_ms5j7d'],
    pending: ['quest/q_20261109_bdyrzv'],
    stop: 'conflict',
    conflicts: ['apps/web/src/api.ts'],
  },
  'plot.restored': { paths: ['apps/api/openapi.json', 'coverage/'] },
  'upgrade.started': { ref: 'main', to: SHA_NEW, from: SHA_OLD },
  'upgrade.switched': { from: null, to: SHA_NEW },
  'upgrade.rolled_back': { from: SHA_NEW, to: SHA_OLD },
  'upgrade.failed': { to: SHA_NEW, step: 'doctor', reason: 'exit 1' },
};
