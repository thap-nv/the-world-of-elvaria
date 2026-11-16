// The end of a delivery on GitHub (the port's part PS-08d uses): merge a pull request only while its head is the one
// the Steward pushed, and delete the quest branch only while its tip is still that head. Through REST, never
// `git push --delete`, which would run the territory's pre-push hook once more.
import { err, ok } from '@elvaria/domain';
import type { MergeMethod, Result } from '@elvaria/domain';
import type { ForgeProblem, ForgeRepo, MergeProblem } from '@elvaria/steward';

import { field, githubCall, repoPath, text } from './github-api.ts';
import type { GithubCall } from './github-api.ts';

const HTTP_NO_CONTENT = 204;
const HTTP_NOT_FOUND = 404;
/** GitHub's answer to a merge that cannot happen now (conflicts, a branch protection). */
const HTTP_NOT_ALLOWED = 405;
/** GitHub's answer to a merge whose `sha` is no longer the head. */
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE = 422;

/** Merges `pr` by `method` while its head is `head`; the merge commit's sha. */
export async function mergePull(
  call: GithubCall,
  repo: ForgeRepo,
  pr: number,
  options: { readonly method: MergeMethod; readonly head: string },
): Promise<Result<string, MergeProblem>> {
  const answer = await githubCall(call, 'PUT', repoPath(repo, 'pulls', String(pr), 'merge'), {
    body: { merge_method: options.method, sha: options.head },
    expected: [HTTP_NOT_ALLOWED, HTTP_CONFLICT],
  });
  if (!answer.ok) return err(answer.problem);
  const detail = text(answer.body, 'message');
  if (answer.status === HTTP_NOT_ALLOWED) return err({ reason: 'conflict', detail });
  if (answer.status === HTTP_CONFLICT) return err({ reason: 'head_moved', detail });
  return ok(text(answer.body, 'sha'));
}

/** Deletes `branch` while its tip is `head`; false when it moved or is gone already. */
export async function deleteBranch(
  call: GithubCall,
  repo: ForgeRepo,
  branch: string,
  head: string,
): Promise<Result<boolean, ForgeProblem>> {
  const ref = ['heads', ...branch.split('/')];
  const tip = await githubCall(call, 'GET', repoPath(repo, 'git', 'ref', ...ref), {
    expected: [HTTP_NOT_FOUND],
  });
  if (!tip.ok) return err(tip.problem);
  if (tip.status === HTTP_NOT_FOUND || text(field(tip.body, 'object'), 'sha') !== head) return ok(false);
  const gone = await githubCall(call, 'DELETE', repoPath(repo, 'git', 'refs', ...ref), {
    expected: [HTTP_NOT_FOUND, HTTP_UNPROCESSABLE],
  });
  if (!gone.ok) return err(gone.problem);
  return ok(gone.status === HTTP_NO_CONTENT);
}
