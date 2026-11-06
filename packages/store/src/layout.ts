// Where everything lives in a kingdom directory (implementation-plan §2.2), as portable paths relative to the
// kingdom root. One table, so the store, the Steward, the runners and the CLI cannot disagree on a file name;
// `inKingdom(root, path)` turns an entry into a native path.
import type { CampaignId, CharacterId, QuestId, RegistryFile, TerritoryId, VerdictId } from '@elvaria/domain';

/** Folders `initKingdom` creates. `world/` (stage 3), `adapters/` and `temple/skills/` appear when used. */
export const KINGDOM_DIRS = [
  'registry',
  'territories',
  'quests',
  'characters',
  'campaigns',
  'verdicts',
  'events',
  'chronicle',
  'temple',
  'inbox',
  'inbox/done',
  '.runs',
  '.state',
  '.backup',
] as const;

export const KINGDOM_FILE = 'kingdom.json';
export const REGISTRY_DIR = 'registry';
export const INBOX_DIR = 'inbox';
export const INBOX_DONE_DIR = 'inbox/done';
export const BACKUP_DIR = '.backup';

export const kingdomLayout = {
  kingdom: (): string => KINGDOM_FILE,
  registryFile: (file: RegistryFile): string => `${REGISTRY_DIR}/${file}.json`,
  /** `class.prompt_file` and `script.entry` are relative to the registry folder. */
  registryEntry: (relative: string): string => `${REGISTRY_DIR}/${relative}`,
  territory: (id: TerritoryId): string => `territories/${id}/territory.json`,
  gazetteer: (id: TerritoryId): string => `territories/${id}/gazetteer.md`,
  quest: (id: QuestId): string => `quests/${id}.json`,
  /** The quest's own folder; no `journal` field in the quest, the path is this convention (ADR 0010). */
  questDir: (id: QuestId): string => `quests/${id}`,
  handover: (id: QuestId): string => `quests/${id}/handover.md`,
  journal: (id: QuestId): string => `quests/${id}/journal.jsonl`,
  character: (id: CharacterId): string => `characters/${id}/character.json`,
  scripture: (id: CharacterId): string => `characters/${id}/scripture.md`,
  campaign: (id: CampaignId): string => `campaigns/${id}.json`,
  verdict: (id: VerdictId): string => `verdicts/${id}.json`,
  inboxCommand: (name: string): string => `${INBOX_DIR}/${name}.json`,
  inboxDone: (name: string): string => `${INBOX_DONE_DIR}/${name}.json`,
  /** Raw output, generated settings and check logs of one attempt; `attempt_log[].run_dir` points here. */
  runDir: (id: QuestId, attempt: number): string => `.runs/${id}-${attempt}`,
  stewardLock: (): string => '.state/steward.lock',
  backup: (stamp: string): string => `${BACKUP_DIR}/${stamp}`,
} as const;
