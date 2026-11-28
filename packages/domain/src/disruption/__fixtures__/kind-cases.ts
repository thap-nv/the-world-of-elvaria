// One chain that each default kind matches and one, as close as possible, that it does not (LL-01 done-when).
import { QUEST, questView, SESSION, TERRITORY } from './lines.ts';
import type { LineSpec } from './lines.ts';

interface KindCase {
  readonly match: readonly LineSpec[];
  readonly miss: readonly LineSpec[];
}

const q = (spec: LineSpec): LineSpec => ({ quest: QUEST, territory: TERRITORY, ...spec });
const reason = (code: string): LineSpec =>
  q({ type: 'quest.infirmary', data: { ...questView('infirmary'), reason: { code, params: {} } } });
const sessionEnd = (outcome: string, at?: number): LineSpec =>
  q({ type: 'agent.session.end', session: SESSION, data: { outcome }, ...(at === undefined ? {} : { at }) });
const guest = (type: string, at: number, pr = 7): LineSpec => ({
  type,
  at,
  data: { territory: TERRITORY, pr },
});
/** The line that answers an inbox command naming the quest (LL-04). */
const command = (kind: string, at: number): LineSpec =>
  q({ type: 'command.applied', at, data: { command_id: '01JD0000000000000000000099', kind } });
const verdictFail = (attempt: number): LineSpec =>
  q({ type: 'verdict.fail', attempt, data: { verdict: `${QUEST}-${attempt}`, fail_kind: 'style' } });

export const KIND_CASES: Readonly<Record<string, KindCase>> = {
  unclaimable: {
    match: [q({ type: 'quest.unclaimable', data: { reason: null, class: 'knight' } })],
    miss: [q({ type: 'quest.claimed', data: questView('claimed') })],
  },
  session_cut_then_submitted: {
    match: [
      sessionEnd('budget'),
      q({ type: 'quest.submitted', session: SESSION, data: questView('review') }),
    ],
    miss: [
      sessionEnd('max_turns'),
      q({ type: 'quest.returned', session: SESSION, data: questView('returned') }),
    ],
  },
  edit_killed_session: {
    match: [q({ type: 'quest.edited', at: 0, data: questView('working') }), sessionEnd('killed', 30)],
    miss: [q({ type: 'quest.edited', at: 0, data: questView('working') }), sessionEnd('killed', 600)],
  },
  edited_after_start: {
    match: [q({ type: 'quest.edited', data: questView('review') })],
    miss: [q({ type: 'quest.edited', data: questView('open') })],
  },
  retry_dropped_assignee: {
    match: [q({ type: 'quest.released', at: 0, data: questView('open') }), command('retry', 1)],
    miss: [q({ type: 'quest.released', at: 0, data: questView('open') }), command('cancel', 1)],
  },
  guest_waited: {
    match: [guest('delivery.enqueued', 0), guest('delivery.guest_merged', 1800)],
    miss: [
      guest('delivery.enqueued', 0),
      guest('delivery.guest_refused', 60),
      guest('delivery.enqueued', 1700),
      guest('delivery.guest_merged', 1800),
    ],
  },
  commit_refused: { match: [reason('breaker:commit_errors')], miss: [reason('breaker:patch')] },
  setup_failed: { match: [reason('breaker:setup')], miss: [reason('breaker:commit')] },
  patrol_setup_failed: {
    match: [{ type: 'patrol.ran', data: { territory: TERRITORY, setup: { pass: false }, checks: [] } }],
    miss: [{ type: 'patrol.ran', data: { territory: TERRITORY, setup: null, checks: [] } }],
  },
  delivery_refused: {
    match: [{ type: 'delivery.failed', quest: QUEST, data: { stage: 'merge', reason: 'conflict' } }],
    miss: [{ type: 'delivery.merged', quest: QUEST, data: {} }],
  },
  guest_refused: {
    match: [{ type: 'delivery.guest_refused', data: { territory: TERRITORY, pr: 9, reason: 'conflict' } }],
    miss: [guest('delivery.guest_merged', 0, 9)],
  },
  checks_stopped: {
    match: [q({ type: 'check.end', data: { outcome: 'stopped', checks: [] } })],
    miss: [q({ type: 'check.end', data: { outcome: 'error', checks: [] } })],
  },
  many_rounds: { match: [verdictFail(4)], miss: [verdictFail(1), verdictFail(2)] },
  out_of_scope: {
    match: [q({ type: 'quest.submitted', data: { ...questView('review'), out_of_scope: ['a.md'] } })],
    miss: [q({ type: 'quest.submitted', data: questView('review') })],
  },
  pass_overturned: {
    match: [{ type: 'character.judged', data: { role: 'judge' } }],
    miss: [{ type: 'character.judged', data: { role: 'assignee' } }],
  },
  graph_failed: {
    match: [{ type: 'graph.failed', territory: TERRITORY, data: { reason: 'sample' } }],
    miss: [{ type: 'graph.built', territory: TERRITORY, data: { duration_ms: 1 } }],
  },
  tribe_check_failed: {
    match: [{ type: 'tribe.checked', data: { tribe: 'codex', outcome: 'failed' } }],
    miss: [{ type: 'tribe.checked', data: { tribe: 'codex', outcome: 'passed' } }],
  },
  stopped_with_sessions: {
    match: [{ type: 'steward.stopped', data: { reason: 'owner', sessions: 2 } }],
    miss: [{ type: 'steward.stopped', data: { reason: 'owner', sessions: 0 } }],
  },
  steward_died: {
    match: [{ type: 'steward.started', data: { build: null, previous: 'unclean', down_minutes: 9 } }],
    miss: [{ type: 'steward.started', data: { build: null, previous: 'clean', down_minutes: 9 } }],
  },
  plot_setup_failed: {
    match: [q({ type: 'plot.setup', data: { trigger: 'changed', pass: false, log_path: 'a.log' } })],
    miss: [q({ type: 'plot.setup', data: { trigger: 'changed', pass: true, log_path: 'a.log' } })],
  },
};
