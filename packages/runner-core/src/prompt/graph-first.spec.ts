import { describe, expect, it } from 'vitest';

import { QUEST, REGISTRY, TERRITORY, THORN, classPromptOf } from '../__fixtures__/world.ts';
import { buildPrompt } from './build-prompt.ts';
import { loadPromptTemplates } from './templates.ts';
import type { AssigneePromptInput } from './build-prompt.ts';

const templates = await loadPromptTemplates();
const assignee: AssigneePromptInput = {
  role: 'assignee',
  locale: 'en',
  decree: null,
  quest: QUEST,
  character: THORN,
  territory: { ...TERRITORY, code_graph: true },
  registry: REGISTRY,
  scriptures: [],
  skills: [],
  gazetteer: 'Read the package README.',
  class_prompt: classPromptOf('knight'),
  handover_path: 'D:/Elvaria kingdom/quests/q_20261106_7k3m2a/handover.md',
  continuation: null,
};
const graph = { commit: '43566818d835f9acb3c24e8b2acffbfe90133284' };
const instruction =
  "Before you open a second file, run `graphify query '<code names or paths from this quest>'` and start from the files it names; the Code graph section above says how.";

describe('the assignee asks the code graph first', () => {
  it('ends the quest block with a short command and keeps the graph guide in system', async () => {
    const plain = buildPrompt(assignee, templates);
    const prompt = buildPrompt({ ...assignee, graph }, templates);
    expect(prompt.system).toContain('## Code graph');
    expect(prompt.user.length - plain.user.length).toBeLessThanOrEqual(300);
    expect(prompt.user).toBe(plain.user.replace('\n\n# Gazetteer', `\n\n${instruction}\n\n# Gazetteer`));
    expect(prompt.blocks.filter(({ part }) => part === 'user').map(({ id }) => id)).toEqual([
      'quest',
      'gazetteer',
    ]);
    const quest = prompt.blocks.find(({ part, id }) => part === 'user' && id === 'quest');
    expect(prompt.user.slice(0, quest?.chars).endsWith(instruction)).toBe(true);
    await expect(`=== system ===\n${prompt.system}\n\n=== user ===\n${prompt.user}\n`).toMatchFileSnapshot(
      '__snapshots__/assignee-graph.txt',
    );
  });

  it('leaves every character unchanged for a class without graph commands, even with a graph', () => {
    const bard = {
      ...assignee,
      character: { ...THORN, class: REGISTRY.classes.find(({ id }) => id === 'bard')!.id },
    };
    const plain = buildPrompt(bard, templates);
    const prompt = buildPrompt({ ...bard, graph }, templates);
    expect(prompt).toEqual(plain);
    expect(prompt.user).not.toContain('Before you open a second file');
    expect(prompt.system).not.toContain('## Code graph');
  });
});
