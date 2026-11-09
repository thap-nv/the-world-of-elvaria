// Who held a quest in a role (implementation-plan §3.2, §3.13): every character of its attempt log in that role, and
// the one holding it now. The party's rules read it to keep its assignees, judges and blind trial apart (ADR 0020, 0022).
import type { CharacterId } from '../core/ids.ts';
import type { Quest } from '../schema/quest/quest.ts';

export const charactersIn = (
  quest: Pick<Quest, 'attempt_log' | 'assignee' | 'verifier'>,
  role: 'assignee' | 'verifier',
): CharacterId[] => {
  const holder = quest[role];
  return [
    ...quest.attempt_log.flatMap((entry) =>
      entry.role === role && entry.character !== null ? [entry.character] : [],
    ),
    ...(typeof holder === 'string' ? [holder] : []),
  ];
};
