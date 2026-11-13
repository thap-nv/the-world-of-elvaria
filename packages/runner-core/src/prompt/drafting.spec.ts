import { CharacterSchema, QUEST_TEMPLATE_SECTIONS, QuestSchema } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { QUEST, REGISTRY, TERRITORY, THORN, classPromptOf } from '../__fixtures__/world.ts';
import { buildPrompt } from './build-prompt.ts';
import { classToolsOf, draftingValuesOf } from './drafting.ts';
import { loadPromptTemplates } from './templates.ts';
import type { AssigneePromptInput } from './build-prompt.ts';

const templates = await loadPromptTemplates();
const tools = (allow: readonly string[], deny: readonly string[] = []) =>
  classToolsOf({ tools: { allow: [...allow], deny: [...deny] } });

const plan = QuestSchema.parse({ ...QUEST, kind: 'plan', class_required: 'mage' });
const mage: AssigneePromptInput = {
  role: 'assignee',
  locale: 'vi',
  decree: null,
  quest: plan,
  character: CharacterSchema.parse({ ...THORN, class: 'mage' }),
  territory: TERRITORY,
  registry: REGISTRY,
  scriptures: [],
  skills: [],
  gazetteer: null,
  class_prompt: classPromptOf('mage'),
  handover_path: 'D:/Elvaria kingdom/quests/q_20261106_7k3m2a/handover.md',
  continuation: null,
};

describe('the drafting rules of the Chancellor and a mage (PS-06)', () => {
  it("shows every heading of the domain's quest template, in its order", () => {
    const { quest_template: text } = draftingValuesOf(templates, {
      language: 'English',
      context_budget_tokens: 1,
    });
    const at = QUEST_TEMPLATE_SECTIONS.map(({ heading }) => text.indexOf(`\n## ${heading}\n`));
    expect(at.every((index) => index > 0)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  it('says what a class can do as toolPolicyOf grants it', () => {
    expect(tools([])).toBe('no tools');
    expect(tools(['Read'])).toBe('reads files; writes no file; no shell');
    expect(tools(['Glob', 'Write'])).toBe('writes files; no shell');
    expect(tools(['Read', 'Bash'])).toBe('reads files; writes no file; shell: any command');
    expect(tools(['Read', 'Bash(git diff:*)'], ['Bash'])).toBe('reads files; writes no file; no shell');
    expect(tools(['Read', 'Write', 'WebFetch'], ['Write'])).toBe(
      'reads files; writes no file; web; no shell',
    );
    expect(tools(['Read', 'Bash(node:*)'])).toBe(
      "reads files; writes no file; shell: `node`, and its territory's check commands",
    );
  });

  it('gives a plan quest the seal of each kind, the tools of each class, the checks, the template and the sizing', async () => {
    const { user } = buildPrompt(mage, templates);
    expect(user).toContain(
      '- Kinds of a sub-quest and the classes each allows: build (knight, dwarf; sealed by default);',
    );
    expect(user).toContain('plan (mage; no seal by default)');
    expect(user).toContain('\n  - `scribe` (Scribe): reads and searches files; writes files; no shell\n');
    expect(user).toContain('- Checks of this territory: lint, unit, e2e');
    expect(user).toContain('# The quest template of the sub-quests');
    expect(user).toContain('peak context would pass 120000 tokens');
    expect(buildPrompt({ ...mage, context_budget_tokens: 200_000 }, templates).user).toContain(
      'peak context would pass 200000 tokens',
    );
    await expect(user).toMatchFileSnapshot('__snapshots__/assignee-plan.txt');
    expect(buildPrompt({ ...mage, quest: QUEST }, templates).user).not.toContain('# The quest template');
  });
});
