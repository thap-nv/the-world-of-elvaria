import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  QuestDraftFileSchema,
  QuestDraftSchema,
  ScriptsFileSchema,
  TerritoryIdSchema,
  planIssuesOf,
} from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { loadDefaultRegistry, REGISTRY_ROOT, registryFiles } from './index.ts';
import type { Registry } from '@elvaria/domain';

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
    ]);
    expect(rituals).toHaveLength(12);
    expect(ids(scripts)).toEqual([
      'link-check',
      'run-check',
      'count-files',
      'diff-stat',
      'compare-numbers',
      'todo-scan',
    ]);
    expect(ids(tags)).toEqual(['frontend', 'backend', 'db', 'infra', 'i18n', 'e2e', 'integration', 'docs']);
    // PS-02: the first kind of memo; PS-22 the objection to a second judge; advisory and request come with PS-09 and
    // PS-10 (ADR 0024).
    expect(memos.map(({ id, route }) => [id, route])).toEqual([
      ['proposal', 'chancellor'],
      ['objection', 'judge'],
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
    expect(overridden.map((kind) => [kind.id, kind.ritual_overrides])).toEqual(
      ['build', 'refactor'].map((id) => [
        id,
        [{ tags_any: ['e2e', 'integration'], ritual: 'mutation_check' }],
      ]),
    );
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

  it('has one judge for every kind, and keeps the judge and the monk from producing (ADR 0008, 0011)', () => {
    const { kinds, classes } = registry();
    const verifiers = classes.filter((entry) => entry.is_verifier);
    expect(ids(verifiers)).toEqual(['judge']);
    expect(verifiers[0]?.kinds).toEqual(ids(kinds));
    for (const id of ['judge', 'monk']) {
      expect(classes.find((entry) => entry.id === id)?.tools.deny).toEqual(
        expect.arrayContaining(['Edit', 'Write']),
      );
    }
  });

  it('keeps web access for the scout alone (glossary §6)', () => {
    const withWeb = registry().classes.filter((entry) => entry.tools.allow.includes('WebFetch'));
    expect(ids(withWeb)).toEqual(['scout']);
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
    for (const { drafts } of examples)
      expect(planIssuesOf(drafts, { territories: [territory], context_budget_tokens: 120_000 })).toEqual([]);
    expect(mage).toContain('## Summary');
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
        'scripts/common.mjs',
        'scripts/link-check.mjs',
        ...registry().classes.map((entry) => entry.prompt_file),
      ]),
    );
    expect(files.filter((file) => file.endsWith('.ts'))).toEqual([]);
    expect(files).toEqual([...files].sort());
  });
});
