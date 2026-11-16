// A forge in memory for the delivery specs (PS-08c): the Forge port as a GitHub adapter gives it, without a network.
// It reads `https://github.com/<owner>/<name>.git` remotes, keeps one pull request per branch (found before one is
// opened, as the adapter does), records every call, and can be told to refuse `open` or to hold it until released.
import { err, ok } from '@elvaria/domain';

import type { Forge, ForgeProblem, ForgeRepo, PullRequest, PullRequestDraft } from '../forge/forge.ts';

const REMOTE = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/;

export interface ForgeCall {
  readonly method: 'access' | 'open' | 'status' | 'merge' | 'deleteBranch';
  readonly repo: ForgeRepo;
  readonly draft?: PullRequestDraft;
}

/** A held `open`: `entered` resolves once a call waits; `release` lets it go on. */
export interface HeldOpen {
  readonly entered: Promise<void>;
  release(): void;
}

export interface FakeForge extends Forge {
  readonly calls: ForgeCall[];
  /** The pull requests by head branch, in the order they were opened. */
  readonly pulls: Map<string, PullRequest & { readonly draft: PullRequestDraft }>;
  /** Every `open` from now on fails with `problem`; undefined: they succeed again. */
  failOpen(problem: ForgeProblem | undefined): void;
  /** The next `open` waits until released, then goes on as any other. */
  holdOpen(): HeldOpen;
}

const parked = (): { promise: Promise<void>; end: () => void } => {
  let end = (): void => undefined;
  const promise = new Promise<void>((resolve) => {
    end = resolve;
  });
  return { promise, end };
};

export function fakeForge(): FakeForge {
  const calls: ForgeCall[] = [];
  const pulls: FakeForge['pulls'] = new Map();
  let failure: ForgeProblem | undefined;
  let held: { readonly entered: () => void; readonly released: Promise<void> } | undefined;
  const opened = (repo: ForgeRepo, draft: PullRequestDraft): PullRequest => {
    const found = pulls.get(draft.head);
    if (found !== undefined) return { number: found.number, url: found.url };
    const number = pulls.size + 1;
    const url = `https://github.com/${repo.owner}/${repo.name}/pull/${number}`;
    pulls.set(draft.head, { number, url, draft });
    return { number, url };
  };
  return {
    calls,
    pulls,
    failOpen: (problem) => {
      failure = problem;
    },
    holdOpen: () => {
      const entered = parked();
      const released = parked();
      held = { entered: entered.end, released: released.promise };
      return { entered: entered.promise, release: released.end };
    },
    repoOf: (remote, cwd) => {
      const match = REMOTE.exec(remote);
      return match === null ? undefined : { owner: match[1] ?? '', name: match[2] ?? '', cwd };
    },
    access: (repo) => {
      calls.push({ method: 'access', repo });
      return Promise.resolve(ok('push'));
    },
    open: async (repo, draft) => {
      calls.push({ method: 'open', repo, draft });
      const hold = held;
      held = undefined;
      if (hold !== undefined) {
        hold.entered();
        await hold.released;
      }
      return failure === undefined ? ok(opened(repo, draft)) : err(failure);
    },
    status: (repo) => {
      calls.push({ method: 'status', repo });
      return Promise.resolve(err({ reason: 'forge_error', detail: 'not in PS-08c' }));
    },
    merge: (repo) => {
      calls.push({ method: 'merge', repo });
      return Promise.resolve(err({ reason: 'forge_error', detail: 'not in PS-08c' }));
    },
    deleteBranch: (repo) => {
      calls.push({ method: 'deleteBranch', repo });
      return Promise.resolve(err({ reason: 'forge_error', detail: 'not in PS-08c' }));
    },
  };
}
