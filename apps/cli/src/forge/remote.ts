// The repo on its forge that a territory's remote names (PS-08, (K) of the plan): no `delivery.remote`, so the owner
// and the repo come from vcs.remote, which `territory add` stored without credentials (git-info.ts). Hosts are data,
// one per forge of territory.delivery.forge: github.com alone today.
import type { DeliveryForge } from '@elvaria/domain';

export interface ForgeRepo {
  readonly forge: DeliveryForge;
  /** Where git keeps the credential: the forge's REST API takes the https one, even when the remote is ssh. */
  readonly host: string;
  readonly owner: string;
  readonly name: string;
}

const FORGE_HOSTS: Readonly<Record<DeliveryForge, string>> = { github: 'github.com' };

/** `https://host/owner/repo.git`, `ssh://git@host:22/owner/repo`; a user name before `@` is dropped. */
const URL_FORM =
  /^(?:https?|ssh|git\+ssh):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i;
/** `git@host:owner/repo.git`; a Windows path (`C:/repo`) has no segment between `:` and `/`, so it never matches. */
const SCP_FORM = /^(?:[^@/]+@)?([^/:]+):([^/]+)\/([^/]+?)(?:\.git)?\/?$/;
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
const REPO_NAME = /^[A-Za-z0-9._-]+$/;

/** The forge repo `remote` names, or undefined when it names none on `forge` (another host, a path, a bad name). */
export function forgeRepoOf(remote: string, forge: DeliveryForge): ForgeRepo | undefined {
  const match = URL_FORM.exec(remote.trim()) ?? SCP_FORM.exec(remote.trim());
  const [, host = '', owner = '', name = ''] = match ?? [];
  const forgeHost = FORGE_HOSTS[forge];
  if (host.toLowerCase() !== forgeHost) return undefined;
  if (!OWNER.test(owner) || !REPO_NAME.test(name) || /^\.+$/.test(name)) return undefined;
  return { forge, host: forgeHost, owner, name };
}

/** The `path` git hands its credential helper, which keys a credential by repo when `credential.useHttpPath` is on. */
export const credentialPathOf = (repo: ForgeRepo): string => `${repo.owner}/${repo.name}.git`;
