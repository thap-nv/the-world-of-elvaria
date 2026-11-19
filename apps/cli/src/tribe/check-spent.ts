// What a tribe check against the real CLI spent (run (221) (b)): two checks of gemini ran 15 and 34 minutes on a server
// with no room, and nothing said or counted their tokens. Each check's line says what its sessions reported, a last
// line their sum, and a `tribe.checked` line puts it in the log, where the Steward's mana estimate counts it as a
// quest's sessions (ADR 0009). A fake CLI (`--scenarios`) spends nothing, so its run says and records none of it.
import type { ConformanceReport } from '@elvaria/runner-core';
import type { TribeId } from '@elvaria/domain';

import { recordTribeChecked } from '../events.ts';
import type { KingdomContext } from '../kingdom-context.ts';

/** The check's line, with the tokens its sessions reported when they reported any. */
export const withTokens = (ctx: KingdomContext, report: ConformanceReport, line: string): string =>
  report.tokens === 0 ? line : ctx.t('cli.tribe.check.check_tokens', { line, tokens: report.tokens });

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The sum, said and written to the log; a line that cannot be written is said, and the verdict stands. */
export async function recordSpent(
  ctx: KingdomContext,
  tribe: TribeId,
  model: string,
  reports: readonly ConformanceReport[],
): Promise<void> {
  const tokens = reports.reduce((sum, report) => sum + report.tokens, 0);
  ctx.io.out(ctx.t('cli.tribe.check.spent', { tribe, model, tokens }));
  const checks = reports.map(({ id, outcome, tokens: spent }) => ({ check: id, outcome, tokens: spent }));
  const outcome = reports.every((report) => report.outcome !== 'failed') ? 'passed' : 'failed';
  try {
    await recordTribeChecked(ctx, { tribe, model, outcome, tokens, checks });
  } catch (error) {
    ctx.io.err(ctx.t('cli.tribe.check.spent_unrecorded', { problem: messageOf(error) }));
  }
}
