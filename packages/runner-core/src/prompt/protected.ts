// What the judge's prompt says of the protected paths a quest's work changed (implementation-plan §3.16.4, ADR 0026,
// the owner's settlement of PS-04 (c)): the files of `quest.protected_changes`, for the judge to read line by line,
// as the files changed outside the scope (scope.ts, PS-05). A quest that touched none reads as before.
import { fill } from './templates.ts';
import type { PromptTemplates } from './templates.ts';
import type { Quest } from '@elvaria/domain';

/** The judge's section on the protected paths changed (protected-changes.md); empty when there are none. */
export function protectedChangesBlock(quest: Pick<Quest, 'protected_changes'>, t: PromptTemplates): string {
  const files = quest.protected_changes ?? [];
  if (files.length === 0) return '';
  return fill(t['protected-changes'], { files: files.map((file) => `- \`${file}\``).join('\n') });
}
