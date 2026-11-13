// What a session leaves for the Steward to deliver when its kind needs a file of a given shape (P1-15), moved out of
// blocks.ts. A quest that delivers sub-quests also reads the rules every draft follows (PS-06): its mage writes the
// drafts by them, and its judge holds the plan to them.
import { SUBQUESTS_FILE } from '../plot/subquests.ts';
import { classesOf, draftingBlock, graphedOf } from './drafting.ts';
import { sharedFacts } from './scope.ts';
import type { DraftingTerms } from './drafting.ts';
import type { PromptTemplates } from './templates.ts';
import type { Kind, Registry, Territory } from '@elvaria/domain';

/** What the facts of a quest read of its territory. */
export type FactsTerritory = Pick<
  Territory,
  'secrets_allowed' | 'shared_paths' | 'checks' | 'code_graph' | 'vcs'
>;

const sealOf = (kind: Kind): string => (kind.seal_default ? 'sealed by default' : 'no seal by default');

/**
 * The words a sub-quest draft may use (P1-15): the kinds with the classes each allows and their seal (PS-06), the
 * classes with their tools (PS-06) and, on a territory with a code graph, who asks it (PS-21b), the kingdom's tags,
 * the secrets and checks of the territory. The mage's class prompt explains the fields and points here; the Steward
 * refuses a list that names anything else.
 */
function subquestVocabulary(registry: Registry, territory: FactsTerritory): string[] {
  const kinds = registry.kinds.map(
    (kind) => `${kind.id} (${kind.classes_allowed.join(', ') || 'no class'}; ${sealOf(kind)})`,
  );
  const secrets = territory.secrets_allowed;
  const checks = territory.checks.map(({ id }) => id);
  return [
    `- Kinds of a sub-quest and the classes each allows: ${kinds.join('; ')}`,
    `- Classes and their tools:\n${classesOf(registry.classes, graphedOf([territory]))
      .map((line) => `  ${line}`)
      .join('\n')}`,
    `- Tags: ${registry.tags.map(({ id }) => id).join(', ')}`,
    `- Secrets this territory allows: ${secrets.length === 0 ? 'none' : secrets.join(', ')}`,
    `- Checks of this territory: ${checks.length === 0 ? 'none' : checks.join(', ')}`,
    ...sharedFacts(territory),
  ];
}

/**
 * What the session leaves for the Steward to deliver, when the kind's convention needs a file of a given shape
 * (product plan §5: the prompt carries the kind's delivery convention). Other deliverables are the work itself.
 */
export const DELIVERABLE_FACTS: Partial<
  Record<Kind['deliverable_type'], (registry: Registry, territory: FactsTerritory) => string[]>
> = {
  subquests: (registry, territory) => [
    `- Deliverable: the sub-quests, written to \`${SUBQUESTS_FILE}\` at the root of the plot as quest-draft JSON: \`{"version": 1, "drafts": [...]}\`, each draft with ref (d1, d2…), title, description, kind, rank, territory, tier, class_required, tags, depends_on_refs, parent_ref (optional), scope_paths, estimate {tokens, minutes, context}, seal_required (optional), secrets_required. The Steward opens them once this quest is done`,
    ...subquestVocabulary(registry, territory),
  ],
};

/** Deliverables made of drafts, whose quest reads the drafting rules after its description. */
const DRAFTED: ReadonlySet<Kind['deliverable_type']> = new Set(['subquests']);

/** The drafting rules for a quest whose kind delivers drafts; empty otherwise. */
export const draftingFor = (kind: Kind, t: PromptTemplates, terms: DraftingTerms): string =>
  DRAFTED.has(kind.deliverable_type) ? draftingBlock(t, terms) : '';
