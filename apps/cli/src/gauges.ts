// The mana gauges as the Steward last told them (implementation-plan §3.5, P1-22, P1-32), for `character list` and
// `doctor`: the Steward keeps them in memory and writes no file of them (§2.2 `.state/`, settled after P1-05), so
// they are folded here from its `mana.*` lines in the event log. `mana.exhausted` / `mana.restored` say which gauges
// sleep; `mana.level` gives a whole pool's readings, `mana.warning` those of a gauge that neared its cap (one model's
// cap is logged only then). A reading whose window has reset says nothing any more and is left out.
import { binds, current, isEventOf, keyOf, sameKey } from '@elvaria/domain';
import type {
  Character,
  Event,
  Instant,
  ManaSource,
  ManaWindow,
  PoolKey,
  Tribe,
  TribeId,
} from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import type { Translate } from '@elvaria/i18n';

export interface GaugeReading {
  readonly window: ManaWindow;
  readonly used_pct: number;
  readonly resets_at: string | null;
  readonly source: ManaSource;
  /** The time of the line that told it. */
  readonly observed_at: string;
}

export interface GaugeView extends PoolKey {
  readonly asleep: boolean;
  /** The latest reading of each window, still in force. */
  readonly readings: readonly GaugeReading[];
}

interface Folding extends PoolKey {
  asleep: boolean;
  readings: GaugeReading[];
}

/** The gauge a line names: `model` only for one model's own cap. */
const keyOfLine = (data: { tribe: TribeId; pool: string; model?: string | undefined }): PoolKey => ({
  tribe: data.tribe,
  pool: data.pool,
  ...(data.model === undefined ? {} : { model: data.model }),
});

function readingOfLine(event: Event): { key: PoolKey; reading: GaugeReading } | undefined {
  if (!isEventOf(event, 'mana.level') && !isEventOf(event, 'mana.warning')) return undefined;
  const { window, used_pct: used, resets_at: resets, source } = event.data;
  const reading = { window, used_pct: used, resets_at: resets ?? null, source, observed_at: event.ts };
  return { key: keyOfLine(event.data), reading };
}

/** Every gauge the log names, in the order it first did, with whether it sleeps and its latest readings. */
export function gaugesOf(events: readonly Event[], now: Instant): GaugeView[] {
  const gauges: Folding[] = [];
  const gaugeOf = (key: PoolKey): Folding => {
    const found = gauges.find((gauge) => sameKey(gauge, key));
    if (found !== undefined) return found;
    const added: Folding = { ...keyOf(key), asleep: false, readings: [] };
    gauges.push(added);
    return added;
  };
  for (const event of events) {
    if (isEventOf(event, 'mana.exhausted') || isEventOf(event, 'mana.restored')) {
      gaugeOf(keyOfLine(event.data)).asleep = event.type === 'mana.exhausted';
      continue;
    }
    const read = readingOfLine(event);
    if (read === undefined) continue;
    const gauge = gaugeOf(read.key);
    gauge.readings = [...gauge.readings.filter(({ window }) => window !== read.reading.window), read.reading];
  }
  return gauges.map((gauge) => ({ ...gauge, readings: gauge.readings.filter((r) => current(r, now)) }));
}

/** The gauges of the kingdom's log; a log that cannot be read names none. */
export async function readGauges(root: string, now: Instant): Promise<GaugeView[]> {
  try {
    return gaugesOf((await openEventLog(root).read()).events, now);
  } catch {
    return [];
  }
}

/**
 * The sleeping gauge a character the Steward put to sleep waits for: a model's cap its slug names first, else its
 * pool. Only `sleeping_mana` characters: the Steward knows the models the account lists in each group (agy's
 * `/usage`), the log does not, and the prefix table alone would call Argon bound by "Gemini Models" when the account
 * says it is not; the character's own status is the Steward's word.
 */
export function blockingGauge(
  gauges: readonly GaugeView[],
  tribes: readonly Tribe[],
  character: Pick<Character, 'tribe' | 'model' | 'status'>,
): GaugeView | undefined {
  if (character.status !== 'sleeping_mana') return undefined;
  const binding = gauges.filter((gauge) => gauge.asleep && binds(tribes, gauge, character));
  return binding.find(({ model }) => model !== undefined) ?? binding[0];
}

export const gaugeName = (t: Translate, { tribe, pool, model }: PoolKey): string =>
  model === undefined
    ? t('cli.mana.gauge.pool', { tribe, pool })
    : t('cli.mana.gauge.model', { tribe, pool, model });

function readingLine(t: Translate, reading: GaugeReading): string {
  const { used_pct: used, resets_at: resets, source, observed_at: at } = reading;
  const said = {
    window: t(`cli.run.notice.window.${reading.window}`),
    used_pct: used,
    source,
    observed_at: at,
  };
  return resets === null
    ? t('cli.mana.reading_no_reset', said)
    : t('cli.mana.reading', { ...said, resets_at: resets });
}

/** One line per window read; a sleeping gauge with none says it was not measured. */
export function readingLines(t: Translate, gauge: GaugeView): string[] {
  if (gauge.readings.length === 0) return gauge.asleep ? [t('cli.mana.unmeasured')] : [];
  return gauge.readings.map((reading) => readingLine(t, reading));
}
