// Two tribes on one account (PS-27, ADR 0021, CT4): login tribes of one adapter may not share the CLI's config folder
// (two that name none share its default) nor the account signed in there, or both mana pools would measure one
// account and the Steward would spend its limit twice. doctor gathers what each adapter's doctor() said and reports
// both tribes of every pair (accountClashesOf); `tribe check` holds the tribe it checks to the other enabled tribes
// of its adapter before it enables it. The account fingerprint is compared in memory and dropped: a message names the
// two tribes and, for a shared folder, the folder, never the account.
import { accountClashesOf } from '@elvaria/domain';
import type { AccountClash, AccountRow, Tribe, TribeId } from '@elvaria/domain';
import type { Translate } from '@elvaria/i18n';
import type { ToolInfo } from '@elvaria/runner-core';
import { toPortable } from '@elvaria/store';

import { handOf } from '../run/crew.ts';
import { finding } from './finding.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { Finding } from './finding.ts';

/** A tribe as checked, and what its adapter's doctor() said of its CLI. */
export interface AccountSubject {
  readonly tribe: Tribe;
  readonly info: ToolInfo;
}

/** A folder as accountClashesOf compares it: `/`, none at the end, lower case where the file system has no case. */
function folderKey(dir: string, platform: NodeJS.Platform): string {
  const slashed = toPortable(dir, platform).replace(/\/+$/, '');
  return platform === 'win32' || platform === 'darwin' ? slashed.toLowerCase() : slashed;
}

/**
 * The rows accountClashesOf weighs: the folder the CLI says it runs in, else the one the tribe names; and each
 * folder's key as the owner wrote or the CLI said it, for the message.
 */
function rowsOf(subjects: readonly AccountSubject[], platform: NodeJS.Platform) {
  const shown = new Map<string, string>();
  const rows = subjects.map(({ tribe, info }): AccountRow => {
    const dir = info.config_dir ?? tribe.tool?.config_dir;
    const key = dir === undefined ? undefined : folderKey(dir, platform);
    if (key !== undefined && dir !== undefined && !shown.has(key)) shown.set(key, dir);
    return {
      id: tribe.id,
      adapter: tribe.adapter,
      auth: tribe.tool?.auth ?? 'login',
      ...(key === undefined ? {} : { config_dir: key }),
      ...(info.account === undefined ? {} : { account: info.account }),
    };
  });
  return { rows, shown };
}

interface ClashLine {
  readonly clash: AccountClash;
  readonly tribe: TribeId;
  readonly other: TribeId;
  readonly adapter: string;
  readonly shown: ReadonlyMap<string, string>;
}

function clashText(t: Translate, { clash, tribe, other, adapter, shown }: ClashLine): string {
  if (clash.code === 'same_account') return t('cli.doctor.account_same_account', { tribe, other });
  const dir = clash.config_dir;
  if (dir === undefined) return t('cli.doctor.account_same_default', { tribe, other, adapter });
  return t('cli.doctor.account_same_dir', { tribe, other, path: shown.get(dir) ?? dir });
}

/** The errors of each tribe in a clash among `subjects`, by tribe: each names the other tribe of its pair. */
export function accountFindings(
  ctx: Pick<KingdomContext, 't' | 'io'>,
  subjects: readonly AccountSubject[],
): Map<TribeId, Finding[]> {
  const { rows, shown } = rowsOf(subjects, ctx.io.platform);
  const found = new Map<TribeId, Finding[]>();
  for (const clash of accountClashesOf(rows)) {
    const [one, two] = clash.tribes;
    const adapter = rows.find(({ id }) => id === one)?.adapter ?? '';
    for (const [tribe, other] of [
      [one, two],
      [two, one],
    ] as const) {
      const line = finding('error', clashText(ctx.t, { clash, tribe, other, adapter, shown }));
      found.set(tribe, [...(found.get(tribe) ?? []), line]);
    }
  }
  return found;
}

/**
 * The errors of `subject` against the other enabled tribes of its adapter (`tribe check`, PS-27): each one's
 * doctor() is asked, which calls no model.
 */
export async function accountFindingsAgainst(
  ctx: KingdomContext,
  subject: AccountSubject,
): Promise<Finding[]> {
  const { id, adapter } = subject.tribe;
  const others = ctx.kingdom.tribes.filter(
    (tribe) => tribe.enabled && tribe.id !== id && tribe.adapter === adapter,
  );
  const said = await Promise.all(
    others.map(async (tribe) => {
      const found = await handOf(tribe, { kingdom: ctx.kingdom, root: ctx.store.root }, ctx.io);
      return found.kind === 'ready' ? [{ tribe, info: await found.hand.runner.doctor() }] : [];
    }),
  );
  return accountFindings(ctx, [subject, ...said.flat()]).get(id) ?? [];
}
