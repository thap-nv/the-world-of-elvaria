// A forge in memory for the delivery specs (PS-08c, PS-08d): the Forge port as a GitHub adapter gives it, without a
// network. It reads `https://github.com/<owner>/<name>.git` remotes, keeps one pull request per branch (found before
// one is opened, as the adapter does), records every call, and can be told to refuse `open` or to hold it until
// released. Given the bare repo `origin` names, it answers `status` with the branch's real tip there and the state the
// spec set (green by default), merges for real into the remote's main (a clone of its own, then a push), and deletes
// a branch on the remote only while its tip is the head asked for. A held status ends when the Steward's signal does.
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { err, ok } from '@elvaria/domain';
import type { MergeMethod } from '@elvaria/domain';

import { git } from './git-plots.ts';
import type {
  Forge,
  ForgeCheck,
  ForgeProblem,
  ForgeRepo,
  PullRequest,
  PullRequestDraft,
  PullState,
} from '../forge/forge.ts';

const REMOTE = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/;

export interface ForgeCall {
  readonly method: 'access' | 'open' | 'status' | 'merge' | 'deleteBranch';
  readonly repo: ForgeRepo;
  readonly draft?: PullRequestDraft;
}

/** A held call: `entered` resolves once a call waits; `release` lets it go on. */
export interface HeldOpen {
  readonly entered: Promise<void>;
  release(): void;
}

/** What `status` says of every open pull request until told otherwise. */
export interface StatusAnswer {
  readonly state: Exclude<PullState, 'merged'>;
  readonly checks?: readonly ForgeCheck[];
}

export interface FakeForge extends Forge {
  readonly calls: ForgeCall[];
  /** The pull requests by head branch, in the order they were opened. */
  readonly pulls: Map<string, PullRequest & { readonly draft: PullRequestDraft }>;
  /** Pull request numbers merged, by the Steward or by `mergeByHand`, with the merge commit. */
  readonly merged: Map<number, string>;
  /** Every `open` from now on fails with `problem`; undefined: they succeed again. */
  failOpen(problem: ForgeProblem | undefined): void;
  /** The next `open` waits until released, then goes on as any other. */
  holdOpen(): HeldOpen;
  /** What `status` answers from now on for a pull request not merged. */
  answer(status: StatusAnswer): void;
  /** The next `status` waits until the caller's signal aborts, then fails as an aborted request does. */
  holdStatus(): Promise<void>;
  /** The owner merges `branch`'s pull request on the forge; the merge commit. */
  mergeByHand(branch: string): string;
}

const parked = (): { promise: Promise<void>; end: () => void } => {
  let end = (): void => undefined;
  const promise = new Promise<void>((resolve) => {
    end = resolve;
  });
  return { promise, end };
};

const IDENTITY = ['-c', 'user.name=Forge', '-c', 'user.email=forge@elvaria.invalid'];

/** Merges origin's `branch` into the bare remote's main, as the forge does; the merge commit. */
function mergeOnRemote(remote: string, branch: string, method: MergeMethod): string {
  const work = mkdtempSync(path.join(os.tmpdir(), 'elvaria forge merge '));
  try {
    git(work, 'clone', '-q', remote, '.');
    if (method === 'squash') {
      git(work, 'merge', '-q', '--squash', `origin/${branch}`);
      git(work, ...IDENTITY, 'commit', '-q', '-m', `Squash ${branch}`);
    } else git(work, ...IDENTITY, 'merge', '-q', '--no-ff', '-m', `Merge ${branch}`, `origin/${branch}`);
    git(work, 'push', '-q', 'origin', 'main');
    return git(work, 'rev-parse', 'HEAD');
  } finally {
    rmSync(work, { recursive: true, force: true, maxRetries: 5 });
  }
}

export function fakeForge(remote?: string): FakeForge {
  const calls: ForgeCall[] = [];
  const pulls: FakeForge['pulls'] = new Map();
  const merged = new Map<number, string>();
  let failure: ForgeProblem | undefined;
  let held: { readonly entered: () => void; readonly released: Promise<void> } | undefined;
  let answer: StatusAnswer = { state: 'green' };
  let holdStatus: (() => void) | undefined;
  const tipOf = (branch: string): string =>
    remote === undefined ? '' : git(remote, 'for-each-ref', '--format=%(objectname)', `refs/heads/${branch}`);
  const branchOf = (pr: number): string =>
    [...pulls.entries()].find(([, pull]) => pull.number === pr)?.[0] ?? '';
  const opened = (repo: ForgeRepo, draft: PullRequestDraft): PullRequest => {
    const found = pulls.get(draft.head);
    if (found !== undefined) return { number: found.number, url: found.url };
    const number = pulls.size + 1;
    const url = `https://github.com/${repo.owner}/${repo.name}/pull/${number}`;
    pulls.set(draft.head, { number, url, draft });
    return { number, url };
  };
  const mergeOf = (pr: number, method: MergeMethod): string => {
    const sha = mergeOnRemote(remote ?? '', branchOf(pr), method);
    merged.set(pr, sha);
    return sha;
  };
  return {
    calls,
    pulls,
    merged,
    failOpen: (problem) => {
      failure = problem;
    },
    holdOpen: () => {
      const entered = parked();
      const released = parked();
      held = { entered: entered.end, released: released.promise };
      return { entered: entered.promise, release: released.end };
    },
    answer: (given) => {
      answer = given;
    },
    holdStatus: () => {
      const entered = parked();
      holdStatus = entered.end;
      return entered.promise;
    },
    mergeByHand: (branch) => mergeOf(pulls.get(branch)?.number ?? 0, 'merge'),
    repoOf: (remoteUrl, cwd) => {
      const match = REMOTE.exec(remoteUrl);
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
    status: async (repo, pr, _required, signal) => {
      calls.push({ method: 'status', repo });
      const entered = holdStatus;
      holdStatus = undefined;
      if (entered !== undefined && signal !== undefined) {
        entered();
        await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
        return err({ reason: 'forge_error', detail: 'This operation was aborted' });
      }
      const branch = branchOf(pr);
      const head = tipOf(branch);
      const sha = merged.get(pr);
      if (sha !== undefined) return ok({ state: 'merged', branch, head, checks: [], merge_sha: sha });
      return ok({ state: answer.state, branch, head, checks: [...(answer.checks ?? [])] });
    },
    merge: (repo, pr, { method, head }) => {
      calls.push({ method: 'merge', repo });
      if (tipOf(branchOf(pr)) !== head) return Promise.resolve(err({ reason: 'head_moved' }));
      return Promise.resolve(ok(mergeOf(pr, method)));
    },
    deleteBranch: (repo, branch, head) => {
      calls.push({ method: 'deleteBranch', repo });
      if (remote === undefined || tipOf(branch) !== head) return Promise.resolve(ok(false));
      git(remote, 'update-ref', '-d', `refs/heads/${branch}`);
      return Promise.resolve(ok(true));
    },
  };
}
