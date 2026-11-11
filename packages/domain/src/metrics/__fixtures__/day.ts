// A small milestone day for the metrics specs: each quest is one pattern of the stage-1 run (a style fail, judges a
// breaker cut, an assignee a breaker stopped, a question, a script, a mana pause, an owner's return), plus a review
// that ends the next day and a quest the owner cancelled before anyone worked it.
import { appliedLine, at, commandOf, lineOf, questId, questOf, verdictOf } from './ledger.ts';
import type { MetricsInput } from '../ledger.ts';

const NEXT_DAY = '2026-11-09';

export const QUESTS = [
  questOf(
    1,
    [
      { n: 1, character: 'quill', outcome: 'submitted', start: 0, end: 5, tokens: 100, session: 'q1a1' },
      { n: 1, role: 'verifier', outcome: 'submitted', start: 5, end: 10, tokens: 200 },
      { n: 2, character: 'quill', outcome: 'submitted', start: 12, end: 15, tokens: 50 },
      { n: 2, role: 'verifier', outcome: 'submitted', start: 15, end: 18, tokens: 60 },
    ],
    { kind: 'document', class: 'scribe', tags: ['docs', 'e2e'], sealed: 30 },
  ),
  questOf(
    2,
    [
      { n: 1, outcome: 'submitted', start: 0, end: 3, session: 'q2a1' },
      { n: 1, role: 'verifier', outcome: 'breaker', start: 3, end: 4 },
      { n: 1, role: 'verifier', outcome: 'breaker', start: 4, end: 5 },
      { n: 1, role: 'verifier', outcome: 'submitted', start: 5, end: 7 },
    ],
    { kind: 'refactor', tags: ['i18n', 'frontend'] },
  ),
  questOf(
    3,
    [
      { n: 1, character: 'orrin', outcome: 'breaker', start: 0, end: 6, session: 'q3a1' },
      { n: 2, character: 'orrin', outcome: 'submitted', start: 10, end: 13 },
      { n: 2, role: 'verifier', outcome: 'submitted', start: 13, end: 15 },
    ],
    { kind: 'analyze', class: 'astrologer', tags: ['backend', 'frontend'] },
  ),
  questOf(
    4,
    [
      { n: 1, character: 'lyra', outcome: 'blocked', start: 0, end: 2, session: 'q4a1' },
      { n: 1, character: 'lyra', outcome: 'submitted', start: 20, end: 22 },
      { n: 1, role: 'verifier', outcome: 'submitted', start: 22, end: 23 },
      { n: 2, character: 'lyra', outcome: 'submitted', start: 24, end: 25 },
      { n: 2, role: 'verifier', outcome: 'submitted', start: 25, end: 26 },
    ],
    { kind: 'publish', class: 'bard', tags: ['i18n'] },
  ),
  questOf(5, [
    { n: 1, outcome: 'submitted', start: 0, end: 8, session: 'q5a1' },
    { n: 1, role: 'verifier', outcome: 'submitted', start: 8, end: 10 },
    { n: 2, outcome: 'blocked', start: 11, end: 12 },
    { n: 2, outcome: 'submitted', start: 13, end: 15 },
    { n: 2, role: 'verifier', outcome: 'submitted', start: 15, end: 18 },
  ]),
  questOf(6, [{ n: 1, character: null, outcome: 'submitted', start: 0, end: 1 }], {
    kind: 'batch',
    tier: 'script',
    tags: ['docs'],
  }),
  questOf(
    7,
    [
      { n: 1, character: 'ember', outcome: 'paused', start: 0, end: 5, session: 'q7a1' },
      { n: 1, character: 'ember', outcome: 'submitted', start: 300, end: 305 },
      { n: 1, role: 'verifier', character: 'ilse', outcome: 'submitted', start: 305, end: 307 },
    ],
    { kind: 'research', class: 'scout', tags: ['docs'] },
  ),
  questOf(8, [
    { n: 1, outcome: 'submitted', start: 0, end: 5, session: 'unknown-session' },
    { n: 1, role: 'verifier', outcome: 'submitted', start: 5, end: 7 },
    { n: 2, outcome: 'submitted', start: 21, end: 25 },
    { n: 2, role: 'verifier', outcome: 'submitted', start: 25, end: 27 },
  ]),
  questOf(9, [
    { n: 1, outcome: 'submitted', start: 30, end: 35, session: 'q9a1' },
    { n: 1, role: 'verifier', outcome: 'breaker', start: 35, end: 36 },
    { n: 1, role: 'verifier', outcome: 'submitted', start: 0, end: 4, day: NEXT_DAY },
  ]),
  questOf(10, [], { status: 'archived' }),
];

export const VERDICTS = [
  verdictOf(1, 1, 'fail', { fail_kind: 'style', minute: 10 }),
  verdictOf(1, 2, 'pass', { minute: 18 }),
  verdictOf(1, 2, 'pass', { owner: true, minute: 30 }),
  verdictOf(2, 1, 'pass', { minute: 7 }),
  verdictOf(3, 2, 'pass', { minute: 15 }),
  verdictOf(4, 1, 'fail', { fail_kind: 'style', minute: 23 }),
  verdictOf(4, 2, 'pass', { minute: 26 }),
  verdictOf(5, 1, 'fail', { fail_kind: 'tests_fail', minute: 10 }),
  verdictOf(5, 2, 'pass', { minute: 18 }),
  verdictOf(6, 1, 'pass', { machine: true, minute: 1 }),
  verdictOf(7, 1, 'pass', { minute: 307 }),
  verdictOf(8, 1, 'pass', { minute: 7 }),
  verdictOf(8, 1, 'fail', { owner: true, fail_kind: 'style', minute: 20 }),
  verdictOf(8, 2, 'pass', { minute: 27 }),
  { ...verdictOf(9, 1, 'pass', { minute: 0 }), created_at: at(4, NEXT_DAY) },
];

const command = {
  retry: commandOf('retry', { quest: questId(3) }, at(9)),
  answer4: commandOf('answer', { quest: questId(4), answer: 'Use the glossary term.' }, at(19)),
  answer5: commandOf('answer', { quest: questId(5), answer: 'Run pnpm docs:gen.' }, at(12)),
  seal: commandOf('seal', { quest: questId(1) }, at(30)),
  return: commandOf('return', { quest: questId(8), notes: 'The table still lists five scripts.' }, at(20)),
  cancel: commandOf(
    'cancel',
    { quest: questId(10), reason: 'Kept the character for the mana test.' },
    at(40),
  ),
  reassign: commandOf('reassign', { quest: questId(9) }, at(1, NEXT_DAY)),
};
/** Written but never applied: the Steward has no `command.applied` line for it. */
const unapplied = commandOf(
  'edit_quest',
  { quest: questId(2), expected_updated_at: at(0), changes: { rank: 'D' } },
  at(1),
);

const session = (id: string, model: string) => lineOf('agent.session.start', { session: id, model }, at(0));

export const EVENTS = [
  session('q1a1', 'gemini-4-argon-medium'),
  ...['q2a1', 'q3a1', 'q4a1', 'q5a1'].map((id) => session(id, 'claude-sonnet-5-5')),
  session('q9a1', 'claude-opus-5-5'),
  lineOf(
    'quest.infirmary',
    { reason: 'breaker:tokens: 269358 tokens, limit 240000', trip: 'tokens' },
    at(6),
    questId(3),
  ),
  // Before P1-32 a line had the reason alone; a line with no quest is no quest's trip.
  lineOf('quest.infirmary', { reason: 'max_attempts' }, at(6), questId(3)),
  lineOf('quest.infirmary', { reason: 'breaker:time', trip: 'time' }, at(6)),
  lineOf(
    'quest.submitted',
    { sequels: [{ why: 'reply tried once more' }, { why: 'letter unchanged' }] },
    at(5),
  ),
  lineOf('quest.submitted', { sequels: [{ why: 'letter unchanged' }] }, at(2, NEXT_DAY)),
  ...Object.values(command).map(appliedLine),
];

export const DAY: MetricsInput = {
  quests: QUESTS,
  verdicts: VERDICTS,
  events: EVENTS,
  commands: [...Object.values(command), unapplied],
};
