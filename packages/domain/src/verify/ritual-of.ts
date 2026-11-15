// The ritual that judges a quest (ADR 0011, 0022): its kind's, unless one of the kind's `ritual_overrides` meets the
// quest's tags, the first such override winning. Data, not a switch over kinds (ADR 0016): tests as the product
// (`build` tagged `e2e`) get `mutation_check` because kinds.json says so. The blind trial's acceptance part (P1-21)
// keeps its kind's ritual: its tests cannot pass before the parts are merged, so nothing breaks or reruns them there;
// the merge quest, which runs them, takes the overrides like any quest.
import type { Quest } from '../schema/quest/quest.ts';
import type { Registry } from '../schema/registry.ts';
import type { Ritual } from '../schema/registry-entries.ts';

/** undefined when the registry lacks the kind or the ritual it names (parseRegistry refuses such a registry). */
export function ritualOf(
  quest: Pick<Quest, 'kind' | 'tags' | 'party_role'>,
  registry: Pick<Registry, 'kinds' | 'rituals'>,
): Ritual | undefined {
  const kind = registry.kinds.find(({ id }) => id === quest.kind);
  if (kind === undefined) return undefined;
  const tags = new Set<string>(quest.tags);
  const overrides = quest.party_role === 'acceptance' ? [] : (kind.ritual_overrides ?? []);
  const override = overrides.find(({ tags_any }) => tags_any.some((tag) => tags.has(tag)));
  const id = override?.ritual ?? kind.ritual;
  return registry.rituals.find((ritual) => ritual.id === id);
}

/**
 * The quest's judge works in a scratch plot (ADR 0022): its ritual asks for one and the quest's plot is a git
 * worktree, the only kind a scratch plot can be made from. On a folder the judge works as any other, read-only.
 */
export const judgedInScratch = (
  quest: Pick<Quest, 'kind' | 'tags' | 'party_role' | 'plot'>,
  registry: Pick<Registry, 'kinds' | 'rituals'>,
): boolean => quest.plot.type === 'worktree' && ritualOf(quest, registry)?.scratch_plot === true;

/**
 * The quest's judge must see (PS-11): its ritual asks for eyes (`visual_review`, chosen by the tag `visual`), so only a
 * judge whose tribe reads images may take it (selectVerifier, `needs_vision`). Any plot: the screens come from the
 * checks, wherever they run.
 */
export const judgedByEye = (
  quest: Pick<Quest, 'kind' | 'tags' | 'party_role'>,
  registry: Pick<Registry, 'kinds' | 'rituals'>,
): boolean => ritualOf(quest, registry)?.vision === true;

/**
 * The tags that may make a quest's ritual ask for eyes: those of a kind's `ritual_overrides` whose ritual has `vision`
 * (`visual` in the default registry), whatever override comes first. While no tribe that works reads images, the
 * Chancellor, its triage and a mage are not shown them (fix/council-run-gaps (a), PS-11 (l)): a quest so tagged would
 * wait in review for a judge who can see. The owner may still give one (`quest add --tag`).
 */
export function eyeTagsOf(registry: Pick<Registry, 'kinds' | 'rituals'>): ReadonlySet<string> {
  const eyed = new Set(registry.rituals.filter(({ vision }) => vision === true).map(({ id }) => id));
  return new Set(
    registry.kinds.flatMap(({ ritual_overrides: overrides = [] }) =>
      overrides.filter(({ ritual }) => eyed.has(ritual)).flatMap(({ tags_any }) => tags_any),
    ),
  );
}
