// The code in planning (PS-21b): the Chancellor reads the size of the files the owner's words name and, where a
// territory has a code graph, its answer and the impact of those files; the classes say who asks the graph; a plan
// quest's mage reads the impact of its scope, and its judge the sub-quests the graph links. With none of it, every
// prompt reads as before.
import { CharacterSchema, CouncilSchema, QuestSchema, TerritorySchema } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { QUEST, REGISTRY, SABLE, TERRITORY, THORN, classPromptOf } from '../__fixtures__/world.ts';
import { buildPrompt } from './build-prompt.ts';
import { buildChancellorPrompt } from './chancellor.ts';
import { chancellorCodeBlocks, sizeOf } from './chancellor-code.ts';
import { loadPromptTemplates } from './templates.ts';
import type { AssigneePromptInput, VerifierPromptInput } from './build-prompt.ts';
import type { ChancellorContext } from './chancellor.ts';
import type { TerritoryCode } from './chancellor-code.ts';

const templates = await loadPromptTemplates();
const COMMIT = '43566818d835f9acb3c24e8b2acffbfe90133284';
const GRAPHED = TerritorySchema.parse({ ...TERRITORY, code_graph: true });

const chancellor: ChancellorContext = {
  utterance: 'Gộp `draftQuests` với packages/chancellor/src/** và sửa README.md',
  locale: 'vi',
  decree: null,
  class_prompt: classPromptOf('chancellor'),
  territories: [TERRITORY],
  registry: REGISTRY,
  roster: [THORN, SABLE],
  mana: [],
  context_budget_tokens: 120_000,
  council: CouncilSchema.parse({}),
};

const sized = (path: string, bytes: number, lines: number) => ({ path, bytes, lines });

const CODE: TerritoryCode[] = [
  {
    territory: 'dc1-se-team',
    named: [
      {
        words: 'packages/chancellor/src/**',
        files: 14,
        bytes: 98_304,
        largest: [
          sized('packages/chancellor/src/triage-commands.ts', 9_400, 239),
          sized('packages/chancellor/src/screen.ts', 7_200, 196),
          sized('packages/chancellor/src/session.ts', 5_000, 145),
          sized('packages/chancellor/src/commands.ts', 3_900, 108),
          sized('packages/chancellor/src/draft-quests.ts', 3_500, 95),
        ],
      },
      { words: 'README.md', files: 1, bytes: 812, largest: [sized('README.md', 812, 20)] },
    ],
    graph: {
      commit: COMMIT,
      question: 'draftQuests packages/chancellor/src/** README.md',
      files: [
        {
          path: 'packages/chancellor/src/draft-quests.ts',
          names: ['draftQuests()', 'heard()'],
          size: sized('packages/chancellor/src/draft-quests.ts', 3_500, 95),
        },
        {
          path: 'apps/cli/src/say/say.ts',
          names: ['say()', 'send()', 'a()', 'b()', 'c()', 'd()', 'e()', 'f()'],
        },
        ...Array.from({ length: 12 }, (_, index) => ({ path: `apps/cli/src/x${index}.ts`, names: [] })),
      ],
      impact: ['apps/cli/src/run/triage.ts', 'apps/cli/src/say/hearing.ts', 'apps/cli/src/say/say.ts'],
    },
  },
];

describe("the Chancellor's view of the code (PS-21b)", () => {
  it('names the files, their sizes and the graph’s answer in the system part, with the impact (snapshot)', async () => {
    const plain = buildChancellorPrompt(chancellor, templates);
    const { system, user } = buildChancellorPrompt({ ...chancellor, code: CODE }, templates);
    expect(user).toBe(plain.user);
    expect(system.startsWith(plain.system)).toBe(true);
    expect(system).toContain('- `packages/chancellor/src/**`: 14 files, 96.0 KB in all');
    expect(system).toContain('  - `packages/chancellor/src/triage-commands.ts`: 9.2 KB, 239 lines');
    expect(system).toContain('  - … and 9 more files');
    expect(system).toContain('- `README.md`: 1 file, 812 B in all\n  - `README.md`: 812 B, 20 lines');
    expect(system).toContain(
      'Impact: 3 files outside the paths the owner names use code in them: `apps/cli/src/run/triage.ts`',
    );
    expect(system).not.toMatch(/\{\{/);
    await expect(system.slice(plain.system.length)).toMatchFileSnapshot('__snapshots__/chancellor.code.txt');
  });

  it('gives no block for no file and no graph, the size block alone without a graph, and no impact line without named files', () => {
    const plain = buildChancellorPrompt(chancellor, templates);
    expect(buildChancellorPrompt({ ...chancellor, code: [] }, templates)).toEqual(plain);
    expect(chancellorCodeBlocks(undefined, templates)).toEqual(['', '']);
    const named = [{ territory: 'dc1-se-team', named: CODE[0]?.named ?? [] }];
    const [files, graph] = chancellorCodeBlocks(named, templates);
    expect(files).toContain("# The files the owner's words name");
    expect(graph).toBe('');
    const answer = { commit: COMMIT, question: 'nothing', files: [] };
    const [noFiles, alone] = chancellorCodeBlocks(
      [{ territory: 'dc1', named: [], graph: answer }],
      templates,
    );
    expect(noFiles).toBe('');
    expect(alone).toContain('It named no file.');
    expect(alone).not.toContain('Impact');
    const none = chancellorCodeBlocks(
      [{ territory: 'dc1', named: [], graph: { ...answer, impact: [] } }],
      templates,
    );
    expect(none[1]).toContain('Impact: no file outside the paths the owner names uses code in them.');
    const one = chancellorCodeBlocks(
      [{ territory: 'dc1', named: [], graph: { ...answer, impact: ['a.ts'] } }],
      templates,
    );
    expect(one[1]).toContain('Impact: 1 file outside');
    const many = Array.from({ length: 7 }, (_, index) => `f${index}.ts`);
    const seven = chancellorCodeBlocks(
      [{ territory: 'dc1', named: [], graph: { ...answer, impact: many } }],
      templates,
    );
    expect(seven[1]).toContain('`f4.ts` and 2 more files.');
  });

  it('sizes in bytes, kilobytes and megabytes', () => {
    expect(sizeOf(0)).toBe('0 B');
    expect(sizeOf(1_536)).toBe('1.5 KB');
    expect(sizeOf(1_048_576)).toBe('1.0 MB');
  });

  it('says which classes ask the code graph, and how work goes to them, only when a territory has one', () => {
    const plain = buildChancellorPrompt(chancellor, templates).user;
    expect(plain).not.toContain('asks the code graph');
    const { user } = buildChancellorPrompt({ ...chancellor, territories: [GRAPHED] }, templates);
    expect(user).toContain(
      '- `scout` (Scout): reads and searches files; writes files; web; no shell; asks the code graph',
    );
    expect(user).toMatch(/- `bard` \(Bard\): [^\n]*no shell\n/);
    expect(user).toContain('a quest of its own for a class that can explores the code first');
    const folder = TerritorySchema.parse({ ...GRAPHED, vcs: { type: 'none' } });
    expect(buildChancellorPrompt({ ...chancellor, territories: [folder] }, templates).user).toBe(plain);
  });
});

const plan = QuestSchema.parse({
  ...QUEST,
  kind: 'plan',
  class_required: 'mage',
  scope_paths: ['packages/chancellor/**'],
});
const mage: AssigneePromptInput = {
  role: 'assignee',
  locale: 'en',
  decree: null,
  quest: plan,
  character: CharacterSchema.parse({ ...THORN, class: 'mage' }),
  territory: GRAPHED,
  registry: REGISTRY,
  scriptures: [],
  skills: [],
  gazetteer: null,
  class_prompt: classPromptOf('mage'),
  handover_path: 'D:/Elvaria kingdom/quests/q_20261106_7k3m2a/handover.md',
  continuation: null,
};

describe("the mage's impact and classes (PS-21b)", () => {
  it('reads how many files outside its scope use code in it, in the graph block', () => {
    const impact = ['apps/cli/src/run/triage.ts', 'apps/cli/src/say/hearing.ts', 'apps/cli/src/say/say.ts'];
    const { system } = buildPrompt({ ...mage, graph: { commit: COMMIT, impact } }, templates);
    expect(system).toContain(
      "Impact: 3 files outside this quest's scope use code in it: `apps/cli/src/run/triage.ts`, `apps/cli/src/say/hearing.ts`, `apps/cli/src/say/say.ts`.",
    );
    const none = buildPrompt({ ...mage, graph: { commit: COMMIT, impact: [] } }, templates).system;
    expect(none).toContain("Impact: no file outside this quest's scope uses code in it.");
    const one = buildPrompt({ ...mage, graph: { commit: COMMIT, impact: ['a.ts'] } }, templates).system;
    expect(one).toContain('Impact: 1 file outside');
    const six = Array.from({ length: 6 }, (_, index) => `f${index}.ts`);
    const many = buildPrompt({ ...mage, graph: { commit: COMMIT, impact: six } }, templates).system;
    expect(many).toContain('`f4.ts` and 1 more.');
    expect(buildPrompt({ ...mage, graph: { commit: COMMIT } }, templates).system).not.toContain('Impact');
    expect(buildPrompt(mage, templates).system).not.toContain('Impact');
  });

  it('says who asks the graph among the classes of its sub-quests, only on a territory with one', () => {
    expect(buildPrompt(mage, templates).user).toContain(
      '\n  - `scout` (Scout): reads and searches files; writes files; web; no shell; asks the code graph\n',
    );
    expect(buildPrompt({ ...mage, territory: TERRITORY }, templates).user).not.toContain(
      'asks the code graph',
    );
  });
});

describe("the plan judge's warning (PS-21b)", () => {
  const judge: VerifierPromptInput = {
    role: 'verifier',
    locale: 'en',
    decree: null,
    quest: plan,
    character: SABLE,
    territory: GRAPHED,
    registry: REGISTRY,
    scriptures: [],
    gazetteer: null,
    class_prompt: null,
    handover: null,
    diff: null,
    checks: [],
    partial: null,
  };

  it('lists the sub-quests the graph links before the diff, and nothing without them (snapshot)', async () => {
    const plain = buildPrompt(judge, templates).user;
    expect(buildPrompt({ ...judge, plan_links: [] }, templates).user).toBe(plain);
    const links = [
      {
        ref: 'd1',
        other: 'd2',
        from: 'apps/cli/src/say/say.ts',
        to: 'packages/chancellor/src/commands.ts',
        count: 3,
      },
      { ref: 'd3', other: 'd1', from: 'packages/domain/src/a.ts', to: 'apps/cli/src/x.ts', count: 2 },
      {
        ref: 'd2',
        other: 'd3',
        from: 'packages/chancellor/src/b.ts',
        to: 'packages/domain/src/c.ts',
        count: 1,
      },
    ];
    const { user } = buildPrompt({ ...judge, plan_links: links }, templates);
    expect(user).toContain(
      '- `d1` and `d2`: `apps/cli/src/say/say.ts` (d1) uses `packages/chancellor/src/commands.ts` (d2), and 2 more links between them',
    );
    expect(user).toContain('(d3) uses `apps/cli/src/x.ts` (d1), and 1 more link between them');
    expect(user).toContain('(d2) uses `packages/domain/src/c.ts` (d3)\n');
    expect(user.indexOf('# Sub-quests linked through the code')).toBeLessThan(user.indexOf('# Diff'));
    const section = user.slice(user.indexOf('# Sub-quests linked'), user.indexOf('# Diff'));
    await expect(section).toMatchFileSnapshot('__snapshots__/verifier-plan-links.txt');
  });
});
