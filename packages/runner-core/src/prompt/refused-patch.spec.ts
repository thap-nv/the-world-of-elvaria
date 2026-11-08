// The session after a refused patch (P1-31): the Steward did not apply the `elvaria.patch` of the run before
// (laws.patch_paths, P1-28), the quest went to the infirmary, and the owner sent it back. Without the reason the
// fresh session reads only its letter, which says the patch was written, and hands it in again as it was.
import { describe, expect, it } from 'vitest';

import {
  JOURNAL,
  LETTER,
  QUEST,
  REGISTRY,
  RETURNED,
  TERRITORY,
  THORN,
  classPromptOf,
} from '../__fixtures__/world.ts';
import { buildPrompt } from './build-prompt.ts';
import { loadPromptTemplates } from './templates.ts';
import type { AssigneePromptInput } from './build-prompt.ts';
import type { BuiltPrompt } from '../runner/types.ts';

const templates = await loadPromptTemplates();
const show = ({ system, user }: BuiltPrompt) => `=== system ===\n${system}\n\n=== user ===\n${user}\n`;

/** The Steward's reason for a patch it did not apply, as the quest's infirmary line keeps it (P1-28). */
const REFUSED_PATCH = 'it touches src/app.ts, outside laws.patch_paths (.husky/**)';
const HEADING = '## The patch that was not applied';
const WHY = `The Steward said:\n\n\`\`\`text\n${REFUSED_PATCH}\n\`\`\``;

const assignee: AssigneePromptInput = {
  role: 'assignee',
  locale: 'vi',
  decree: null,
  quest: QUEST,
  character: THORN,
  territory: TERRITORY,
  registry: REGISTRY,
  scriptures: ['- [L_20261105_a1b2c3] Run `pnpm i18n:check` before submitting any locale change.'],
  skills: [],
  gazetteer: '`apps/api`: NestJS. `apps/web`: React + TanStack Query.',
  class_prompt: classPromptOf('knight'),
  handover_path: 'D:/Elvaria kingdom/quests/q_20261106_7k3m2a/handover.md',
  continuation: null,
};

const memory = { handover: LETTER, journal: JOURNAL, git_log: null };

/** The run before this one wrote a patch the Steward refused; the owner sent the quest back from the infirmary. */
const revived: AssigneePromptInput = {
  ...assignee,
  continuation: { reason: 'revive', refused_patch: REFUSED_PATCH, ...memory },
};

describe('the prompt after a refused patch (P1-31)', () => {
  it('assignee-revived', async () => {
    await expect(show(buildPrompt(revived, templates))).toMatchFileSnapshot(
      '__snapshots__/assignee-revived.txt',
    );
  });

  it('says why after the revival, and before the letter that says the patch was written', () => {
    const { user } = buildPrompt(revived, templates);
    expect(user).toContain('# Picking up the quest\n\nAn earlier session');
    expect(user).toContain('The last session wrote `elvaria.patch`, and the Steward did not apply it');
    expect(user).toContain(WHY);
    expect(user.indexOf('# Picking up the quest')).toBeLessThan(user.indexOf(HEADING));
    expect(user.indexOf(HEADING)).toBeLessThan(user.indexOf('## Handover letter so far'));
  });

  it('says why after a return too, and nothing of the kind when no patch was refused', () => {
    const returned = {
      reason: 'returned',
      verdict: RETURNED,
      refused_patch: REFUSED_PATCH,
      ...memory,
    } as const;
    expect(buildPrompt({ ...assignee, continuation: returned }, templates).user).toContain(WHY);
    const plain = { reason: 'revive', ...memory } as const;
    expect(buildPrompt({ ...assignee, continuation: plain }, templates).user).not.toContain(HEADING);
    expect(buildPrompt(assignee, templates).user).not.toContain(HEADING);
  });
});
