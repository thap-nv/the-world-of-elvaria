// The doctor's view of mana (implementation-plan §3.5, P1-32): each gauge the Steward has logged, a sleeping one as a
// warning with its readings and resets (the characters it binds take no work), an awake one with its latest readings.
// Nothing logged yet says so, rather than nothing at all. Under each reading, the share of that window a session was
// seen to take, or the default before one was measured, and a gauge closed one session before the cap (or at it) is a
// warning too (P1-49, (c) of P1-48): the shares come from the log's `mana.level` lines and the quests' sessions, as a
// Steward rebuilds them when it starts (levelsFromLog, sharesOfHistory), so the doctor and the Steward agree.
import {
  endedSessionsOf,
  keyOf,
  manaThresholdOf,
  measuredShareOf,
  shareAheadOf,
  sharesOfHistory,
  windowClosingOf,
} from '@elvaria/domain';
import type { Event, SessionShare, WindowKey } from '@elvaria/domain';
import { levelsFromLog } from '@elvaria/steward';

import { asleepLine, gaugeName, gaugesOf, readLog, readingLines } from '../gauges.ts';
import { finding } from './finding.ts';
import type { GaugeReading, GaugeView } from '../gauges.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { Finding } from './finding.ts';

/** The shares the log tells, over the sessions of the kingdom's quests (files that do not parse are left out). */
async function sharesOf(ctx: KingdomContext, events: readonly Event[]): Promise<SessionShare[]> {
  const [quests, characters] = await Promise.all([ctx.store.quests.list(), ctx.store.characters.list()]);
  const ended = endedSessionsOf(quests.items, characters.items);
  return sharesOfHistory(levelsFromLog(events), ended, ctx.kingdom.tribes);
}

const windowOf = (gauge: GaugeView, reading: GaugeReading): WindowKey => ({
  ...keyOf(gauge),
  window: reading.window,
});

const windowName = (ctx: KingdomContext, reading: GaugeReading): string =>
  ctx.t(`cli.run.notice.window.${reading.window}`);

/** What one session takes of the reading's window: measured, or the default the Steward counts before that. */
function shareLine(
  ctx: KingdomContext,
  gauge: GaugeView,
  reading: GaugeReading,
  shares: SessionShare[],
): string {
  const key = windowOf(gauge, reading);
  const measured = measuredShareOf(shares, key);
  const window = windowName(ctx, reading);
  if (measured !== undefined) return ctx.t('cli.mana.share_measured', { window, pct: measured });
  return ctx.t('cli.mana.share_default', { window, pct: shareAheadOf(shares, key, ctx.kingdom.mana) });
}

/** The reading and, under it, the share of its window, for each window read. */
function detailsOf(ctx: KingdomContext, gauge: GaugeView, shares: SessionShare[]): string[] {
  const lines = readingLines(ctx.t, gauge);
  return gauge.readings.length === 0
    ? lines
    : gauge.readings.flatMap((reading, index) => [
        lines[index] ?? '',
        shareLine(ctx, gauge, reading, shares),
      ]);
}

/** The warning of an awake gauge whose window closes it: at the cap, or one session early. */
function closedLine(ctx: KingdomContext, gauge: GaugeView, shares: SessionShare[]): string | undefined {
  const cfg = ctx.kingdom.mana;
  for (const reading of gauge.readings) {
    const key = windowOf(gauge, reading);
    const closing = windowClosingOf({ ...key, used_pct: reading.used_pct }, shares, cfg);
    if (closing === 'open') continue;
    const said = {
      gauge: gaugeName(ctx.t, gauge),
      window: windowName(ctx, reading),
      used_pct: reading.used_pct,
      threshold: manaThresholdOf(cfg),
      share: shareAheadOf(shares, key, cfg),
    };
    return ctx.t(closing === 'early' ? 'cli.mana.closed_early' : 'cli.mana.closed_cap', said);
  }
  return undefined;
}

function gaugeFinding(ctx: KingdomContext, gauge: GaugeView, shares: SessionShare[]): Finding[] {
  const details = detailsOf(ctx, gauge, shares);
  if (gauge.asleep) return [finding('warn', asleepLine(ctx.t, gauge), details)];
  const closed = closedLine(ctx, gauge, shares);
  if (closed !== undefined) return [finding('warn', closed, details)];
  const awake = ctx.t('cli.mana.awake', { gauge: gaugeName(ctx.t, gauge) });
  return details.length === 0 ? [] : [finding('ok', awake, details)];
}

export async function checkMana(ctx: KingdomContext): Promise<Finding[]> {
  const events = await readLog(ctx.store.root);
  const gauges = gaugesOf(events, ctx.io.clock.now());
  const shares = gauges.length === 0 ? [] : await sharesOf(ctx, events);
  const findings = gauges.flatMap((gauge) => gaugeFinding(ctx, gauge, shares));
  return findings.length === 0 ? [finding('ok', ctx.t('cli.mana.none'))] : findings;
}
