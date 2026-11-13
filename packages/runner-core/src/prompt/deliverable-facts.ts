// What a session leaves for the Steward to deliver when its kind needs a file of a given shape (P1-15): moved out of
// blocks.ts unchanged, before PS-06 adds the quest template and the estimate to a plan quest's facts.
import { SUBQUESTS_FILE } from '../plot/subquests.ts';
import { sharedFacts } from './scope.ts';
import type { Kind, Registry, Territory } from '@elvaria/domain';

/**
 * The words a sub-quest draft may use (P1-15): the kinds with the classes each allows, the kingdom's tags and the
 * secrets the territory allows. The mage's class prompt explains the fields and points here; the Steward refuses
 * a list that names anything else.
 */
function subquestVocabulary(
  registry: Registry,
  territory: Pick<Territory, 'secrets_allowed' | 'shared_paths'>,
): string[] {
  const kinds = registry.kinds.map((kind) => `${kind.id} (${kind.classes_allowed.join(', ') || 'no class'})`);
  const secrets = territory.secrets_allowed;
  return [
    `- Kinds of a sub-quest and the classes each allows: ${kinds.join('; ')}`,
    `- Tags: ${registry.tags.map(({ id }) => id).join(', ')}`,
    `- Secrets this territory allows: ${secrets.length === 0 ? 'none' : secrets.join(', ')}`,
    ...sharedFacts(territory),
  ];
}

/**
 * What the session leaves for the Steward to deliver, when the kind's convention needs a file of a given shape
 * (product plan §5: the prompt carries the kind's delivery convention). Other deliverables are the work itself.
 */
export const DELIVERABLE_FACTS: Partial<
  Record<
    Kind['deliverable_type'],
    (registry: Registry, territory: Pick<Territory, 'secrets_allowed' | 'shared_paths'>) => string[]
  >
> = {
  subquests: (registry, territory) => [
    `- Deliverable: the sub-quests, written to \`${SUBQUESTS_FILE}\` at the root of the plot as quest-draft JSON: \`{"version": 1, "drafts": [...]}\`, each draft with ref (d1, d2…), title, description, kind, rank, territory, tier, class_required, tags, depends_on_refs, parent_ref (optional), scope_paths (optional), estimate {tokens, minutes}, seal_required, secrets_required. The Steward opens them once this quest is done`,
    ...subquestVocabulary(registry, territory),
  ],
};
