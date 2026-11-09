// The doctor's view of mana (implementation-plan §3.5, P1-32): each gauge the Steward has logged, a sleeping one as a
// warning with its readings and resets (the characters it binds take no work), an awake one with its latest readings.
// Nothing logged yet says so, rather than nothing at all.
import { asleepLine, gaugeName, readGauges, readingLines } from '../gauges.ts';
import { finding } from './finding.ts';
import type { GaugeView } from '../gauges.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { Finding } from './finding.ts';

function gaugeFinding(ctx: KingdomContext, gauge: GaugeView): Finding[] {
  const details = readingLines(ctx.t, gauge);
  if (gauge.asleep) return [finding('warn', asleepLine(ctx.t, gauge), details)];
  const awake = ctx.t('cli.mana.awake', { gauge: gaugeName(ctx.t, gauge) });
  return details.length === 0 ? [] : [finding('ok', awake, details)];
}

export async function checkMana(ctx: KingdomContext): Promise<Finding[]> {
  const gauges = await readGauges(ctx.store.root, ctx.io.clock.now());
  const findings = gauges.flatMap((gauge) => gaugeFinding(ctx, gauge));
  return findings.length === 0 ? [finding('ok', ctx.t('cli.mana.none'))] : findings;
}
