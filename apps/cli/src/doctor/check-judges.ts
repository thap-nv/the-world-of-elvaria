// Who judges the work of each model (P1-56, (d) of the P1-50 report): a quest is never judged on its doer's own model
// (ADR 0008, `fitJudges` of the domain), so a model of doers whose judges of another model all draw on one mana pool
// has nobody to judge its work as soon as that pool's gauge closes, or the owner suspends them. In P1-50 the Opus
// quests waited fifty minutes before the owner saw it, with two Argon judges: two characters, one gauge. So the
// judges are counted by pool, not by head ((b) of P1-56, PS-03). The Steward rings when nobody is left at all
// (`unjudgeable`) and when every judge's mana is closed (`judge_mana`, PS-03); this is the warning before that.
import { poolKeyOf } from '@elvaria/domain';
import type { Character, CharacterClass, Tribe } from '@elvaria/domain';

import { finding } from './finding.ts';
import type { KingdomContext } from './../kingdom-context.ts';
import type { Finding } from './finding.ts';

/** A model of doers whose judges of another model all draw on one mana pool. */
export interface OnePoolJudges {
  readonly model: string;
  readonly judges: readonly string[];
  readonly tribe: string;
  readonly pool: string;
}

type RoleOf = Pick<CharacterClass, 'id' | 'kinds' | 'is_verifier' | 'is_monk'>;
type Member = Pick<Character, 'id' | 'class' | 'model' | 'tribe' | 'status'>;

/**
 * The models whose doers have judges of another model on a single mana pool (poolKeyOf: the tribe's pool of the
 * judge's model). Those who count are the characters that can take work now: not suspended, of an enabled tribe. A
 * judge judges what its class's kinds say; a model's doers work the kinds of their classes together.
 */
export function onePoolJudgesOf(
  characters: readonly Member[],
  classes: readonly RoleOf[],
  tribes: readonly Pick<Tribe, 'id' | 'enabled' | 'pools'>[],
): OnePoolJudges[] {
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
    const pools = new Map(
      fit.map(({ character }) => {
        const key = poolKeyOf(tribes, character);
        return [`${key.tribe}/${key.pool}`, key];
      }),
    );
    const [only] = pools.values();
    return pools.size === 1 && only !== undefined
      ? [{ model, judges: fit.map(({ character }) => character.id), tribe: only.tribe, pool: only.pool }]
      : [];
  });
}

/** One warning per model whose judges of another model draw on one pool; nothing for a kingdom with none. */
export async function checkJudges(ctx: KingdomContext): Promise<Finding[]> {
  const [characters, registry] = await Promise.all([ctx.store.characters.list(), ctx.store.loadRegistry()]);
  // An unreadable registry or character file is reported by its own check.
  if (!registry.ok) return [];
  return onePoolJudgesOf(characters.items, registry.value.classes, ctx.kingdom.tribes).map(
    ({ model, judges, tribe, pool }) =>
      finding('warn', ctx.t('cli.doctor.one_pool_judges', { model, judges: judges.join(', '), tribe, pool })),
  );
}
