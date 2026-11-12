// What a prompt says of a quest's scope (implementation-plan §3.16.5, ADR 0028, PS-05): a fact of the quest for the
// assignee and the judge, and for the judge the files the work changed outside it. A quest without a scope gets
// neither, so its prompt reads as before.
import { scopeOf, sharedGlobsOf } from '@elvaria/domain';
import type { Quest, Territory } from '@elvaria/domain';

import { fill } from './templates.ts';
import type { PromptTemplates } from './templates.ts';

const quoted = (paths: readonly string[]): string => paths.map((path) => `\`${path}\``).join(', ');

/** The quest's fact line about its scope; none without one. */
export function scopeFacts(quest: Pick<Quest, 'scope_paths'>): string[] {
  const scope = scopeOf(quest);
  if (scope.length === 0) return [];
  return [
    `- Scope: ${quoted(scope)} (the files this quest changes; the judge sees every file changed outside it)`,
  ];
}

/** For the sub-quests a session drafts: the territory's hot files, which no scope names; none when it has none. */
export function sharedFacts(territory: Pick<Territory, 'shared_paths'>): string[] {
  const globs = sharedGlobsOf(territory);
  if (globs.length === 0) return [];
  return [
    `- Shared paths of this territory, which every quest may edit and no scope names: ${quoted(globs)}`,
  ];
}

/** The judge's section on the files changed outside the scope (out-of-scope.md); empty when there are none. */
export function outOfScopeBlock(
  quest: Pick<Quest, 'scope_paths'>,
  files: readonly string[],
  t: PromptTemplates,
): string {
  const scope = scopeOf(quest);
  if (scope.length === 0 || files.length === 0) return '';
  return fill(t['out-of-scope'], {
    scope: quoted(scope),
    files: files.map((file) => `- \`${file}\``).join('\n'),
  });
}
