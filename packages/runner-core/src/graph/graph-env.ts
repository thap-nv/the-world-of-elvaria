// The env of every graphify process, the Steward's builds and a session's graph commands alike (PS-21, ADR 0013,
// ADR 0029). graphify picks a model backend from whatever API key it finds and refreshes its installed skills under
// the home folder on every run, so nothing is left to it: the spike (docs/spikes/graphify-2026-11-12.md §4, §5)
// measured that with these names a run writes nothing outside the graph folder and opens no socket.
import path from 'node:path';

/**
 * No model (`none`), no query log under `~/.cache`, no skill copied into `~/.claude` or OpenCode's folders after an
 * upgrade, no tips; a pinned hash seed, or `update` restarts itself as `python -m graphify` to get one; no `.pyc`
 * written into graphify's own install; UTF-8 for the Vietnamese of a question.
 */
export const GRAPHIFY_ENV = {
  GRAPHIFY_BACKEND: 'none',
  GRAPHIFY_QUERY_LOG_DISABLE: '1',
  GRAPHIFY_NO_AUTO_REFRESH: '1',
  GRAPHIFY_NO_TIPS: '1',
  PYTHONHASHSEED: '0',
  PYTHONDONTWRITEBYTECODE: '1',
  PYTHONUTF8: '1',
} as const;

/** graphify reads and writes its graph in this folder; query, path, explain and affected read `<it>/graph.json`. */
export const GRAPH_OUT_ENV = 'GRAPHIFY_OUT';

/**
 * What a graphify process gets on top of `base` (a minimal env, never the host's whole one): the names above, the
 * graph folder, and graphify's own folder first on PATH, so a session runs it by name as its rules allow it.
 */
export function graphEnvOf(
  base: Readonly<Record<string, string>>,
  program: string,
  graphDir: string,
): Record<string, string> {
  const folder = path.dirname(program);
  const rest = base.PATH;
  return {
    ...base,
    ...GRAPHIFY_ENV,
    [GRAPH_OUT_ENV]: graphDir,
    PATH: rest === undefined || rest === '' ? folder : `${folder}${path.delimiter}${rest}`,
  };
}
