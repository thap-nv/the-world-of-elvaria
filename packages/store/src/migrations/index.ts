// The migrations of every contract a kingdom stores as a JSON file with a `version` (ADR 0003). An
// incompatible schema change adds `<contract>/v<n>-to-v<n+1>.ts` (a pure Migration), appends it to the chain
// below, and adds the fixture `<contract>/v<n+1>.json` next to the older ones; migrations.spec.ts reads every
// fixture with the current store and checks each step turns v<n>.json into v<n+1>.json.
//
// Not here: events (`v`, migrated line by line by @elvaria/eventlog and never rewritten), lessons and skill
// front matter (Markdown, parsed elsewhere), quest drafts (never stored), world/map.json (stage 3).
import type { MigrationChain } from './run.ts';

export const STORED_CONTRACTS = [
  'kingdom',
  'territory',
  'quest',
  'character',
  'campaign',
  'verdict',
  'inbox-command',
  'kind',
  'class',
  'ritual',
  'script',
  'tag',
] as const;

export type StoredContract = (typeof STORED_CONTRACTS)[number];

/** Every contract is at v1 (2026-11-06): no migrations yet, only the v1 fixtures. */
export const MIGRATIONS: Readonly<Record<StoredContract, MigrationChain>> = {
  kingdom: [],
  territory: [],
  quest: [],
  character: [],
  campaign: [],
  verdict: [],
  'inbox-command': [],
  kind: [],
  class: [],
  ritual: [],
  script: [],
  tag: [],
};
