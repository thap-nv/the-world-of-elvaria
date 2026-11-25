// A fake GitHub for the forge adapter's specs (PS-08c): it answers by method and path, keeps every request, and
// never reaches the network. A route holding a list answers its items in turn, then keeps answering the last one.
import { ok } from '@elvaria/domain';
import type { ForgeRepo } from '@elvaria/steward';

import { GITHUB_API } from '../forge/github.ts';
import { githubForge } from '../forge/github-forge.ts';
import type { Fetch } from '../io.ts';
import type { TokenSource } from '../forge/github-forge.ts';

export const REPO: ForgeRepo = { owner: 'elvaria-specs', name: 'kingdom-repo', cwd: 'C:/lãnh thổ' };
export const HEAD = 'a'.repeat(40);
export const BRANCH = 'quest/q_20261116_aaaaa1';

/** What the fake forge answers: a status, a JSON body (a string goes as it is), headers. */
export interface Reply {
  readonly status: number;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
}

/** One request as the adapter made it; `path` is after the API's root, without its query. */
export interface Asked {
  readonly method: string;
  readonly path: string;
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
  readonly signal: boolean;
}

/** `METHOD path` → its reply, its replies in turn, or an error the fetch throws. */
export type Routes = Record<string, Reply | readonly Reply[] | Error>;

const NO_BODY = new Set([204, 205, 304]);

const responseOf = ({ status, body, headers = {} }: Reply): Response => {
  if (NO_BODY.has(status) || body === undefined) return new Response(null, { status, headers });
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
};

/** A fetch that answers from `routes`; a request no route names is a thrown error, as a network failure would be. */
export function fakeGithub(routes: Routes) {
  const asked: Asked[] = [];
  const turns = new Map<string, number>();
  const fetch: Fetch = (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    const method = init?.method ?? 'GET';
    const path = url.slice(GITHUB_API.length + 1).split('?')[0] ?? '';
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    const headers = init?.headers as Record<string, string>;
    asked.push({ method, path, url, headers, body, signal: init?.signal instanceof AbortSignal });
    const key = `${method} ${path}`;
    const route = routes[key];
    if (route === undefined) return Promise.reject(new Error(`no route for ${key}`));
    if (route instanceof Error) return Promise.reject(route);
    if (!Array.isArray(route)) return Promise.resolve(responseOf(route as Reply));
    const turn = turns.get(key) ?? 0;
    turns.set(key, turn + 1);
    const replies = route as readonly Reply[];
    return Promise.resolve(responseOf(replies[Math.min(turn, replies.length - 1)] ?? { status: 500 }));
  };
  return { fetch, asked };
}

/** A token source that always gives `token`. */
export const fixedToken =
  (token: string): TokenSource =>
  () =>
    Promise.resolve(ok(token));

/** The adapter over a fake GitHub, with a fixed token. */
export function forgeOver(routes: Routes, token: string) {
  const github = fakeGithub(routes);
  return {
    forge: githubForge({ fetch: github.fetch, token: fixedToken(token), timeoutMs: 5000 }),
    ...github,
  };
}

/** `repos/<owner>/<name>/…` of REPO. */
export const at = (...segments: readonly string[]): string =>
  ['repos', REPO.owner, REPO.name, ...segments].join('/');
