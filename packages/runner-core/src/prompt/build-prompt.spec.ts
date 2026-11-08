import { QuestSchema } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import {
  CHECKS,
  DECREE,
  DIFF,
  JOURNAL,
  LETTER,
  PARTIAL,
  QUEST,
  REGISTRY,
  RETURNED,
  SABLE,
  TERRITORY,
  THORN,
  classPromptOf,
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
  class_prompt: classPromptOf('knight'),
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
  class_prompt: classPromptOf('judge'),
  handover: LETTER,
  diff: DIFF,
  partial: null,
  checks: CHECKS,
};

const continuing: AssigneePromptInput = {
  ...assignee,
  continuation: {
    reason: 'returned',
    verdict: RETURNED,
    // The Steward's masked tails of the run's checks (P1-10b), as the judge read them.
    checks: CHECKS,
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

  it('verifier-partial reads on from the last judge', async () => {
    await expect(show(buildPrompt({ ...verifier, partial: PARTIAL }, templates))).toMatchFileSnapshot(
      '__snapshots__/verifier-partial.txt',
    );
  });

  it('leaves out a decree that is only blank', () => {
    expect(buildPrompt({ ...assignee, decree: ' \n' }, templates).system).toBe(
      buildPrompt(assignee, templates).system,
    );
  });
});

describe('the craft of the class (P1-15)', () => {
  it.each([
    ['assignee', assignee, 'Knight'],
    ['verifier', verifier, 'Judge'],
  ] as const)('closes the system part of the %s, without the maintainer note', (_, input, name) => {
    const { system } = buildPrompt(input, templates);
    const craft = system.slice(system.indexOf(`# Your craft: ${name}`));
    expect(craft.length).toBeGreaterThan(200);
    expect(system.endsWith(craft)).toBe(true);
    expect(system).not.toContain('<!--');
  });

  it.each([null, '<!-- only a note -->\n\n'])('is left out when the file is %j', (classPrompt) => {
    const full = buildPrompt(assignee, templates).system;
    const { system } = buildPrompt({ ...assignee, class_prompt: classPrompt }, templates);
    expect(system).toBe(full.slice(0, full.indexOf('\n\n# Your craft')));
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

  it('tells a plan quest where its sub-quests go, and other kinds nothing of the kind', () => {
    const plan = QuestSchema.parse({ ...QUEST, kind: 'plan', class_required: 'mage' });
    const line = '- Deliverable: the sub-quests, written to `subquests.json` at the root of the plot';
    expect(buildPrompt({ ...assignee, quest: plan }, templates).user).toContain(line);
    expect(buildPrompt({ ...verifier, quest: plan }, templates).user).toContain(line);
    expect(buildPrompt(assignee, templates).user).not.toContain('- Deliverable:');
  });

  it('gives a plan quest the words its sub-quests may use (P1-15)', () => {
    const plan = QuestSchema.parse({ ...QUEST, kind: 'plan', class_required: 'mage' });
    const territory = { ...TERRITORY, secrets_allowed: ['npm_token'] };
    const { user } = buildPrompt({ ...assignee, quest: plan, territory }, templates);
    expect(user).toContain('- Kinds of a sub-quest and the classes each allows: build (knight, dwarf);');
    expect(user).toContain('plan (mage)');
    expect(user).toContain('- Tags: frontend, backend, db, infra, i18n, e2e, docs');
    expect(user).toContain('- Secrets this territory allows: npm_token');
    expect(buildPrompt({ ...assignee, quest: plan }, templates).user).toContain(
      '- Secrets this territory allows: none',
    );
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

  it('asks for the failing line of a check before its cause (P1-26, phase-1 report §6 (i))', () => {
    const { system } = buildPrompt(verifier, templates);
    expect(system).toContain(
      'Before you name why a check failed, quote the line of its output that shows the error, verbatim',
    );
    expect(system).toContain('when you cannot see the output, say so instead of guessing');
  });

  it('shows the end of a failing check log under the checks, and no heading for an empty one (P1-25)', () => {
    expect(buildPrompt(verifier, templates).user).toContain(
      '## The end of the log of unit\n\n```text\n FAIL  src/',
    );
    const [lint, unit] = verifier.checks;
    const { user } = buildPrompt({ ...verifier, checks: [lint!, { ...unit!, log_tail: ' \n' }] }, templates);
    expect([user.includes('## The end of the log of'), user.includes('- unit: FAIL (41000 ms')]).toEqual([
      false,
      true,
    ]);
  });

  it("tells a judge that agy's own files in the plot are not the assignee's work (after P1-23)", () => {
    const { system } = buildPrompt(verifier, templates);
    expect(system).toContain(
      "`.agents/` and `GEMINI.md` there are that session's own files: Elvaria removes them when the session ends",
    );
    expect(system).toContain("Unless the diff changes them, they are not the assignee's work");
  });

  it('never tells a verifier to edit, and says when no check ran or nothing changed', () => {
    const { system, user } = buildPrompt({ ...verifier, checks: [], diff: ' ', handover: null }, templates);
    expect(system).toContain('you have no Edit or Write');
    expect(user).toContain('No machine check ran for the paths this quest touched.');
    expect(user).toContain('The branch has no changes.');
    expect(user).toContain('The assignee left no letter.');
  });

  it('says where the last judge stopped only for a partial verdict with progress', () => {
    const { user } = buildPrompt({ ...verifier, partial: PARTIAL }, templates);
    expect(user).toContain('# Where the last judge stopped');
    expect(user).toContain('- Checked until: read_diff: package.json, README.md');
    expect(user).toContain(`(verdict \`${PARTIAL.id}\`, \`partial\`)`);
    const bare = buildPrompt({ ...verifier, partial: { ...PARTIAL, notes: undefined } }, templates).user;
    expect(bare).toContain('- Checked until:');
    const failed = { ...PARTIAL, result: 'fail' as const, progress: undefined };
    expect(buildPrompt({ ...verifier, partial: failed }, templates).user).not.toContain('last judge');
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
