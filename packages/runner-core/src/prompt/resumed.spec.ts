import { describe, expect, it } from 'vitest';

import { resumedPrompt } from './resumed.ts';
import { loadPromptTemplates } from './templates.ts';

const BUILT = {
  system: 'You are Thorn, a knight of Elvaria.',
  user: '# Quest\n\nA long quest description.',
  blocks: [
    { part: 'system', id: 'role', chars: 35 },
    { part: 'user', id: 'quest', chars: 34 },
  ],
} as const;

describe('resumedPrompt', () => {
  it('keeps the system part and sends only the answer to a resumed session', async () => {
    const t = await loadPromptTemplates();
    const prompt = resumedPrompt(BUILT, { question: 'Which branch?', answer: '  The release branch.\n' }, t);
    expect(prompt.system).toBe(BUILT.system);
    expect(prompt.user).toBe(
      [
        '# Going on',
        '',
        'This is the session you were in, resumed: you still have everything you read, did and decided. Carry on with the quest from where you stopped, and keep the handover letter up to date before you end.',
        '',
        "## The owner's answer",
        '',
        'You asked: Which branch?',
        '',
        'The owner answered: The release branch.',
        '',
        'Empty the Question section of the letter: it has been answered.',
      ].join('\n'),
    );
  });

  it('says only that it goes on when no answer comes with it (resumed after mana)', async () => {
    const t = await loadPromptTemplates();
    expect(resumedPrompt(BUILT, null, t).user).toBe(t.resumed);
    expect(t.resumed).not.toContain('<!--');
  });

  it("keeps the system part's blocks and names its own user blocks (PS-01b)", async () => {
    const t = await loadPromptTemplates();
    const answered = resumedPrompt(BUILT, { question: 'Which branch?', answer: 'main' }, t);
    expect(answered.blocks.map(({ part, id }) => `${part}:${id}`)).toEqual([
      'system:role',
      'user:resumed',
      'user:answer',
    ]);
    expect(answered.blocks[1]?.chars).toBe(t.resumed.length);
    expect(resumedPrompt(BUILT, null, t).blocks.map(({ id }) => id)).toEqual(['role', 'resumed']);
  });
});
