// The reminder of the letter after the session (implementation-plan §3.14 `handover_check: after_session`, P1-33):
// the system part as built, a user part that asks for the letter alone.
import { describe, expect, it } from 'vitest';

import { QUEST } from '../__fixtures__/world.ts';
import { letterReminderPrompt } from './letter-reminder.ts';
import { loadPromptTemplates } from './templates.ts';

const templates = await loadPromptTemplates();

describe('letterReminderPrompt', () => {
  it('keeps the system part and asks only for the letter, at its path', () => {
    const prompt = letterReminderPrompt(
      { system: 'You are Thorn.', user: 'The whole quest.' },
      QUEST,
      'C:/kingdom/quests/q/handover.md',
      templates,
    );
    expect(prompt.system).toBe('You are Thorn.');
    expect(prompt.user).toBe(
      `# Your handover letter\n\nYour session on quest ${QUEST.id} «${QUEST.title}» ended, but the handover letter at C:/kingdom/quests/q/handover.md is unchanged since this attempt started. Write it now from its template (Where I am / Done / Not done / Tried and failed / Decisions taken / Next step), about what this attempt did: if you no longer hold that work in mind, read it in the plot (\`git status\`, \`git diff\`). Then finish. Change nothing else.`,
    );
  });
});
