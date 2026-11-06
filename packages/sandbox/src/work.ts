// The assignee's sessions in a fake day: what a runner would report (implementation-plan §3.7), drawn from the
// scenario's table instead of run, because the sandbox spawns nothing and may not import runner-core (§1.3).
// A session opens with agent.session.start, touches a file or two, and ends as the table says: submitted,
// crashed, a question for the owner, or the time breaker (§3.4).
import { addTokens, holds, noteWaits, schedule, sessionId } from './day.ts';
import { holderOf, step } from './ledger.ts';
import type { Day, Happening } from './day.ts';
import type { Title } from './scenario.ts';
import type { CharacterId, Quest } from '@elvaria/domain';

/** A session never uses less than this share of the quest's estimate, nor more than this share above it. */
const TOKENS_LOW = 0.4;
const TOKENS_SPREAD = 0.8;
const TOOLS_PER_SESSION = [0, 2] as const;

const PATHS = {
  code: ['src/routes/sign-in.tsx', 'src/api/orders.ts', 'packages/shared/src/schema.ts', 'README.md'],
  docs: ['docs/setup.md', 'docs/faq.md', 'README.md'],
} as const;
const COMMANDS = ['pnpm test', 'pnpm lint', 'git status'] as const;

const QUESTIONS: readonly Title[] = [
  { vi: 'Có giữ API cũ thêm một bản phát hành không?', en: 'Should the old API stay for one more release?' },
  {
    vi: 'Bản tiếng Anh dùng giọng trang trọng hay thân mật?',
    en: 'Should the English text be formal or casual?',
  },
  { vi: 'Được thêm một thư viện mới cho việc này không?', en: 'May I add a new library for this?' },
];
const ANSWERS: readonly Title[] = [
  {
    vi: 'Giữ thêm một bản, ghi rõ trong changelog.',
    en: 'Keep it one more release and say so in the changelog.',
  },
  { vi: 'Trang trọng.', en: 'Formal.' },
  { vi: 'Không, dùng những gì repo đã có.', en: 'No, use what the repo already has.' },
];

export const questionFor = (day: Day): string => day.dice.pick(QUESTIONS)[day.locale];
export const answerFor = (day: Day): string => day.dice.pick(ANSWERS)[day.locale];

const characterActor = (id: CharacterId) => ({ kind: 'character', id }) as const;

/** A session of the assignee has opened on `quest` (after start, redispatch, mana_restored or answer). */
export function beginWork(day: Day, quest: Quest, session: string): void {
  const assignee = day.ledger.character(holderOf(quest, 'assignee'));
  day.ledger.note({
    type: 'agent.session.start',
    actor: characterActor(assignee.id),
    data: { session, model: assignee.model },
    quest,
    session,
  });
  const end = day.dice.weighted(day.scenario.session);
  const limit = quest.budget.max_minutes;
  const minutes = end === 'breaker' ? limit : Math.min(day.dice.int(day.scenario.minutes.work), limit - 1);
  const tokens = Math.round(quest.estimate.tokens * (TOKENS_LOW + TOKENS_SPREAD * day.dice.next()));
  for (let tool = day.dice.int(TOOLS_PER_SESSION); tool > 0; tool -= 1) {
    schedule(day, day.dice.int([1, Math.max(1, minutes - 1)]), { kind: 'tool', quest: quest.id, session });
  }
  schedule(day, minutes, { kind: 'end', quest: quest.id, session, end, tokens });
}

/** A new session id, the move that opens it, then the session itself. */
export function openSession(day: Day, open: (session: string) => Quest): void {
  const session = sessionId(day);
  beginWork(day, open(session), session);
}

function toolLine(day: Day, quest: Quest): Record<string, string> {
  const territory = day.scenario.territories.find(({ id }) => id === quest.territory);
  const paths = PATHS[territory?.kind ?? 'code'];
  const kind = day.dice.pick(['read', 'write', 'bash'] as const);
  return kind === 'bash'
    ? { tool: kind, command: day.dice.pick(COMMANDS) }
    : { tool: kind, path: day.dice.pick(paths) };
}

export function useTool(day: Day, happening: Extract<Happening, { kind: 'tool' }>): void {
  const quest = day.ledger.quest(happening.quest);
  if (quest.status !== 'working' || !holds(quest, 'assignee', happening.session)) return;
  const actor = characterActor(holderOf(quest, 'assignee'));
  day.ledger.note({
    type: 'agent.tool',
    actor,
    data: toolLine(day, quest),
    quest,
    session: happening.session,
  });
}

type SessionOutcome = 'completed' | 'error' | 'killed';

/** agent.session.end of the assignee's or the verifier's session, as the runner reports it (RunResult, §3.7). */
export function endSession(
  day: Day,
  quest: Quest,
  role: 'assignee' | 'verifier',
  ending: {
    readonly session: string;
    readonly outcome: SessionOutcome;
    readonly tokens?: number;
  },
): void {
  const id = role === 'assignee' ? holderOf(quest, 'assignee') : holderOf(quest, 'verifier');
  const { session, outcome, tokens } = ending;
  const data = { outcome, ...(tokens === undefined ? {} : { usage: { tokens } }) };
  day.ledger.note({ type: 'agent.session.end', actor: characterActor(id), data, quest, session });
}

/** The session ends as drawn when it opened, unless a pause or a cancel closed it first. */
export function finishWork(day: Day, happening: Extract<Happening, { kind: 'end' }>): void {
  const quest = day.ledger.quest(happening.quest);
  if (quest.status !== 'working' || !holds(quest, 'assignee', happening.session)) return;
  const { session, tokens } = happening;
  const who = holderOf(quest, 'assignee');
  const run = { session_id: session, tokens };
  addTokens(day, day.ledger.character(who).tribe, tokens);
  if (happening.end === 'submit') {
    endSession(day, quest, 'assignee', { session, outcome: 'completed', tokens });
    day.ledger.move(quest.id, { type: 'submit', ...run }, 'runner', { [who]: step('submit') });
    return;
  }
  if (happening.end === 'ask') {
    endSession(day, quest, 'assignee', { session, outcome: 'completed', tokens });
    const question = questionFor(day);
    noteWaits(
      day,
      day.ledger.move(quest.id, { type: 'ask', ...run, question }, 'runner', { [who]: step('ask') }),
    );
    return;
  }
  if (happening.end === 'crash') {
    endSession(day, quest, 'assignee', { session, outcome: 'error', tokens });
    noteWaits(day, day.ledger.move(quest.id, { type: 'crash', ...run }, 'steward', { [who]: step('crash') }));
    return;
  }
  // The time breaker: the Steward kills the session, the character is bogged down while the WIP is committed.
  day.ledger.change(who, 'character.swamp', step('breaker'));
  endSession(day, quest, 'assignee', { session, outcome: 'killed', tokens });
  const tripped = { type: 'breaker', trip: 'time', ...run } as const;
  noteWaits(day, day.ledger.move(quest.id, tripped, 'steward', { [who]: step('quest_infirmary') }));
}
