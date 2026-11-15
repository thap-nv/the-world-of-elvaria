// Whether the Steward could deliver to the forge of each territory whose delivery pushes (PS-08, ADR 0023): its remote
// names a repo there, git gives a credential for the host without asking anyone, and the forge lets that account push.
// A territory delivering by hand gets no line. Neither the token nor the account's name is printed: the owner knows
// whose sign-in it is, and a doctor's output gets pasted into reports. A forge out of reach only warns, since pushing
// may still work later; a missing credential or right is an error, as nothing would be delivered.
import { deliveryOf } from '@elvaria/domain';
import type { Territory } from '@elvaria/domain';
import { fromPortable } from '@elvaria/store';

import { CREDENTIAL_TIMEOUT_MS, readCredential } from '../forge/credential.ts';
import { repoAccessOf } from '../forge/github.ts';
import { forgeRepoOf } from '../forge/remote.ts';
import { finding } from './finding.ts';
import type { CredentialProblem } from '../forge/credential.ts';
import type { RepoAccess } from '../forge/github.ts';
import type { ForgeRepo } from '../forge/remote.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { Finding } from './finding.ts';

const MS_PER_SECOND = 1000;

/** The territory, its mode, the forge's host and `owner/repo`: every line names them. */
type Subject = Readonly<Record<'id' | 'mode' | 'host' | 'repo', string>>;

/** What a credential problem means for one territory; on macOS a stopped call is most likely the Keychain asking. */
export function credentialFinding(
  ctx: Pick<KingdomContext, 't' | 'io'>,
  subject: Subject,
  problem: CredentialProblem,
): Finding {
  const { t } = ctx;
  if (problem === 'no_git') return finding('error', t('cli.doctor.delivery_no_git', subject));
  if (problem === 'none')
    return finding('error', t('cli.doctor.delivery_no_credential', subject), [
      t('cli.doctor.delivery_sign_in', subject),
    ]);
  const seconds = CREDENTIAL_TIMEOUT_MS / MS_PER_SECOND;
  const hint = ctx.io.platform === 'darwin' ? 'cli.doctor.delivery_keychain' : 'cli.doctor.delivery_slow';
  return finding('error', t('cli.doctor.delivery_timeout', { ...subject, seconds }), [t(hint, subject)]);
}

/** What the forge's answer means for one territory. */
export function accessFinding(ctx: Pick<KingdomContext, 't'>, subject: Subject, access: RepoAccess): Finding {
  const { t } = ctx;
  if (access.kind === 'push') return finding('ok', t('cli.doctor.delivery_can_push', subject));
  if (access.kind === 'read_only') return finding('error', t('cli.doctor.delivery_read_only', subject));
  if (access.kind === 'refused')
    return finding('error', t('cli.doctor.delivery_refused', { ...subject, status: access.status }));
  if (access.kind === 'not_found') return finding('error', t('cli.doctor.delivery_not_found', subject));
  return finding('warn', t('cli.doctor.delivery_unreachable', { ...subject, detail: access.detail }));
}

async function checkRepo(ctx: KingdomContext, territory: Territory, repo: ForgeRepo): Promise<Finding[]> {
  const subject: Subject = {
    id: territory.id,
    mode: deliveryOf(territory).mode,
    host: repo.host,
    repo: `${repo.owner}/${repo.name}`,
  };
  const folder = fromPortable(territory.path, ctx.io.platform);
  const credential = await readCredential(ctx.io, folder, repo);
  if (!credential.ok) return [credentialFinding(ctx, subject, credential.error)];
  const access = await repoAccessOf(ctx.io.fetch, repo, credential.value.password);
  return [
    finding('ok', ctx.t('cli.doctor.delivery_credential', subject)),
    accessFinding(ctx, subject, access),
  ];
}

async function checkTerritory(ctx: KingdomContext, territory: Territory): Promise<Finding[]> {
  const delivery = deliveryOf(territory);
  const { remote } = territory.vcs;
  const repo = remote === undefined ? undefined : forgeRepoOf(remote, delivery.forge);
  if (repo !== undefined) return checkRepo(ctx, territory, repo);
  const params = { id: territory.id, mode: delivery.mode, forge: delivery.forge, remote: remote ?? '' };
  return [finding('error', ctx.t('cli.doctor.delivery_no_repo', params))];
}

/** One line or two per territory whose delivery is not manual, in the order of the territories. */
export async function checkDelivery(ctx: KingdomContext): Promise<Finding[]> {
  const { items } = await ctx.store.territories.list();
  const delivering = items.filter((territory) => deliveryOf(territory).mode !== 'manual');
  return (await Promise.all(delivering.map((territory) => checkTerritory(ctx, territory)))).flat();
}
