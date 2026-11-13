// The last trial of each territory (PS-25): `elvaria territory check` writes how its scorecard stood, `doctor` reads it
// to remind of a territory never tried, whose trial failed, or whose setup and checks changed since. The file is the
// CLI's own, like `.state/build.json` (upgrade/pointer.ts): no contract in docs/schemas, a `version`, and a reader
// that refuses what it cannot trust; it holds nothing the Steward needs, and a kingdom without it reads as untried.
import { SCORECARD_ITEMS, SCORECARD_STATUSES, commandLinesOf } from '@elvaria/domain';
import type { ScorecardItemId, ScorecardStatus, Territory, TerritoryScorecard } from '@elvaria/domain';
import { inKingdom, readTextFile, writeFileAtomic } from '@elvaria/store';

/** Kingdom-relative (§2.2 `.state/`): beside the Steward's own state, outside every plot and the event log. */
export const trialFileOf = (territory: string): string => `.state/territory-trials/${territory}.json`;

const FILE_VERSION = 1;
const JSON_INDENT = 2;

export interface TrialRecord {
  readonly territory: string;
  readonly tried_at: string;
  /** The commit tried, short; null when nothing was (no git). */
  readonly base: string | null;
  readonly items: Readonly<Record<ScorecardItemId, ScorecardStatus>>;
  /** commands.setup and every check's run as tried: a trial of other commands says nothing of these. */
  readonly commands: readonly string[];
}

export type TrialRecordRead =
  | { readonly kind: 'none' }
  | { readonly kind: 'read'; readonly record: TrialRecord }
  | { readonly kind: 'unreadable' };

/** What a trial tried of the territory, one `field: line` each. */
export const triedCommandsOf = (territory: Territory): string[] => [
  ...(territory.commands.setup === undefined ? [] : [`commands.setup: ${territory.commands.setup}`]),
  ...territory.checks.flatMap(({ id, run }) =>
    commandLinesOf(run).map((line) => `checks.${id}.run: ${line}`),
  ),
];

export const recordOf = (territory: Territory, card: TerritoryScorecard, at: string): TrialRecord => ({
  territory: territory.id,
  tried_at: at,
  base: card.base,
  items: Object.fromEntries(card.items.map(({ id, status }) => [id, status])) as TrialRecord['items'],
  commands: triedCommandsOf(territory),
});

export async function writeTrialRecord(root: string, record: TrialRecord): Promise<void> {
  const text = `${JSON.stringify({ version: FILE_VERSION, ...record }, null, JSON_INDENT)}\n`;
  await writeFileAtomic(inKingdom(root, trialFileOf(record.territory)), text);
}

const isStatus = (value: unknown): value is ScorecardStatus =>
  typeof value === 'string' && (SCORECARD_STATUSES as readonly string[]).includes(value);

function itemsOf(value: unknown): TrialRecord['items'] | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const items = value as Record<string, unknown>;
  return SCORECARD_ITEMS.every((id) => isStatus(items[id])) ? (items as TrialRecord['items']) : undefined;
}

function recordFrom(value: unknown): TrialRecord | undefined {
  const file = value as Partial<Record<keyof TrialRecord | 'version', unknown>>;
  const items = itemsOf(file.items);
  const { territory, tried_at: at, base, commands } = file;
  if (file.version !== FILE_VERSION || items === undefined) return undefined;
  if (typeof territory !== 'string' || typeof at !== 'string') return undefined;
  if (base !== null && typeof base !== 'string') return undefined;
  if (!Array.isArray(commands) || !commands.every((line) => typeof line === 'string')) return undefined;
  return { territory, tried_at: at, base, items, commands };
}

export async function readTrialRecord(root: string, territory: string): Promise<TrialRecordRead> {
  const text = await readTextFile(inKingdom(root, trialFileOf(territory)));
  if (text === undefined) return { kind: 'none' };
  try {
    const record = recordFrom(JSON.parse(text));
    return record === undefined ? { kind: 'unreadable' } : { kind: 'read', record };
  } catch {
    return { kind: 'unreadable' };
  }
}
