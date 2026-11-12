// Who judges the work of each model (P1-56, (d) of the P1-50 report): a quest is never judged on its doer's own model
// (ADR 0008, `fitJudges` of the domain), so a model of doers with one judge of another model has nobody to judge its
// work as soon as that judge's mana gauge closes or the owner suspends them. In P1-50 the Opus quests waited fifty
// minutes before the owner saw it. The Steward rings when nobody is left at all (`unjudgeable`); this is the warning
// before that, while the owner can still summon a second judge.
import type { Character, CharacterClass, Tribe } from '@elvaria/domain';

import { finding } from './finding.ts';
import type { KingdomContext } from './../kingdom-context.ts';
import type { Finding } from './finding.ts';

/** A model of doers and the one judge of another model that its work has. */
export interface LoneJudge {
  readonly model: string;
  readonly judge: string;
}

type RoleOf = Pick<CharacterClass, 'id' | 'kinds' | 'is_verifier' | 'is_monk'>;

/**
 * The models whose doers have exactly one judge of another model. Those who count are the characters that can take
 * work now: not suspended, of an enabled tribe. A judge judges what its class's kinds say; a model's doers work the
 * kinds of their classes together.
 */
export function loneJudgesOf(
  characters: readonly Pick<Character, 'id' | 'class' | 'model' | 'tribe' | 'status'>[],
  classes: readonly RoleOf[],
  tribes: readonly Pick<Tribe, 'id' | 'enabled'>[],
): LoneJudge[] {
  const roles = new Map(classes.map((role) => [role.id as string, role]));
  const awake = new Set(tribes.filter(({ enabled }) => enabled).map(({ id }) => id as string));
  const active = characters.flatMap((character) => {
    const role = roles.get(character.class);
    return character.status !== 'suspended' && awake.has(character.tribe) && role !== undefined
      ? [{ character, role }]
      : [];
  });
  const judges = active.filter(({ role }) => role.is_verifier);
  const doers = active.filter(({ role }) => !role.is_verifier && !role.is_monk && role.kinds.length > 0);
  return [...new Set(doers.map(({ character }) => character.model))].flatMap((model) => {
    const kinds = new Set(
      doers.filter(({ character }) => character.model === model).flatMap(({ role }) => role.kinds),
    );
    const fit = judges.filter(
      ({ character, role }) => character.model !== model && role.kinds.some((kind) => kinds.has(kind)),
    );
    const [only] = fit;
    return fit.length === 1 && only !== undefined ? [{ model, judge: only.character.id }] : [];
  });
}

/** One warning per model whose work has a single judge of another model; nothing for a kingdom with none. */
export async function checkJudges(ctx: KingdomContext): Promise<Finding[]> {
  const [characters, registry] = await Promise.all([ctx.store.characters.list(), ctx.store.loadRegistry()]);
  // An unreadable registry or character file is reported by its own check.
  if (!registry.ok) return [];
  return loneJudgesOf(characters.items, registry.value.classes, ctx.kingdom.tribes).map(({ model, judge }) =>
    finding('warn', ctx.t('cli.doctor.lone_judge', { model, judge })),
  );
}
