// Ids the owner sees, as message keys. Records over the domain's unions: a new status or issue code without a
// display string fails typecheck here, before i18n:check runs.
import type {
  CharacterClass,
  CharacterStatus,
  Kind,
  QuestStatus,
  RegistryIssueCode,
  Tag,
} from '@elvaria/domain';
import type { Locale, MessageKey } from '@elvaria/i18n';
import type { StoreIssueCode } from '@elvaria/store';

export const QUEST_STATUS_LABEL: Readonly<Record<QuestStatus, MessageKey>> = {
  draft: 'quest.status.draft',
  open: 'quest.status.open',
  claimed: 'quest.status.claimed',
  working: 'quest.status.working',
  review: 'quest.status.review',
  returned: 'quest.status.returned',
  awaiting_seal: 'quest.status.awaiting_seal',
  done: 'quest.status.done',
  blocked: 'quest.status.blocked',
  paused_mana: 'quest.status.paused_mana',
  infirmary: 'quest.status.infirmary',
  archived: 'quest.status.archived',
};

export const CHARACTER_STATUS_LABEL: Readonly<Record<CharacterStatus, MessageKey>> = {
  idle: 'character.status.idle',
  working: 'character.status.working',
  reviewing: 'character.status.reviewing',
  sleeping_mana: 'character.status.sleeping_mana',
  meditating: 'character.status.meditating',
  suspended: 'character.status.suspended',
  swamp: 'character.status.swamp',
};

export const STORE_ISSUE_LABEL: Readonly<Record<StoreIssueCode, MessageKey>> = {
  not_found: 'store.issue.not_found',
  invalid_id: 'store.issue.invalid_id',
  invalid_json: 'store.issue.invalid_json',
  missing_version: 'store.issue.missing_version',
  future_version: 'store.issue.future_version',
  migration_failed: 'store.issue.migration_failed',
  invalid: 'store.issue.invalid',
  id_mismatch: 'store.issue.id_mismatch',
  locked: 'store.issue.locked',
  not_a_folder: 'store.issue.not_a_folder',
  exists: 'store.issue.exists',
};

export const REGISTRY_ISSUE_LABEL: Readonly<Record<RegistryIssueCode, MessageKey>> = {
  invalid: 'registry.issue.invalid',
  duplicate_id: 'registry.issue.duplicate_id',
  unknown_ritual: 'registry.issue.unknown_ritual',
  unknown_class: 'registry.issue.unknown_class',
  unknown_kind: 'registry.issue.unknown_kind',
  unknown_step: 'registry.issue.unknown_step',
  unknown_tag: 'registry.issue.unknown_tag',
  verifier_and_monk: 'registry.issue.verifier_and_monk',
  verifier_takes_work: 'registry.issue.verifier_takes_work',
  class_kind_mismatch: 'registry.issue.class_kind_mismatch',
  entry_mismatch: 'registry.issue.entry_mismatch',
};

/** Registry entries carry both names; the theme does not exist yet (stage 4), so this is the display name. */
export const nameIn = (locale: Locale, entry: Kind | CharacterClass | Tag): string =>
  locale === 'vi' ? entry.name_vi : entry.name_en;
