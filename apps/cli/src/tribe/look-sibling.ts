// `elvaria tribe look <sibling>` (PS-27b, plans/sibling-tribes.md CT8): a sibling looks as its root does but for the
// aura, so the owner changes its parts on the root (`tribe look <root>`) and only names the sibling here: `--name`
// writes kingdom.tribes[].sibling_name, `--reset` drops it and the sibling takes the root's name with its Roman
// ordinal again. A part option is refused (exit 1); a `look` written on a sibling by hand is ignored (doctor warns).
import { EXIT } from '../command.ts';
import { showLook } from './look-view.ts';
import { updateTribe } from './save.ts';
import type { Tribe, TribeLookPool } from '@elvaria/domain';

import type { ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

/** What the command line asks of a sibling: the part options it names, a name, or --reset. */
export interface SiblingRequest {
  readonly parts: readonly string[];
  readonly name: string | undefined;
  readonly reset: boolean;
}

/** The sibling and its root, as kingdom.json holds them. */
export interface SiblingRows {
  readonly tribe: Tribe;
  readonly root: Tribe;
}

/** Writes sibling_name of one sibling (undefined drops it), and returns the tribes as written. */
const writeName = (ctx: KingdomContext, tribe: Tribe, name: string | undefined) =>
  updateTribe(ctx, tribe.id, (entry) => {
    const { sibling_name: _dropped, ...rest } = entry;
    return name === undefined ? rest : { ...rest, sibling_name: name };
  });

export async function siblingLook(
  ctx: KingdomContext,
  pool: TribeLookPool,
  { tribe, root }: SiblingRows,
  request: SiblingRequest,
): Promise<ExitCode> {
  const params = { tribe: tribe.id, root: root.id };
  if (request.parts.length > 0) {
    const options = request.parts.map((part) => `--${part}`).join(', ');
    ctx.io.err(ctx.t('cli.tribe.look.sibling_parts', { ...params, options }));
    return EXIT.failed;
  }
  if (!request.reset && request.name === undefined) {
    showLook(ctx, pool, ctx.kingdom.tribes, tribe.id);
    return EXIT.ok;
  }
  if (request.reset && tribe.sibling_name === undefined) {
    ctx.io.out(ctx.t('cli.tribe.look.no_sibling_name', params));
    return EXIT.ok;
  }
  const written = await writeName(ctx, tribe, request.reset ? undefined : request.name);
  if (written === undefined) return EXIT.failed;
  ctx.io.out(ctx.t(request.reset ? 'cli.tribe.look.sibling_reset' : 'cli.tribe.look.sibling_saved', params));
  showLook(ctx, pool, written, tribe.id);
  return EXIT.ok;
}
