// SEC-02b, ADR 0023: reject repo-owned programs before an update or push can activate them.
import { runDeliveryGit } from './git.ts';
import type { DeliveryGit } from './git.ts';
import type { Failure } from './outcome.ts';

const CONFIG_TIMEOUT_MS = 30_000;
const CONFIG_FIELDS = 2;
const REPO_SCOPES = new Set(['local', 'worktree']);
const PROGRAM_KEY =
  /^(?:filter\..+\.(?:clean|smudge|process)|diff\..+\.textconv|merge\..+\.driver|remote\..+\.(?:receivepack|uploadpack)|core\.gitproxy|protocol\..+\.allow|url\..+\.insteadof)$/;

/** Git emits scope NUL key LF value NUL (or key alone for an implicit true). */
function refusedKeys(listing: string): string[] {
  const fields = listing.split('\0');
  const keys: string[] = [];
  let signing = false;
  for (let at = 0; at + 1 < fields.length; at += CONFIG_FIELDS) {
    const scope = fields[at] ?? '';
    const pair = fields[at + 1] ?? '';
    const cut = pair.indexOf('\n');
    const key = cut < 0 ? pair : pair.slice(0, cut);
    const value = cut < 0 ? undefined : pair.slice(cut + 1);
    // Last effective value wins, including an owner's signing setting inherited by the repo.
    if (key === 'commit.gpgsign')
      signing = value === undefined || !/^(?:false|no|off|0|)$/i.test(value.trim());
    if (REPO_SCOPES.has(scope) && (PROGRAM_KEY.test(key) || key === 'gpg.program')) keys.push(key);
  }
  return [...new Set(keys)].filter((key) => key !== 'gpg.program' || signing);
}

/** No values or git error output leave this probe: either can contain private data. */
export async function repoConfigFailure(
  git: DeliveryGit,
  cwd: string,
  branch: string,
  signal: AbortSignal,
): Promise<Failure | undefined> {
  const run = await runDeliveryGit(git, cwd, ['config', '--list', '--show-scope', '-z'], {
    timeout_ms: CONFIG_TIMEOUT_MS,
    signal,
  });
  const keys = run.code === 0 ? refusedKeys(run.output) : [];
  if (run.code === 0 && keys.length === 0) return undefined;
  return {
    stage: 'push',
    reason: 'push_refused',
    branch,
    detail: run.code === 0 ? `repo config refused: ${keys.join(', ')}` : 'cannot read repo config',
  };
}
