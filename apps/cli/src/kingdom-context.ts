// Commands on an existing kingdom start here: find its folder, read kingdom.json, and speak the owner's language
// from then on (kingdom.owner.locale, unless --locale was given; ADR 0014).
import path from 'node:path';

import { createIdSource, zonedTime } from '@elvaria/domain';
import type { IdSource, Kingdom } from '@elvaria/domain';
import { translator } from '@elvaria/i18n';
import { openKingdom } from '@elvaria/store';
import type { KingdomStore } from '@elvaria/store';

import { textOption } from './args.ts';
import { storeIssueLines } from './issues.ts';
import type { CliContext, CommandInput } from './command.ts';
import type { CliIo } from './io.ts';

export interface KingdomContext extends CliContext {
  readonly store: KingdomStore;
  readonly kingdom: Kingdom;
  /** Command ids (ULID) and dated ids, on the kingdom's local day. */
  readonly ids: IdSource;
  /** The clock's now as kingdom files store it: ISO 8601 with the kingdom's offset (implementation-plan §2.1). */
  readonly now: () => string;
}

/** `--kingdom`, else ELVARIA_KINGDOM (the variable the hooks read too, §3.6), resolved from the cwd. */
export function kingdomDir(input: CommandInput, io: CliIo): string | undefined {
  const dir = textOption(input, 'kingdom') ?? io.env.ELVARIA_KINGDOM;
  return dir === undefined || dir === '' ? undefined : path.resolve(io.cwd, dir);
}

/** The kingdom named on the command line, or undefined once the reason is printed. */
export async function openKingdomContext(
  input: CommandInput,
  ctx: CliContext,
): Promise<KingdomContext | undefined> {
  const dir = kingdomDir(input, ctx.io);
  if (dir === undefined) {
    ctx.io.err(ctx.t('cli.error.no_kingdom'));
    return undefined;
  }
  const store = openKingdom(dir);
  const read = await store.kingdom.read();
  if (!read.ok) {
    const lines =
      read.error.code === 'not_found'
        ? [ctx.t('cli.error.not_a_kingdom', { dir })]
        : storeIssueLines(ctx.t, read.error);
    lines.forEach(ctx.io.err);
    return undefined;
  }
  const kingdom = read.value;
  const locale = ctx.localeFromFlag ? ctx.locale : kingdom.owner.locale;
  const t = translator(locale);
  const time = zonedTime(kingdom.tz);
  const ids = createIdSource({ clock: ctx.io.clock, random: ctx.io.random, tz: kingdom.tz });
  // kingdom.json passed its schema, which accepts only zones Intl knows; this guards a newer Node dropping one.
  if (!time.ok || !ids.ok) {
    ctx.io.err(t('cli.error.time_zone', { tz: kingdom.tz }));
    return undefined;
  }
  const format = time.value.format;
  return {
    ...ctx,
    locale,
    t,
    store,
    kingdom,
    ids: ids.value,
    now: () => format(ctx.io.clock.now()),
  };
}
