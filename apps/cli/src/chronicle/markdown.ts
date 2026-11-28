// The machine's chronicle in the owner's language (P2-06): the counts of the day's ledger, then its entries one by
// one, each with its local time, quest, territory and characters. Every word comes from the ledger (dayLedgerOf), so
// it tells nothing the log does not hold (ADR 0017); P2-06b's Bard adds prose after it. Redacted by the caller.
import { LEDGER_KINDS, parseInstant, zonedTime } from '@elvaria/domain';
import type { ChronicleLedger, LedgerEntry } from '@elvaria/domain';
import type { Translate } from '@elvaria/i18n';

/** `HH:MM` of `zone.format`'s ISO text. */
const TIME = { from: 'yyyy-mm-ddT'.length, to: 'yyyy-mm-ddTHH:MM'.length } as const;

/** The entry's local time in the ledger's zone, whatever offset its line was written with. */
function timeOf(ledger: ChronicleLedger, at: string): string {
  const zone = zonedTime(ledger.tz);
  const instant = parseInstant(at);
  const text = zone.ok && instant.ok ? zone.value.format(instant.value) : at;
  return text.slice(TIME.from, TIME.to);
}

function partsOf(t: Translate, entry: LedgerEntry): string[] {
  const { quest, title, territory, character, by, pool, tribe, model } = entry;
  const named =
    quest === undefined ? [] : [title === undefined ? quest : t('chronicle.part.quest', { quest, title })];
  return [
    ...named,
    ...(territory === undefined ? [] : [t('chronicle.part.territory', { territory })]),
    ...(character === undefined ? [] : [character.name]),
    ...(by === undefined ? [] : [t('chronicle.part.by', { name: by.name })]),
    ...(pool === undefined ? [] : [t('chronicle.part.pool', { pool, tribe: tribe ?? pool })]),
    ...(model === undefined ? [] : [t('chronicle.part.model', { model })]),
  ];
}

function entryLine(t: Translate, ledger: ChronicleLedger, entry: LedgerEntry): string {
  const parts = partsOf(t, entry);
  return t('chronicle.line', {
    time: timeOf(ledger, entry.at),
    what: t(`chronicle.what.${entry.kind}`),
    details: parts.length === 0 ? '' : t('chronicle.details', { parts: parts.join(', ') }),
  });
}

export interface ChronicleText {
  /** The kingdom's name, the heading's. */
  readonly name: string;
  readonly ledger: ChronicleLedger;
}

/** The machine's part of `chronicle/<day>.md`. */
export function chronicleMarkdown(t: Translate, { name, ledger }: ChronicleText): string {
  const head = [t('chronicle.heading', { name, day: ledger.day }), '', t('chronicle.machine_note'), ''];
  if (ledger.entries.length === 0) return [...head, t('chronicle.empty'), ''].join('\n');
  const counts = LEDGER_KINDS.filter((kind) => ledger.counts[kind] > 0).map((kind) =>
    t('chronicle.count', { what: t(`chronicle.what.${kind}`), count: ledger.counts[kind] }),
  );
  return [
    ...head,
    t('chronicle.counts'),
    '',
    ...counts,
    t('chronicle.quests', { count: ledger.quests }),
    '',
    t('chronicle.entries'),
    '',
    ...ledger.entries.map((entry) => entryLine(t, ledger, entry)),
    '',
  ].join('\n');
}
