// Running the conformance suite (implementation-plan §3.14): every check in turn, each reported with what its sessions
// spent, which `elvaria tribe check` prints and records (run (221) (b)).
import { conformanceChecks } from './checks.ts';
import type { CheckOutcome, ConformanceTarget } from './target.ts';

export interface ConformanceReport {
  readonly id: string;
  readonly outcome: CheckOutcome | 'failed';
  readonly problem?: string;
  /**
   * The tokens the check's sessions reported (ConformanceTarget.onSpent), passed or failed; 0 for a check that opens
   * none, or a runner that reports no usage. A probe's model call reports none, so it is not counted.
   */
  readonly tokens: number;
}

/** Runs every check in turn and reports each; what `elvaria tribe check` prints (P1-19). */
export async function runConformance(target: ConformanceTarget): Promise<readonly ConformanceReport[]> {
  const reports: ConformanceReport[] = [];
  for (const check of conformanceChecks(target)) {
    let tokens = 0;
    const counted: ConformanceTarget = {
      ...target,
      onSpent: (spent) => {
        tokens += spent;
        target.onSpent?.(spent);
      },
    };
    try {
      const outcome = await check.run(counted);
      reports.push({ id: check.id, outcome, tokens });
    } catch (error) {
      const problem = error instanceof Error ? error.message : String(error);
      reports.push({ id: check.id, outcome: 'failed', problem, tokens });
    }
  }
  return reports;
}
