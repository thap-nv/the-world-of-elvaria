// A quest branch's pull request on GitHub (PS-08c): found first in any state, an open one before a closed one, then
// opened; and where it stands for `pr_merge` (PS-08d), its required checks read from the head's check runs and
// commit statuses. Every step may run again: a Steward stopped after it opened the pull request finds it next time.
import { err, ok } from '@elvaria/domain';
import type { Result } from '@elvaria/domain';
import type {
  ForgeCheck,
  ForgeProblem,
  ForgeRepo,
  PullRequest,
  PullRequestDraft,
  PullStatus,
} from '@elvaria/steward';

import { field, githubCall, repoPath, text } from './github-api.ts';
import type { GithubCall } from './github-api.ts';

const HTTP_UNPROCESSABLE = 422;
const PAGE = 'per_page=100';

const pullOf = (value: unknown): PullRequest => ({
  number: Number(field(value, 'number')),
  url: text(value, 'html_url'),
});

/** The branch's pull requests, newest first as GitHub lists them; the open one first. */
async function found(
  call: GithubCall,
  repo: ForgeRepo,
  branch: string,
): Promise<Result<PullRequest | undefined, ForgeProblem>> {
  const head = encodeURIComponent(`${repo.owner}:${branch}`);
  const answer = await githubCall(call, 'GET', `${repoPath(repo, 'pulls')}?head=${head}&state=all&${PAGE}`);
  if (!answer.ok) return err(answer.problem);
  const pulls: readonly unknown[] = Array.isArray(answer.body) ? (answer.body as unknown[]) : [];
  const open = pulls.find((pull) => text(pull, 'state') === 'open');
  const any = open ?? pulls[0];
  return ok(any === undefined ? undefined : pullOf(any));
}

/** The branch's pull request, found or opened; a 422 on opening (one opened meanwhile) looks once more. */
export async function openPull(
  call: GithubCall,
  repo: ForgeRepo,
  draft: PullRequestDraft,
): Promise<Result<PullRequest, ForgeProblem>> {
  const before = await found(call, repo, draft.head);
  if (!before.ok) return before;
  if (before.value !== undefined) return ok(before.value);
  const answer = await githubCall(call, 'POST', repoPath(repo, 'pulls'), {
    body: { title: draft.title, head: draft.head, base: draft.base, body: draft.body },
    expected: [HTTP_UNPROCESSABLE],
  });
  if (!answer.ok) return err(answer.problem);
  if (answer.status !== HTTP_UNPROCESSABLE) return ok(pullOf(answer.body));
  const after = await found(call, repo, draft.head);
  if (!after.ok) return after;
  return after.value === undefined
    ? err({ reason: 'forge_error', detail: `HTTP 422: ${text(answer.body, 'message')}` })
    : ok(after.value);
}

/** A check run's or status's verdict: green, red, or not ended yet. */
type Verdict = 'green' | 'red' | 'pending';

const GREEN = new Set(['success', 'neutral', 'skipped']);

interface Seen extends ForgeCheck {
  readonly verdict: Verdict;
}

function runOf(run: unknown): Seen {
  const conclusion = text(run, 'conclusion');
  const ended = text(run, 'status') === 'completed';
  const verdict: Verdict = !ended ? 'pending' : GREEN.has(conclusion) ? 'green' : 'red';
  return {
    name: text(run, 'name'),
    conclusion: ended ? conclusion : text(run, 'status'),
    url: text(run, 'html_url'),
    verdict,
  };
}

function statusOf(status: unknown): Seen {
  const state = text(status, 'state');
  const verdict: Verdict = state === 'success' ? 'green' : state === 'pending' ? 'pending' : 'red';
  return { name: text(status, 'context'), conclusion: state, url: text(status, 'target_url'), verdict };
}

/** The head's check runs and commit statuses, by name. */
async function checksOf(
  call: GithubCall,
  repo: ForgeRepo,
  sha: string,
): Promise<Result<Seen[], ForgeProblem>> {
  const runs = await githubCall(call, 'GET', `${repoPath(repo, 'commits', sha, 'check-runs')}?${PAGE}`);
  if (!runs.ok) return err(runs.problem);
  const statuses = await githubCall(call, 'GET', repoPath(repo, 'commits', sha, 'status'));
  if (!statuses.ok) return err(statuses.problem);
  const listed = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
  return ok([
    ...listed(field(runs.body, 'check_runs')).map(runOf),
    ...listed(field(statuses.body, 'statuses')).map(statusOf),
  ]);
}

/** The required checks' verdict: red if one is red, pending if one has not ended or is missing, else green. */
function requiredOf(
  seen: readonly Seen[],
  required: readonly string[],
): { verdict: Verdict; checks: ForgeCheck[] } {
  const of = required.map(
    (name) =>
      seen.find((check) => check.name === name) ?? {
        name,
        conclusion: 'missing',
        verdict: 'pending' as const,
      },
  );
  const red = of.filter(({ verdict }) => verdict === 'red');
  const strip = ({ name, conclusion, url }: Seen): ForgeCheck => ({
    name,
    conclusion,
    ...(url === undefined || url === '' ? {} : { url }),
  });
  if (red.length > 0) return { verdict: 'red', checks: red.map(strip) };
  const waiting = of.filter(({ verdict }) => verdict === 'pending');
  return { verdict: waiting.length > 0 ? 'pending' : 'green', checks: waiting.map(strip) };
}

/** Where pull request `pr` stands; with no required check, GitHub's `mergeable` says (null: not computed yet). */
export async function pullStatus(
  call: GithubCall,
  repo: ForgeRepo,
  pr: number,
  required: readonly string[],
): Promise<Result<PullStatus, ForgeProblem>> {
  const answer = await githubCall(call, 'GET', repoPath(repo, 'pulls', String(pr)));
  if (!answer.ok) return err(answer.problem);
  const head = text(field(answer.body, 'head'), 'sha');
  const branch = text(field(answer.body, 'head'), 'ref');
  if (field(answer.body, 'merged') === true) {
    const sha = text(answer.body, 'merge_commit_sha');
    return ok({ state: 'merged', branch, head, checks: [], ...(sha === '' ? {} : { merge_sha: sha }) });
  }
  if (text(answer.body, 'state') === 'closed') return ok({ state: 'closed', branch, head, checks: [] });
  const mergeable = field(answer.body, 'mergeable');
  if (mergeable === false) return ok({ state: 'conflict', branch, head, checks: [] });
  if (required.length === 0)
    return ok({ state: mergeable === true ? 'green' : 'pending', branch, head, checks: [] });
  const seen = await checksOf(call, repo, head);
  if (!seen.ok) return seen;
  const { verdict, checks } = requiredOf(seen.value, required);
  return ok({ state: verdict === 'green' && mergeable !== true ? 'pending' : verdict, branch, head, checks });
}
