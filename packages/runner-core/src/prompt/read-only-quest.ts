// The block of a read-only quest's session (P2-01d, 383a, W7): what its policy allows, said before its first call, so
// the model writes its findings where the hook lets it instead of learning it from a refusal.
import { REPORT_FILE } from '../policy/read-only.ts';
import { fill } from './templates.ts';
import type { ToolPolicy } from '../policy/tool-policy.ts';
import type { PromptTemplates } from './templates.ts';

/** read-only-quest.md for a session whose writes are fenced to its report (ToolPolicy.writable_paths); else empty. */
export const readOnlyQuestBlock = (policy: Pick<ToolPolicy, 'writable_paths'>, t: PromptTemplates): string =>
  policy.writable_paths === undefined ? '' : fill(t['read-only-quest'], { report: REPORT_FILE });
