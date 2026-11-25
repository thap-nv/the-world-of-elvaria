import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  PLAN_FILE_SECTIONS,
  QuestDraftFileSchema,
  QuestDraftSchema,
  ScriptsFileSchema,
  TerritoryIdSchema,
  judgedByEye,
  planIssuesOf,
  ritualOf,
} from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { loadDefaultRegistry, REGISTRY_ROOT, registryFiles } from './index.ts';
import type { Quest, Registry } from '@elvaria/domain';

function registry(): Registry {
  const result = loadDefaultRegistry();
  if (!result.ok)
    throw new Error(result.error.map((issue) => `${issue.code} ${issue.path.join('.')}`).join('\n'));
  return result.value;
}

const ids = (entries: readonly { id: string }[]) => entries.map((entry) => entry.id);

describe('the default registry', () => {
  it('passes the registry schemas and every cross-file rule', () => {
    expect(loadDefaultRegistry().ok).toBe(true);
  });

  it('holds the ids the plan and glossary fix (implementation-plan §2.3, glossary §5, §6, §10)', () => {
    const { kinds, classes, rituals, scripts, tags, memos } = registry();
    expect(ids(kinds)).toEqual([
      'build',
      'research',
      'fix',
      'refactor',
      'document',
      'publish',
      'analyze',
      'plan',
      'integrate',
      'negotiate',
      'batch',
    ]);
    expect(ids(classes)).toEqual([
      'chancellor',
      'mage',
      'knight',
      'dwarf',
      'scout',
      'scribe',
      'bard',
      'astrologer',
      'envoy',
      'judge',
      'monk',
      'healer',
    ]);
    expect(rituals).toHaveLength(13);
    expect(ids(scripts)).toEqual([
      'link-check',
      'run-check',
      'count-files',
      'diff-stat',
      'compare-numbers',
      'todo-scan',
    ]);
    expect(ids(tags)).toEqual([
      'frontend',
      'backend',
      'db',
      'infra',
      'i18n',
      'e2e',
      'integration',
      'visual',
      'docs',
    ]);
    // PS-02: the first kind of memo; PS-22 the objection to a second judge; PS-22b the amendment; PS-09c the advisory;
    // request comes with PS-10 (ADR 0024).
    expect(memos.map(({ id, route }) => [id, route])).toEqual([
      ['proposal', 'chancellor'],
      ['objection', 'judge'],
      // PS-22b: the amendment to the quest's author.
      ['amendment', 'author'],
      // PS-09c: the Steward's advisory to the quests at work whose scope meets the files a quest changed.
      ['advisory', 'quests'],
    ]);
  });

  it('names exactly the default scripts in the scripts.json schema description', () => {
    // PR #48 added todo-scan to the catalog but not to this description, and neither the
    // quest's judge nor `pnpm check` noticed (P1-16 report §8); this keeps the two in step.
    const description = ScriptsFileSchema.meta()?.description ?? '';
    const listed = /Default catalog: ([^.]+)\./u.exec(description)?.[1]?.split(', ');
    expect(listed).toEqual(ids(registry().scripts));
  });

  it('gives every kind its own ritual, as listed in implementation-plan §2.3', () => {
    const ritualOf = Object.fromEntries(registry().kinds.map((kind) => [kind.id, kind.ritual]));
    expect(ritualOf).toEqual({
      build: 'build_review',
      research: 'source_check',
      fix: 'regression_check',
      refactor: 'stress_test',
      document: 'editorial_review',
      publish: 'audience_review',
      analyze: 'recompute',
      plan: 'council_review',
      integrate: 'stability_check',
      negotiate: 'sign_off',
      batch: 'unit_tally',
    });
  });

  it('judges tests as the product with Thả quái thử thành, in a scratch plot (§3.15, ADR 0022)', () => {
    const { kinds, rituals } = registry();
    const overridden = kinds.filter((kind) => (kind.ritual_overrides ?? []).length > 0);
    // PS-11: the screens come after, so a quest both e2e and visual keeps mutation_check.
    const visual = { tags_any: ['visual'], ritual: 'visual_review' };
    expect(overridden.map((kind) => [kind.id, kind.ritual_overrides])).toEqual([
      ['build', [{ tags_any: ['e2e', 'integration'], ritual: 'mutation_check' }, visual]],
      ['fix', [visual]],
      ['refactor', [{ tags_any: ['e2e', 'integration'], ritual: 'mutation_check' }, visual]],
    ]);
    const trial = rituals.find((ritual) => ritual.id === 'mutation_check');
    expect(trial).toMatchObject({
      name_vi: 'Thả quái thử thành',
      scratch_plot: true,
      flaky_follow_up: { kind: 'fix', class: 'knight' },
    });
    expect(trial?.steps).toEqual(
      expect.arrayContaining(['rerun_clean', 'break_and_expect_red', 'flake_check', 'coverage_not_lower']),
    );
    expect(rituals.filter((ritual) => ritual.scratch_plot === true)).toHaveLength(1);
  });

  it('judges a visible change by eye with visual_review, chosen by the tag visual alone (PS-11)', () => {
    const defaults = registry();
    const quest = (kind: string, ...tags: string[]) =>
      ({ kind, tags, party_role: undefined }) as unknown as Pick<Quest, 'kind' | 'tags' | 'party_role'>;
    const eye = defaults.rituals.find((ritual) => ritual.id === 'visual_review');
    expect(eye).toMatchObject({ pass_rule: 'all_checks_and_agent', max_seconds: 1800, vision: true });
    expect(eye?.steps).toEqual([
      'run_checks',
      'read_handover',
      'read_diff',
      'compare_screens',
      'check_tests_cover_change',
      'judge',
      'write_verdict',
    ]);
    expect(defaults.rituals.filter((ritual) => ritual.vision === true)).toEqual([eye]);
    for (const kind of ['build', 'fix', 'refactor']) {
      expect(ritualOf(quest(kind, 'frontend', 'visual'), defaults)?.id).toBe('visual_review');
      expect(judgedByEye(quest(kind, 'visual'), defaults)).toBe(true);
    }
    expect(ritualOf(quest('build', 'e2e', 'visual'), defaults)?.id).toBe('mutation_check');
    expect(ritualOf(quest('fix', 'e2e'), defaults)?.id).toBe('regression_check');
    // Not the frontend tag: frontend work nobody sees keeps its kind's ritual, and so does a kind without the override.
    expect(ritualOf(quest('build', 'frontend'), defaults)?.id).toBe('build_review');
    expect(judgedByEye(quest('document', 'visual'), defaults)).toBe(false);
    const acceptance = { ...quest('build', 'visual'), party_role: 'acceptance' as const };
    expect(ritualOf(acceptance, defaults)?.id).toBe('build_review');
  });

  // (156)(b): check_sources has the judge open the sources a work cites, and a judge without the web could not (run
  // (130), gap 7). It still writes nothing (the test above), so a page cannot make it change the work (§9).
  it('keeps web access for the scout among those who produce, and gives it to the judge to open sources (glossary §6)', () => {
    const { classes } = registry();
    for (const tool of ['WebFetch', 'WebSearch']) {
      const withWeb = classes.filter((entry) => entry.tools.allow.includes(tool));
      expect(ids(withWeb)).toEqual(['scout', 'judge']);
    }
    // And the scout cites code so that the judge opens the very lines it read.
    const scout = readFileSync(path.join(REGISTRY_ROOT, 'prompts/scout.md'), 'utf8');
    expect(scout).toContain('a URL pinned to a commit, with the lines');
  });

  // (397) a refactor quest keeps file history only with `git mv` and must leave layout, dup and knip green; (402)
  // `pnpm --filter X test` runs one package's tests and did not match `pnpm test:*`. AH-05's dwarf lacked all of them.
  it('lets the dwarf move files, run the layout gates and test one package', () => {
    const allowOf = (id: string) => registry().classes.find((entry) => entry.id === id)?.tools.allow;
    const dwarfTools = ['Bash(git mv:*)', 'Bash(pnpm layout:*)', 'Bash(pnpm dup:*)', 'Bash(pnpm knip:*)'];
    expect(allowOf('dwarf')).toEqual(expect.arrayContaining([...dwarfTools, 'Bash(pnpm --filter:*)']));
    expect(allowOf('knight')).toContain('Bash(pnpm --filter:*)');
  });

  // (512) a knight adding a workspace dependency could not lint before the Steward's setup at commit linked it: it may
  // run exactly the frozen offline install; adding packages stays the dwarf's craft.
  it('lets the knight run only the frozen offline install', () => {
    const knight = registry().classes.find((entry) => entry.id === 'knight')?.tools.allow ?? [];
    expect(knight).toContain('Bash(pnpm install --frozen-lockfile --prefer-offline)');
    expect(knight.filter((rule) => /^Bash\(pnpm (install|add)/.test(rule))).toHaveLength(1);
  });

  it('ships the prompt of every class, opened by a note for the maintainer (P1-15)', () => {
    for (const entry of registry().classes) {
      expect(entry.prompt_file).toBe(`prompts/${entry.id}.md`);
      const text = readFileSync(path.join(REGISTRY_ROOT, entry.prompt_file), 'utf8');
      expect(
        text.startsWith(`<!-- Class prompt of the ${entry.id === 'chancellor' ? 'Chancellor' : entry.id}`),
      ).toBe(true);
      expect(text.replace(/<!--[\s\S]*?-->/, '').trim().length).toBeGreaterThan(200);
    }
  });

  it('explains every field of a sub-quest draft in the mage prompt, with a plain and a party example (P1-15, P1-18)', () => {
    const mage = readFileSync(path.join(REGISTRY_ROOT, 'prompts/mage.md'), 'utf8');
    for (const field of Object.keys(QuestDraftSchema.shape)) expect(mage).toContain(`\`${field}\``);
    const examples = [...mage.matchAll(/```json\n([\s\S]*?)```/g)].map(([, json]) =>
      QuestDraftFileSchema.parse(JSON.parse(json ?? '')),
    );
    expect(examples.map(({ drafts }) => drafts.map((draft) => draft.party_role ?? null))).toEqual([
      [null, null],
      ['part', 'part'],
    ]);
    // PS-06: the examples teach what the subquests check holds a plan to: scopes, the template, the peak context.
    const territory = { id: TerritoryIdSchema.parse('dc1-se-team'), checks: [] };
    for (const { drafts } of examples) {
      // fix/council-run-gaps (c): a kingdom with a character of every class the example names.
      const characters = drafts.flatMap(({ class_required: cls }) =>
        cls === undefined ? [] : [{ class: cls, status: 'idle' as const }],
      );
      const context = { territories: [territory], context_budget_tokens: 120_000, characters };
      expect(planIssuesOf(drafts, context)).toEqual([]);
    }
    expect(mage).toContain('## Summary');
  });

  // PS-06b (c): the subquests check holds the plan file to PLAN_FILE_SECTIONS; the mage hears it before a return.
  it('gives the plan file the headings the subquests check holds it to, and says the machine checks them', () => {
    const mage = readFileSync(path.join(REGISTRY_ROOT, 'prompts/mage.md'), 'utf8').replace(
      /<!--[\s\S]*?-->/,
      '',
    );
    const template = /```markdown\n([\s\S]*?)```/.exec(mage)?.[1] ?? '';
    const headings = [...template.matchAll(/^## (.+)$/gm)].map(([, heading]) => heading);
    expect(headings).toEqual(PLAN_FILE_SECTIONS.map(({ heading }) => heading));
    expect(mage).toContain(
      'a machine check reads the `plans/*.md` files this quest changed and fails the quest unless one of them has all six headings above, each with text under it',
    );
  });

  // P1-45, P1-37 (g): a part told to run `pnpm test:integration`, an exclusive check of dc1, was refused.
  it('sends a part only to the check commands of its shell, and leaves locked checks to the merge quest', () => {
    const mage = readFileSync(path.join(REGISTRY_ROOT, 'prompts/mage.md'), 'utf8').replace(
      /<!--[\s\S]*?-->/,
      '',
    );
    expect(mage).toContain('Send a part only to commands its session has');
    expect(mage).toContain('leaves running them to the merge quest; it never tells the part to run them');
  });

  it('ships every catalog script with its file and its test (ADR 0016)', () => {
    for (const script of registry().scripts) {
      expect(existsSync(path.join(REGISTRY_ROOT, script.entry))).toBe(true);
      expect(existsSync(path.join(REGISTRY_ROOT, script.entry.replace(/\.mjs$/, '.spec.ts')))).toBe(true);
    }
  });
});

describe('registryFiles', () => {
  it('lists the data files and the scripts to copy, never their tests or helpers', () => {
    const files = registryFiles();
    expect(files).toEqual(
      expect.arrayContaining([
        'kinds.json',
        'tags.json',
        'memos.json',
        'disruptions.json',
        'scripts/common.mjs',
        'scripts/link-check.mjs',
        ...registry().classes.map((entry) => entry.prompt_file),
      ]),
    );
    expect(files.filter((file) => file.endsWith('.ts'))).toEqual([]);
    expect(files).toEqual([...files].sort());
  });

  it('lists the same files of the package in another folder, as a build of another commit holds it', () => {
    expect(registryFiles(path.join(REGISTRY_ROOT, 'prompts'))).toEqual(
      ['classes', 'disruptions', 'kinds', 'memos', 'rituals', 'scripts', 'tags'].map(
        (file) => `${file}.json`,
      ),
    );
    expect(registryFiles(REGISTRY_ROOT)).toEqual(registryFiles());
  });
});
