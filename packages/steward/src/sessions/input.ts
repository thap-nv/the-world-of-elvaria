// What the Steward knows of a session it opens (implementation-plan §3.7): the request (request.ts), its prompt
// (prompt.ts) and what a continuing assignee reads (continuation.ts) are built from it. A file of its own, so the
// three import it without a cycle.
import type { Character, Quest, Role, Territory, VerdictCheck } from '@elvaria/domain';
import type { Answered, Continuation } from '@elvaria/runner-core';

/** A CLI session to continue (`--resume`, ADR 0017), and the answer it gets when the owner answered its question. */
export interface Resume {
  readonly session_id: string;
  readonly answered: Answered | null;
}

export interface SessionInput {
  readonly role: Role;
  /** The quest as the session sees it: with its plot once a start prepared one. */
  readonly quest: Quest;
  readonly character: Character;
  readonly territory: Territory;
  readonly n: number;
  readonly cwd: string;
  /** An assignee that goes on with the quest in a fresh session (§10 question 4); null for its first session. */
  readonly continuation?: Continuation | null;
  /** A verifier's: the machine checks that ran before its session (§3.2). */
  readonly checks?: readonly VerdictCheck[];
  /** A verifier in the scratch plot its trial made (ADR 0022, P1-20): Edit and Write there, no commit, no push. */
  readonly scratch?: boolean;
  /** False: the Steward holds no exclusive lock for this judge, which runs no exclusive check (P1-54). */
  readonly exclusive?: boolean;
}
