// implementation-plan §5.4: a commit that changes behaviour touches docs/, or says why not with `docs: none`
// in its body. commitlint reports it as a warning: the author decides, the warning keeps the question asked.
import { execFileSync } from 'node:child_process';
import process from 'node:process';

const BEHAVIOUR_TYPES = ['feat', 'fix', 'perf'];
const MESSAGE =
  'a behaviour change touches docs/ or says "docs: none" in the body (implementation-plan §5.4)';

/**
 * @param {{ type?: string | null; raw?: string | null }} commit as parsed by commitlint
 * @param {readonly string[]} staged repo-relative paths with `/`
 * @returns {[boolean, string]} commitlint rule outcome
 */
export function docsNote(commit, staged) {
  if (!BEHAVIOUR_TYPES.includes(commit.type ?? '')) return [true, ''];
  if (staged.some((file) => file.startsWith('docs/'))) return [true, ''];
  const body = (commit.raw ?? '').split(/\r?\n/).slice(1);
  if (body.some((line) => /^docs:\s*none\b/i.test(line.trim()))) return [true, ''];
  return [false, MESSAGE];
}

/**
 * Files staged for the commit being written; empty when git cannot tell (then the note shows, as a warning).
 * @returns {string[]}
 */
export function stagedFiles() {
  // Only what git needs; GIT_INDEX_FILE points at the index `git commit -a` or `git commit <paths>` builds.
  const keys = ['PATH', 'SystemRoot', 'HOME', 'USERPROFILE', 'GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE'];
  const env = Object.fromEntries(keys.flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : [])));
  try {
    const out = execFileSync('git', ['diff', '--cached', '--name-only'], { env, encoding: 'utf8' });
    return out.split(/\r?\n/).filter((line) => line !== '');
  } catch {
    return [];
  }
}
