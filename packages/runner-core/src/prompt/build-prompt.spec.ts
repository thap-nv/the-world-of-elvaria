import { CheckIdSchema, QuestSchema } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import {
  DECREE,
  DIFF,
  JOURNAL,
  LETTER,
  QUEST,
  REGISTRY,
  RETURNED,
  SABLE,
  TERRITORY,
  THORN,
} from '../__fixtures__/world.ts';
import { JOURNAL_TAIL_LINES } from './blocks.ts';
import { buildPrompt } from './build-prompt.ts';
import { loadPromptTemplates } from './templates.ts';
import type { AssigneePromptInput, VerifierPromptInput } from './build-prompt.ts';
import type { BuiltPrompt } from '../runner/types.ts';
import type { Registry } from '@elvaria/domain';

const templates = await loadPromptTemplates();
const HANDOVER_PATH = 'D:/Elvaria kingdom/quests/q_20261106_7k3m2a/handover.md';
const show = ({ system, user }: BuiltPrompt) => `=== system ===\n${system}\n\n=== user ===\n${user}\n`;

const assignee: AssigneePromptInput = {
  role: 'assignee',
  locale: 'vi',
  decree: null,
  quest: QUEST,
  character: THORN,
  territory: TERRITORY,
  registry: REGISTRY,
  scriptures: ['- [L_20261105_a1b2c3] Run `pnpm i18n:check` before submitting any locale change.', '  '],
  skills: [],
  gazetteer: '`apps/api`: NestJS. `apps/web`: React + TanStack Query.',
  handover_path: HANDOVER_PATH,
  continuation: null,
};

const verifier: VerifierPromptInput = {
  role: 'verifier',
  locale: 'vi',
  decree: null,
  quest: QUEST,
  character: SABLE,
  territory: TERRITORY,
  registry: REGISTRY,
  scriptures: [],
  gazetteer: null,
  handover: LETTER,
  diff: DIFF,
  checks: [
    {
      id: CheckIdSchema.parse('lint'),
      pass: true,
      duration_ms: 8200,
      log_path: '.runs/q_20261106_7k3m2a-1/checks/lint.log',
    },
    {
      id: CheckIdSchema.parse('unit'),
      pass: false,
      duration_ms: 41000,
      log_path: '.runs/q_20261106_7k3m2a-1/checks/unit.log',
    },
  ],
};

const continuing: AssigneePromptInput = {
  ...assignee,
  continuation: {
    reason: 'returned',
    verdict: RETURNED,
    handover: LETTER,
    journal: JOURNAL,
    git_log: '1a2b3c4 feat: add pnpm check',
  },
};

describe('buildPrompt snapshots (§10 question 4)', () => {
  it.each([
    ['assignee-new', assignee],
    ['assignee-continuing', continuing],
    ['verifier', verifier],
  ] as const)('%s', async (name, input) => {
    await expect(show(buildPrompt(input, templates))).toMatchFileSnapshot(`__snapshots__/${name}.txt`);
  });

  it.each([
    ['assignee-new', assignee],
    ['assignee-continuing', continuing],
    ['verifier', verifier],
  ] as const)('%s opens its system part with the royal decree', async (name, input) => {
    const plain = buildPrompt(input, templates);
    const decreed = buildPrompt({ ...input, decree: `\n${DECREE}\n` }, templates);
    expect(decreed.user).toBe(plain.user);
    expect(decreed.system.startsWith('# Royal decree')).toBe(true);
    expect(decreed.system.endsWith(plain.system)).toBe(true);
    await expect(decreed.system).toMatchFileSnapshot(`__snapshots__/${name}.decree.txt`);
  });

  it('leaves out a decree that is only blank', () => {
    expect(buildPrompt({ ...assignee, decree: ' \n' }, templates).system).toBe(
      buildPrompt(assignee, templates).system,
    );
  });
});

describe('assignee prompt', () => {
  it('reads only the last journal lines (ADR 0017)', () => {
    const { user } = buildPrompt(continuing, templates);
    expect(user).toContain('src/file-25.ts');
    expect(user).toContain(`src/file-${JOURNAL.length - JOURNAL_TAIL_LINES + 1}.ts`);
    expect(user).not.toContain(`src/file-${JOURNAL.length - JOURNAL_TAIL_LINES}.ts"`);
  });

  it('revives from whatever memory is left, with the owner answer when there is one', () => {
    const answered = QuestSchema.parse({
      ...QUEST,
      blocked: { question: 'Gộp i18n:check?', asked_at: QUEST.updated_at, answer: 'Có, chạy sau cùng.' },
    });
    const { user } = buildPrompt(
      {
        ...assignee,
        quest: answered,
        continuation: { reason: 'revive', handover: null, journal: [], git_log: null },
      },
      templates,
    );
    expect(user).toContain('# Picking up the quest');
    expect(user).toContain('You asked: Gộp i18n:check?');
    expect(user).toContain('The owner answered: Có, chạy sau cùng.');
    expect(user).toContain('None: the earlier session left no letter.');
    expect(user).toContain('No commits yet.');
  });

  it('offers the apprentice only to a class that may start one', () => {
    const scout = { ...THORN, class: REGISTRY.classes.find((entry) => entry.id === 'scout')!.id };
    expect(buildPrompt(assignee, templates).system).toContain('`apprentice`');
    expect(buildPrompt({ ...assignee, character: scout }, templates).system).not.toContain('apprentice');
  });

  it('lists skills when stage 5 chooses some, and names the party', () => {
    const party = QuestSchema.parse({
      ...QUEST,
      party_id: QUEST.id,
      party_role: 'contract',
      contract: 'apps/api/openapi.json',
    });
    const skill = {
      version: 1 as const,
      id: 'react-query',
      title: 'React Query',
      description: 'TanStack Query the way this repo uses it.',
      tags: ['frontend'],
      scope: 'global',
      source: 'user',
      max_tokens: 2000,
      created_at: '2026-11-06T09:00:00+07:00',
    } as unknown as AssigneePromptInput['skills'][number];
    const { user } = buildPrompt({ ...assignee, quest: party, skills: [skill], gazetteer: null }, templates);
    expect(user).toContain('- `react-query`: TanStack Query the way this repo uses it.');
    expect(user).toContain('- Party: contract of q_20261106_7k3m2a, contract `apps/api/openapi.json`');
    expect(user).not.toContain('# Gazetteer');
  });

  it('fails loudly on a class the registry does not have', () => {
    const lost = { ...THORN, class: 'necromancer' } as unknown as typeof THORN;
    expect(() => buildPrompt({ ...assignee, character: lost }, templates)).toThrow(
      'registry has no class "necromancer"',
    );
  });
});

describe('verifier prompt', () => {
  const kinds = (registry: Registry, ritual: string) =>
    registry.kinds.filter((kind) => kind.ritual === ritual).map((kind) => kind.id);

  it.each(['build_review', 'regression_check', 'stress_test'])(
    '%s asks for tests that cover the change (§3.15)',
    (ritual) => {
      const [kind] = kinds(REGISTRY, ritual);
      const quest = QuestSchema.parse({ ...QUEST, kind, class_required: 'knight' });
      const { user } = buildPrompt({ ...verifier, quest }, templates);
      expect(user).toContain('check_tests_cover_change');
      expect(user).toContain(
        'A change of behaviour without one fails the quest with `fail_kind` `incomplete`',
      );
    },
  );

  it('never tells a verifier to edit, and says when no check ran or nothing changed', () => {
    const { system, user } = buildPrompt({ ...verifier, checks: [], diff: ' ', handover: null }, templates);
    expect(system).toContain('you have no Edit or Write');
    expect(user).toContain('No machine check ran for the paths this quest touched.');
    expect(user).toContain('The branch has no changes.');
    expect(user).toContain('The assignee left no letter.');
  });

  it('fails loudly on a step that has no text', () => {
    const registry: Registry = {
      ...REGISTRY,
      rituals: REGISTRY.rituals.map((ritual) =>
        ritual.id === 'build_review' ? { ...ritual, steps: [...ritual.steps, 'dance'] } : ritual,
      ),
    };
    expect(() => buildPrompt({ ...verifier, registry }, templates)).toThrow('has no step "dance"');
  });
});
