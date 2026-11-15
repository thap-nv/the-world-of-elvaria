// What GitHub says of a territory's repo under the owner's credential (PS-08, for `elvaria doctor`): one
// `GET /repos/{owner}/{repo}` with a short time limit, whose `permissions.push` tells whether the Steward could push
// there (ADR 0023). PS-08c's adapter, which pushes and opens pull requests, grows from here.
import type { Fetch } from '../io.ts';
import type { ForgeRepo } from './remote.ts';

export const GITHUB_API = 'https://api.github.com';
/** A doctor waits this long for an answer, then says the forge could not be asked. */
export const FORGE_TIMEOUT_MS = 10_000;
const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
/** GitHub answers 403 at its rate limit too, with no requests left: a wait, not a refusal. */
const RATE_LIMITED = 'rate limited';

export type RepoAccess =
  | { readonly kind: 'push' }
  | { readonly kind: 'read_only' }
  /** 401 or 403: the forge does not take the credential for this repo (expired, revoked, an organisation's SSO). */
  | { readonly kind: 'refused'; readonly status: number }
  /** 404: no such repo, or a private one the account cannot see (GitHub says the same for both). */
  | { readonly kind: 'not_found' }
  /** No answer worth reading: the network, the time limit, a rate limit, a server error. */
  | { readonly kind: 'unreachable'; readonly detail: string };

/** The request's headers: the token goes here and nowhere else. */
export const githubHeaders = (token: string): Record<string, string> => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
  // GitHub refuses a request without one; a generic name, nothing about the owner.
  'User-Agent': 'elvaria',
});

const canPush = (body: unknown): boolean => {
  if (typeof body !== 'object' || body === null || !('permissions' in body)) return false;
  const { permissions } = body;
  return typeof permissions === 'object' && permissions !== null && 'push' in permissions
    ? permissions.push === true
    : false;
};

async function accessOf(response: Response): Promise<RepoAccess> {
  if (response.status === HTTP_OK)
    return canPush(await response.json()) ? { kind: 'push' } : { kind: 'read_only' };
  if (response.status === HTTP_FORBIDDEN && response.headers.get('x-ratelimit-remaining') === '0')
    return { kind: 'unreachable', detail: RATE_LIMITED };
  if (response.status === HTTP_UNAUTHORIZED || response.status === HTTP_FORBIDDEN)
    return { kind: 'refused', status: response.status };
  if (response.status === HTTP_NOT_FOUND) return { kind: 'not_found' };
  return { kind: 'unreachable', detail: `HTTP ${response.status}` };
}

/** What the forge lets the credential's account do on `repo`; a failure of the network is `unreachable`, no throw. */
export async function repoAccessOf(
  fetch: Fetch,
  repo: ForgeRepo,
  token: string,
  timeoutMs = FORGE_TIMEOUT_MS,
): Promise<RepoAccess> {
  const url = `${GITHUB_API}/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
  try {
    const response = await fetch(url, {
      headers: githubHeaders(token),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return await accessOf(response);
  } catch (error) {
    return { kind: 'unreachable', detail: error instanceof Error ? error.message : String(error) };
  }
}
