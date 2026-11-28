// The 30 in-scope disruptions of the test suite (plans/learning-loop.md §2, §3.4): each a shortened chain of the
// lines the kingdom's log holds (or would hold) for it, with sample ids. `scored` is the hand score of the plan;
// `level` is what disruptionsOf with the default registry reads today, which a task that adds an event or a field
// raises in the same commit. `cause` is the kind whose match names the cause; without it the case shows a symptom
// at most.
import { linesOf, QUEST, questView, SESSION, TERRITORY } from './lines.ts';
import type { LineSpec } from './lines.ts';
import type { Event } from '../../schema/event/event.ts';

export const LEVELS = ['full', 'partial', 'none'] as const;
export type Level = (typeof LEVELS)[number];

export interface SuiteCase {
  readonly id: string;
  /** What the case is, in a few words of our own. */
  readonly about: string;
  readonly scored: Level;
  readonly level: Level;
  /** The kinds disruptionsOf reports, in its order. */
  readonly kinds: readonly string[];
  readonly cause?: string;
  readonly events: readonly Event[];
}

const q = (spec: LineSpec): LineSpec => ({ quest: QUEST, territory: TERRITORY, ...spec });
const infirmary = (code: string): LineSpec =>
  q({ type: 'quest.infirmary', data: { ...questView('infirmary'), reason: { code, params: {} } } });
const redRun = (): LineSpec[] => [
  q({ type: 'check.end', attempt: 1, data: { outcome: 'fail', checks: [] } }),
  q({ type: 'verdict.fail', attempt: 1, data: { verdict: `${QUEST}-1`, fail_kind: 'tests_fail' } }),
];

type CaseSpec = Omit<SuiteCase, 'events'> & { readonly lines: readonly LineSpec[] };

/** A case no default kind reads: no symptom, no cause. */
const unseen = (id: string, about: string, scored: Level, lines: readonly LineSpec[]): CaseSpec => ({
  id,
  about,
  scored,
  level: 'none',
  kinds: [],
  lines,
});

const SPECS: readonly CaseSpec[] = [
  // Recognised with their cause.
  {
    id: 'L30',
    about: 'no character could take a quest of its rank',
    scored: 'full',
    level: 'full',
    kinds: ['unclaimable'],
    cause: 'unclaimable',
    lines: [q({ type: 'quest.unclaimable', data: { reason: 'level_too_low', rank: 's', class: 'knight' } })],
  },
  {
    id: 'L31',
    about: 'a session out of turns was still handed in',
    scored: 'full',
    level: 'full',
    kinds: ['session_cut_then_submitted'],
    cause: 'session_cut_then_submitted',
    lines: [
      q({ type: 'agent.session.end', session: SESSION, data: { outcome: 'max_turns' } }),
      q({ type: 'quest.submitted', session: SESSION, data: questView('review') }),
    ],
  },
  {
    id: 'L32',
    about: 'the Chancellor drafted for a class nobody has',
    scored: 'full',
    level: 'full',
    kinds: ['unclaimable'],
    cause: 'unclaimable',
    lines: [q({ type: 'quest.unclaimable', data: { reason: 'no_class', rank: 'c', class: 'bard' } })],
  },
  {
    id: 'L33',
    about: 'the scope missed files the work needed',
    scored: 'full',
    level: 'full',
    kinds: ['out_of_scope'],
    cause: 'out_of_scope',
    lines: [q({ type: 'quest.submitted', data: { ...questView('review'), out_of_scope: ['docs/a.md'] } })],
  },
  {
    id: 'L38',
    about: "a late verdict overturned a judge's pass",
    scored: 'full',
    level: 'full',
    kinds: ['pass_overturned'],
    cause: 'pass_overturned',
    lines: [{ type: 'character.judged', data: { role: 'judge', verdict: `${QUEST}-1-late` } }],
  },
  {
    id: 'L40',
    about: 'the code graph a session would ask was not built',
    scored: 'full',
    level: 'full',
    kinds: ['graph_failed'],
    cause: 'graph_failed',
    lines: [{ type: 'graph.failed', territory: TERRITORY, data: { reason: 'sample' } }],
  },
  {
    id: 'L42',
    about: 'a quest edited after its session opened',
    scored: 'full',
    level: 'full',
    kinds: ['edited_after_start'],
    cause: 'edited_after_start',
    lines: [
      q({ type: 'quest.started', data: questView('working') }),
      q({ type: 'quest.edited', data: questView('working') }),
    ],
  },
  {
    id: 'L17',
    about: 'three rounds of judging on one quest',
    scored: 'partial',
    level: 'full',
    kinds: ['many_rounds'],
    cause: 'many_rounds',
    lines: [1, 2, 3].map((n) =>
      q({ type: 'verdict.fail', attempt: n, data: { verdict: `${QUEST}-${n}`, fail_kind: 'incomplete' } }),
    ),
  },
  {
    id: 'L02',
    about: 'an edit killed the running session',
    scored: 'partial',
    level: 'full',
    kinds: ['edit_killed_session', 'edited_after_start'],
    cause: 'edit_killed_session',
    lines: [
      q({ type: 'quest.edited', at: 0, data: questView('working') }),
      q({ type: 'agent.session.end', at: 1, session: SESSION, data: { outcome: 'killed' } }),
    ],
  },
  {
    id: 'L01',
    about: 'a retry opened the quest to the whole class',
    scored: 'partial',
    level: 'full',
    kinds: ['retry_dropped_assignee'],
    cause: 'retry_dropped_assignee',
    lines: [
      infirmary('breaker:no_progress'),
      q({ type: 'quest.released', at: 600, data: questView('open', { assignee: null }) }),
      q({
        type: 'command.applied',
        at: 600,
        data: { command_id: '01JD0000000000000000000099', kind: 'retry' },
      }),
    ],
  },
  {
    id: 'L25',
    about: 'the Steward stopped halfway',
    scored: 'none',
    level: 'full',
    kinds: ['stopped_with_sessions'],
    cause: 'stopped_with_sessions',
    lines: [
      q({ type: 'agent.session.end', session: SESSION, data: { outcome: 'killed' } }),
      { type: 'steward.stopped', data: { reason: 'owner', sessions: 1 } },
    ],
  },
  {
    id: 'L35',
    about: 'the Steward died halfway',
    scored: 'none',
    level: 'full',
    kinds: ['steward_died'],
    cause: 'steward_died',
    lines: [
      { type: 'steward.started', at: 0, data: { build: null, previous: 'first' } },
      q({ type: 'quest.started', data: questView('working') }),
      { type: 'steward.started', at: 3600, data: { build: null, previous: 'unclean', down_minutes: 59 } },
    ],
  },
  {
    id: 'lockfile',
    about: 'setup ran again after the lockfile changed, and failed',
    scored: 'none',
    level: 'full',
    kinds: ['plot_setup_failed', 'setup_failed'],
    cause: 'plot_setup_failed',
    lines: [
      q({ type: 'plot.setup', data: { trigger: 'first', pass: true, log_path: 'a.log' } }),
      q({ type: 'plot.setup', data: { trigger: 'changed', pass: false, log_path: 'a.log' } }),
      infirmary('breaker:setup'),
    ],
  },
  // A symptom; the cause is free text, a guess from the clock, or a field the log lacks.
  {
    id: 'L03',
    about: 'a tribe check failed on a busy file (text only)',
    scored: 'partial',
    level: 'partial',
    kinds: ['tribe_check_failed'],
    lines: [{ type: 'tribe.checked', data: { tribe: 'claude', outcome: 'failed', tokens: 0, checks: [] } }],
  },
  {
    id: 'L05',
    about: 'a missing setup step showed as a refused commit',
    scored: 'partial',
    level: 'partial',
    kinds: ['commit_refused'],
    lines: [infirmary('breaker:commit')],
  },
  {
    id: 'L29',
    about: 'a missing build showed as a failed setup',
    scored: 'partial',
    level: 'partial',
    kinds: ['setup_failed'],
    lines: [infirmary('breaker:setup')],
  },
  {
    id: 'L39',
    about: 'the merge train went red',
    scored: 'partial',
    level: 'partial',
    kinds: ['delivery_refused'],
    lines: [{ type: 'delivery.failed', quest: QUEST, data: { stage: 'checks', reason: 'checks_red' } }],
  },
  {
    id: 'L43',
    about: 'the merge queue stood still for 48 minutes',
    scored: 'partial',
    level: 'partial',
    kinds: ['guest_waited'],
    lines: [
      { type: 'delivery.enqueued', at: 0, data: { territory: TERRITORY, pr: 7 } },
      { type: 'patrol.ran', at: 600, data: { territory: TERRITORY, setup: null, checks: [] } },
      { type: 'delivery.guest_merged', at: 2857, data: { territory: TERRITORY, pr: 7 } },
    ],
  },
  {
    id: 'L44',
    about: 'git commit ran out of its 120 s ceiling (in the lines only)',
    scored: 'partial',
    level: 'partial',
    kinds: ['commit_refused'],
    lines: [infirmary('breaker:commit')],
  },
  {
    id: 'L47',
    about: 'the pre-push hook ran out of time',
    scored: 'partial',
    level: 'partial',
    kinds: ['delivery_refused'],
    lines: [{ type: 'delivery.failed', quest: QUEST, data: { stage: 'push', reason: 'push_refused' } }],
  },
  {
    id: 'L48',
    about: 'the guest lane exited 3',
    scored: 'partial',
    level: 'partial',
    kinds: ['guest_refused'],
    lines: [{ type: 'delivery.guest_refused', data: { territory: TERRITORY, pr: 8, reason: 'checks_red' } }],
  },
  // Scored a symptom by hand, but its symptom is a red check or a question: a rule on it would match every
  // wrong piece of work too, so it waits for the cause codes of LL-05 (or stays out, VH12).
  unseen('L06', 'a check red from the sandbox', 'partial', redRun()),
  unseen('L36', 'a check that timed out', 'partial', redRun()),
  unseen('L37', 'another check that timed out', 'partial', redRun()),
  unseen('L41', 'a check red under load', 'partial', redRun()),
  unseen('L46', 'an empty question', 'partial', [q({ type: 'quest.blocked', data: questView('blocked') })]),
  unseen('AH-08b', 'a red README check', 'partial', redRun()),
  // No trace in the log.
  unseen('L04', 'a plot left behind', 'none', [q({ type: 'quest.archived', data: questView('archived') })]),
  unseen('L08', 'another plot left behind', 'none', [
    q({ type: 'quest.archived', data: questView('archived') }),
  ]),
  unseen('L09', "a tribe's CLI replaced under the pinned build", 'none', [
    q({ type: 'quest.claimed', data: questView('claimed') }),
  ]),
];

export const SUITE: readonly SuiteCase[] = SPECS.map(({ lines, ...rest }) => ({
  ...rest,
  events: linesOf(lines),
}));
