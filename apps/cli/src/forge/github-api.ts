// One call of GitHub's REST API for the forge adapter (PS-08c, ADR 0023): the CLI's fetch ((e) of PS-08), the
// headers of githubHeaders, a time limit on every call, and an answer the adapter can read without throwing. Messages
// are the forge's own words and may hold anything, the token included: github-forge.ts masks them before they leave
// the adapter.
import { GITHUB_API, githubHeaders } from './github.ts';
import type { Fetch } from '../io.ts';
import type { ForgeProblem, ForgeRepo } from '@elvaria/steward';

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;

/** What one call needs: the network, the token for this call alone, and how long it may take. */
export interface GithubCall {
  readonly fetch: Fetch;
  readonly token: string;
  readonly timeoutMs: number;
}

export type Answer =
  | { readonly ok: true; readonly status: number; readonly body: unknown }
  | { readonly ok: false; readonly problem: ForgeProblem };

/** `/repos/{owner}/{repo}` and the segments after it, each encoded (a branch keeps its `/` as separate segments). */
export const repoPath = (repo: ForgeRepo, ...segments: readonly string[]): string =>
  ['repos', repo.owner, repo.name, ...segments].map(encodeURIComponent).join('/');

const messageOf = (body: unknown): string =>
  typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string'
    ? body.message
    : '';

/** 401 and 403 are the credential's (unless the rate limit is out); anything else that is not 2xx, the forge's. */
function problemOf(response: Response, body: unknown): ForgeProblem {
  const limited = response.headers.get('x-ratelimit-remaining') === '0';
  const refused = response.status === HTTP_UNAUTHORIZED || response.status === HTTP_FORBIDDEN;
  const detail = `HTTP ${response.status}${messageOf(body) === '' ? '' : `: ${messageOf(body)}`}`;
  return { reason: refused && !limited ? 'forge_auth' : 'forge_error', detail };
}

const bodyOf = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (text === '') return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

/**
 * `method` on `path` (after the API's root, a query allowed), with `body` as JSON. `expected` are the statuses the
 * caller reads itself (a 404, a 405); any other one that is not 2xx is a problem.
 */
export async function githubCall(
  call: GithubCall,
  method: string,
  path: string,
  options: { readonly body?: unknown; readonly expected?: readonly number[] } = {},
): Promise<Answer> {
  try {
    const response = await call.fetch(`${GITHUB_API}/${path}`, {
      method,
      headers: githubHeaders(call.token),
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: AbortSignal.timeout(call.timeoutMs),
    });
    const body = await bodyOf(response);
    if (response.ok || options.expected?.includes(response.status) === true)
      return { ok: true, status: response.status, body };
    return { ok: false, problem: problemOf(response, body) };
  } catch (error) {
    return {
      ok: false,
      problem: { reason: 'forge_error', detail: error instanceof Error ? error.message : String(error) },
    };
  }
}

/** A field of an object the forge sent, or undefined. */
export const field = (value: unknown, name: string): unknown =>
  typeof value === 'object' && value !== null && name in value
    ? (value as Record<string, unknown>)[name]
    : undefined;

/** A string field, or ''. */
export const text = (value: unknown, name: string): string => {
  const found = field(value, name);
  return typeof found === 'string' ? found : '';
};
