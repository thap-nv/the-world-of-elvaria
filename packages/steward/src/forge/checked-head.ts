// RC-02: evidence is local to one push. A queue run that set checks aside must never fall back to an older verdict.
import type { Verdict } from '@elvaria/domain';

export type QueueChecks = 'checked' | 'unchecked';
type VerdictEvidence = Pick<Verdict, 'result' | 'checks' | 'created_at'>;

/** A current branch's verdict predates no commit it vouches for; unreadable evidence only costs another hook check. */
export async function checkedHeadEnv(
  head: string,
  queue: QueueChecks | undefined,
  evidence: () => Promise<{
    readonly verdict: VerdictEvidence | undefined;
    readonly committed_at: string | undefined;
  }>,
): Promise<Readonly<Record<string, string>>> {
  try {
    if (queue === 'checked') return { ELVARIA_CHECKED_HEAD: head };
    if (queue === 'unchecked') return {};
    const { verdict, committed_at } = await evidence();
    if (verdict?.result !== 'pass' || verdict.checks.length === 0) return {};
    if (!verdict.checks.every(({ pass }) => pass)) return {};
    const committed = Date.parse(committed_at ?? '');
    const judged = Date.parse(verdict.created_at);
    // A retry may find `current` after an earlier delivery merged the base, then failed its push (ADR 0023).
    return Number.isFinite(committed) && Number.isFinite(judged) && judged >= committed
      ? { ELVARIA_CHECKED_HEAD: head }
      : {};
  } catch {
    return {};
  }
}
