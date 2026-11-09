// The prompt of the session that reminds an assignee of its letter after its session ended (implementation-plan
// §3.14 `handover_check: after_session`, ADR 0010, P1-33): a tribe without a tool gate has no Stop hook to hold the
// session open, so the Steward asks afterwards. The system part stays as built; the user part asks for the letter
// alone, so a fresh session does not take the quest up again.
import { fill } from './templates.ts';
import type { PromptTemplates } from './templates.ts';
import type { BuiltPrompt } from '../runner/types.ts';
import type { Quest } from '@elvaria/domain';

export const letterReminderPrompt = (
  prompt: BuiltPrompt,
  quest: Pick<Quest, 'id' | 'title'>,
  handoverPath: string,
  t: PromptTemplates,
): BuiltPrompt => ({
  system: prompt.system,
  user: fill(t['letter-reminder'], { quest_id: quest.id, title: quest.title, handover_path: handoverPath }),
});
