// The judge of a visible change (PS-11): the tag `visual` chooses visual_review, whose step compare_screens has the
// judge open the screens the checks captured and compare each with its reference; one it cannot open is `partial`.
// Which images it reads and how they reach it is PS-11b's: here, the ritual's words alone.
import { QuestSchema } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import {
  CHECKS,
  DIFF,
  LETTER,
  QUEST,
  REGISTRY,
  SABLE,
  TERRITORY,
  classPromptOf,
} from '../__fixtures__/world.ts';
import { buildPrompt } from './build-prompt.ts';
import { loadPromptTemplates } from './templates.ts';
import type { VerifierPromptInput } from './build-prompt.ts';
import type { BuiltPrompt } from '../runner/types.ts';

const templates = await loadPromptTemplates();
const show = ({ system, user }: BuiltPrompt) => `=== system ===\n${system}\n\n=== user ===\n${user}\n`;

const SCREENS = 'D:\\Dummy\\Tool - Personal\\my kingdom\\.runs\\q_20261107_a1b2c3-1\\screens';

/** A build quest tagged frontend and visual, judged by visual_review. */
const visual: VerifierPromptInput = {
  role: 'verifier',
  locale: 'vi',
  decree: null,
  quest: QuestSchema.parse({
    ...QUEST,
    kind: 'build',
    class_required: 'knight',
    tags: ['frontend', 'visual'],
  }),
  character: SABLE,
  territory: TERRITORY,
  registry: REGISTRY,
  scriptures: [],
  gazetteer: null,
  class_prompt: classPromptOf('judge'),
  handover: LETTER,
  diff: DIFF,
  partial: null,
  checks: CHECKS,
  // PS-11b: the screens of the review, by the native path the judge's CLI opens; a literal, so the snapshot is one.
  screens: [
    { name: 'home', screen: `${SCREENS}\\home.png`, reference: `${SCREENS}\\home.ref.png` },
    { name: 'settings', screen: `${SCREENS}\\settings.png`, diff: `${SCREENS}\\settings.diff.png` },
  ],
};

describe('the verifier prompt of a visible change', () => {
  it('verifier-visual compares the screens with their references', async () => {
    await expect(show(buildPrompt(visual, templates))).toMatchFileSnapshot(
      '__snapshots__/verifier-visual.txt',
    );
  });

  it('names the ritual and has the judge compare each screen, and say when it cannot open one', () => {
    const { system, user } = buildPrompt(visual, templates);
    expect(user).toContain('The painter holds up the portrait (`visual_review`)');
    expect(user).toContain('. compare_screens\n');
    expect(user).toContain("A difference the quest's description does not ask for fails the quest");
    expect(user).toContain('When you cannot open an image, say so, name it, and give `partial`');
    expect(system).toContain('you have no Edit or Write');
  });

  it('lists every screen with its reference and difference, by the path the CLI opens, never the image (PS-11b)', () => {
    const { user } = buildPrompt(visual, templates);
    expect(user).toContain('# Screens');
    expect(user).toContain(
      `- \`home\`\n  - screen: \`${SCREENS}\\home.png\`\n  - reference: \`${SCREENS}\\home.ref.png\``,
    );
    expect(user).toContain(`  - difference: \`${SCREENS}\\settings.diff.png\``);
    // The screens follow the machine checks that captured them.
    expect(user.indexOf('# Screens')).toBeGreaterThan(user.indexOf('# Machine checks'));
    const none = buildPrompt({ ...visual, screens: [] }, templates).user;
    expect(none).not.toContain('# Screens');
    expect(buildPrompt({ ...visual, screens: undefined as never }, templates).user).toBe(none);
  });

  it('keeps mutation_check for a quest both e2e and visual, and build_review without the tag', () => {
    const both = QuestSchema.parse({ ...visual.quest, tags: ['e2e', 'visual'] });
    expect(buildPrompt({ ...visual, quest: both }, templates).user).toContain('(`mutation_check`)');
    const plain = QuestSchema.parse({ ...visual.quest, tags: ['frontend'] });
    const { user } = buildPrompt({ ...visual, quest: plain }, templates);
    expect(user).toContain('(`build_review`)');
    expect(user).not.toContain('compare_screens');
  });
});
