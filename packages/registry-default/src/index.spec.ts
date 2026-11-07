import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { QuestDraftFileSchema, QuestDraftSchema } from '@elvaria/domain';
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
    const { kinds, classes, rituals, scripts, tags } = registry();
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
    expect(rituals).toHaveLength(11);
    expect(ids(scripts)).toEqual(['link-check', 'run-check', 'count-files', 'diff-stat', 'compare-numbers']);
    expect(ids(tags)).toEqual(['frontend', 'backend', 'db', 'infra', 'i18n', 'e2e', 'docs']);
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

  it('explains every field of a sub-quest draft in the mage prompt (P1-15)', () => {
    const mage = readFileSync(path.join(REGISTRY_ROOT, 'prompts/mage.md'), 'utf8');
    for (const field of Object.keys(QuestDraftSchema.shape)) expect(mage).toContain(`\`${field}\``);
    const example = /```json\n([\s\S]*?)```/.exec(mage)?.[1];
    expect(QuestDraftFileSchema.safeParse(JSON.parse(example ?? '')).success).toBe(true);
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
        'scripts/common.mjs',
        'scripts/link-check.mjs',
        ...registry().classes.map((entry) => entry.prompt_file),
      ]),
    );
    expect(files.filter((file) => file.endsWith('.ts'))).toEqual([]);
    expect(files).toEqual([...files].sort());
  });
});
