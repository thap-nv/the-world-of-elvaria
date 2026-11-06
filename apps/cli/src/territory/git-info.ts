// What territory.vcs records about a git repo (implementation-plan §2.3): its default branch, which quest
// branches start from (§3.3), and its remote, without any credentials in the URL (ADR 0013).
import type { Git } from '../process/git.ts';

export interface GitInfo {
  /** Top folder of the work tree, as git prints it (`/` on every OS). */
  readonly root: string;
  /** origin's default branch, else the branch checked out; undefined on a detached HEAD without origin. */
  readonly defaultBranch: string | undefined;
  readonly remote: string | undefined;
}

/** `https://user:token@host/repo.git` → `https://host/repo.git`. ssh user names (`git@host:…`) are not secrets. */
export const withoutCredentials = (url: string): string => url.replace(/^(https?:\/\/)[^@/]*@/i, '$1');

/** origin's default branch, as `git clone` records it. */
const ORIGIN_HEAD = 'refs/remotes/origin/HEAD';
const HEAD = 'HEAD';

/** undefined when `git` does not see a work tree there. */
export async function readGitInfo(git: Git): Promise<GitInfo | undefined> {
  const root = await git(['rev-parse', '--show-toplevel']);
  if (root === undefined) return undefined;
  const originHead = await git(['symbolic-ref', '--quiet', '--short', ORIGIN_HEAD]);
  const defaultBranch =
    originHead?.replace(/^origin\//, '') ?? (await git(['symbolic-ref', '--quiet', '--short', HEAD]));
  const remote = await git(['remote', 'get-url', 'origin']);
  return { root, defaultBranch, remote: remote === undefined ? undefined : withoutCredentials(remote) };
}
