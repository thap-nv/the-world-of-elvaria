// The models a tribe's adapter says its CLI serves (`capabilities.models`, implementation-plan §3.14, PS-23):
// `character add` and `character model` take only those, as the Steward's set_model does, and a summoned character
// starts at the level the adapter gives its model. An adapter that declares none leaves any slug to the tribe, its
// family read from the slug, as before PS-23. The runner is built as `doctor` builds it (an adapter file is loaded
// and asked, nothing spawned).
import { modelEntryOf } from '@elvaria/domain';
import type { Tribe, TribeModel } from '@elvaria/domain';

import { handOf } from '../run/crew.ts';
import type { KingdomContext } from '../kingdom-context.ts';

/** The tribe's declared models; undefined when its adapter declares none or has no runner to ask. */
export async function declaredModelsOf(
  tribe: Tribe,
  ctx: KingdomContext,
): Promise<readonly TribeModel[] | undefined> {
  const found = await handOf(tribe, { kingdom: ctx.kingdom, root: ctx.store.root }, ctx.io);
  return found.kind === 'ready' ? found.hand.runner.capabilities.models : undefined;
}

/** Why `model` cannot be a character's of `tribe`, when the adapter names its models and not this one. */
export function unservedLine(
  ctx: Pick<KingdomContext, 't'>,
  tribe: Tribe,
  model: string,
  declared: readonly TribeModel[] | undefined,
): string | undefined {
  if (declared === undefined || modelEntryOf(declared, model) !== undefined) return undefined;
  const models = declared.map(({ id }) => id).join(', ');
  return ctx.t('cli.character.model_not_served', { tribe: tribe.id, model, models });
}
