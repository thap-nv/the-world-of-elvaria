// Historical membership comes only from opening events; today's scripture supplies optional display text.
import { isEventOf } from '@elvaria/domain';
import type { Event, Quest } from '@elvaria/domain';
import { openJournal } from '@elvaria/eventlog';
import { lessonsIn } from '@elvaria/steward';

import { EXIT } from '../command-table/command.ts';
import type { ExitCode } from '../command-table/command.ts';
import { registryIssueLines, storeIssueLines } from '../issues.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import { NONE } from '../listing.ts';
import { readQuest } from '../quest/references.ts';
import { readKingdomScriptures } from './read.ts';

interface SessionLoad {
  readonly at: string;
  readonly session: string;
  readonly character: string;
  readonly role: string;
  readonly n: number;
  readonly lessons: readonly string[];
}

function sessionsOf(quest: Quest, events: readonly Event[]): SessionLoad[] {
  const sessions = events.flatMap((event): SessionLoad[] => {
    if (
      event.quest !== quest.id ||
      !(
        isEventOf(event, 'quest.started') ||
        isEventOf(event, 'quest.unblocked') ||
        isEventOf(event, 'quest.resumed')
      )
    ) {
      return [];
    }
    const entry = quest.attempt_log.find(
      (each) => event.session !== undefined && each.session_id === event.session,
    );
    const view = event.data.quest;
    const role = entry?.role ?? (view.status === 'review' ? 'verifier' : 'assignee');
    return [
      {
        at: event.ts,
        session: event.session ?? event.id,
        character: entry?.character ?? (role === 'verifier' ? view.verifier : view.assignee) ?? NONE,
        role,
        n: entry?.n ?? view.attempts,
        lessons: event.data.load_trace?.lessons ?? [],
      },
    ];
  });
  // Old entries can predate load traces; they still deserve a session heading.
  for (const entry of quest.attempt_log) {
    if (sessions.some((session) => session.session === entry.session_id)) continue;
    sessions.push({
      at: entry.started_at,
      session: entry.session_id ?? NONE,
      character: entry.character ?? NONE,
      role: entry.role,
      n: entry.n,
      lessons: [],
    });
  }
  return sessions.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

export async function listQuestScripture(
  ctx: KingdomContext,
  id: string,
  character: string | undefined,
): Promise<ExitCode> {
  if (character !== undefined) {
    ctx.io.err(ctx.t('cli.scripture.quest.conflict'));
    return EXIT.usage;
  }
  const quest = await readQuest(ctx, id);
  if (Array.isArray(quest)) {
    quest.forEach(ctx.io.err);
    return EXIT.failed;
  }
  const journal = await openJournal(ctx.store.root, quest.id).read();
  if (journal.issues.length > 0) {
    ctx.io.err(ctx.t('cli.scripture.quest.journal_error', { id }));
    return EXIT.failed;
  }
  const sessions = sessionsOf(quest, journal.events);
  if (sessions.length === 0) {
    ctx.io.out(ctx.t('cli.scripture.quest.no_sessions', { id }));
    return EXIT.ok;
  }
  const scriptures = await readKingdomScriptures(ctx);
  if ('problems' in scriptures) {
    scriptures.problems.flatMap((issue) => registryIssueLines(ctx.t, issue)).forEach(ctx.io.err);
    return EXIT.failed;
  }
  scriptures.issues.flatMap((issue) => storeIssueLines(ctx.t, issue)).forEach(ctx.io.err);
  const sentences = new Map<string, string>(
    lessonsIn(scriptures.files).map((lesson) => [lesson.ref, lesson.text]),
  );
  printSessions(ctx, sessions, sentences);
  return scriptures.issues.length === 0 ? EXIT.ok : EXIT.failed;
}

function printSessions(
  ctx: KingdomContext,
  sessions: readonly SessionLoad[],
  sentences: ReadonlyMap<string, string>,
): void {
  ctx.io.out(ctx.t('cli.scripture.quest.current_text'));
  for (const session of sessions) {
    ctx.io.out(
      ctx.t('cli.scripture.quest.session', {
        session: session.session,
        attempt: session.n,
        role: session.role,
        character: session.character,
        at: session.at,
      }),
    );
    if (session.lessons.length === 0) ctx.io.out(ctx.t('cli.scripture.quest.no_lessons'));
    for (const ref of session.lessons) {
      ctx.io.out(
        ctx.t('cli.scripture.quest.lesson', {
          ref,
          text: sentences.get(ref) ?? ctx.t('cli.scripture.quest.missing_text'),
        }),
      );
    }
  }
}
