// The mana gauges as the Steward last told them (implementation-plan §3.5, P1-22, P1-32), for `character list` and
// `doctor`: the Steward keeps them in memory and writes no file of them (§2.2 `.state/`, settled after P1-05), so
// they are folded here from its `mana.*` lines in the event log. `mana.exhausted` / `mana.restored` say which gauges
// sleep, the first with the reset it waits for when known; `mana.level` gives each gauge's readings, a whole pool's
// or one model's cap, and `mana.warning` too (before P1-32 the only line of a model's cap). A reading whose window
// has reset says nothing any more and is left out.
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
  /** Asleep: the reset its `mana.exhausted` line named (P1-32); absent when unknown or on an older line. */
  readonly resets_at?: string;
  /** The latest reading of each window, still in force. */
  readonly readings: readonly GaugeReading[];
}

interface Folding extends PoolKey {
  asleep: boolean;
  wakesAt: string | undefined;
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

/** One line into the gauges it names: a sleep with its reset, a wake, or a reading in place of its window's. */
function fold(gaugeOf: (key: PoolKey) => Folding, event: Event): void {
  if (isEventOf(event, 'mana.exhausted')) {
    const gauge = gaugeOf(keyOfLine(event.data));
    gauge.asleep = true;
    gauge.wakesAt = event.data.resets_at;
  } else if (isEventOf(event, 'mana.restored')) {
    const gauge = gaugeOf(keyOfLine(event.data));
    gauge.asleep = false;
    gauge.wakesAt = undefined;
  } else {
    const read = readingOfLine(event);
    if (read === undefined) return;
    const gauge = gaugeOf(read.key);
    gauge.readings = [...gauge.readings.filter(({ window }) => window !== read.reading.window), read.reading];
  }
}

/** Every gauge the log names, in the order it first did, with whether it sleeps and its latest readings. */
export function gaugesOf(events: readonly Event[], now: Instant): GaugeView[] {
  const gauges: Folding[] = [];
  const gaugeOf = (key: PoolKey): Folding => {
    const found = gauges.find((gauge) => sameKey(gauge, key));
    if (found !== undefined) return found;
    const added: Folding = { ...keyOf(key), asleep: false, wakesAt: undefined, readings: [] };
    gauges.push(added);
    return added;
  };
  for (const event of events) fold(gaugeOf, event);
  return gauges.map(({ wakesAt, readings, ...gauge }) => ({
    ...gauge,
    ...(wakesAt === undefined ? {} : { resets_at: wakesAt }),
    readings: readings.filter((reading) => current(reading, now)),
  }));
}

/** The line that heads a sleeping gauge: with the reset it waits for when its sleep named one. */
export const asleepLine = (t: Translate, gauge: GaugeView): string =>
  gauge.resets_at === undefined
    ? t('cli.mana.asleep', { gauge: gaugeName(t, gauge) })
    : t('cli.mana.asleep_until', { gauge: gaugeName(t, gauge), resets_at: gauge.resets_at });

/** The lines of the kingdom's log; none when it cannot be read. */
export async function readLog(root: string): Promise<readonly Event[]> {
  try {
    return (await openEventLog(root).read()).events;
  } catch {
    return [];
  }
}

/** The gauges of the kingdom's log; a log that cannot be read names none. */
export async function readGauges(root: string, now: Instant): Promise<GaugeView[]> {
  return gaugesOf(await readLog(root), now);
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
