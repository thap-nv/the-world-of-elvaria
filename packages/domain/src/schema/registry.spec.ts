import { describe, expect, it } from 'vitest';

import classExamples from '../../examples/class.json' with { type: 'json' };
import kindExamples from '../../examples/kind.json' with { type: 'json' };
import ritualExamples from '../../examples/ritual.json' with { type: 'json' };
import scriptExamples from '../../examples/script.json' with { type: 'json' };
import tagExamples from '../../examples/tag.json' with { type: 'json' };
import * as domain from '../index.ts';
import { parseRegistry, REGISTRY_FILES } from './registry.ts';
import {
  ClassesFileSchema,
  KindsFileSchema,
  RitualsFileSchema,
  ScriptsFileSchema,
  TagsFileSchema,
} from './registry-entries.ts';
import type { RegistryIssue } from './registry.ts';

const names = (id: string) => ({ name_vi: id, name_en: id });
const kind = (id: string, ritual: string, classes: string[]) => ({
  id,
  ...names(id),
  deliverable_type: 'branch',
  ritual,
  checks_default: ['test'],
  seal_default: true,
  classes_allowed: classes,
});
const cls = (id: string, kinds: string[], role: { is_verifier?: boolean; is_monk?: boolean } = {}) => ({
  id,
  ...names(id),
  kinds,
  is_verifier: role.is_verifier ?? false,
  is_monk: role.is_monk ?? false,
  default_tribe: 'claude',
  default_model: 'claude-sonnet-5-5',
  tools: { allow: ['Read'], deny: [] },
  prompt_file: `prompts/${id}.md`,
});
const ritual = (id: string, steps = ['run_checks', 'judge', 'write_verdict']) => ({
  id,
  ...names(id),
  steps,
  pass_rule: 'all_checks_and_agent',
  max_seconds: 600,
});

/** A small registry that satisfies every cross-file rule. */
const consistent = () => ({
  kinds: {
    version: 1,
    kinds: [kind('build', 'build_review', ['knight']), kind('research', 'source_check', ['scout'])],
  },
  classes: {
    version: 1,
    classes: [
      cls('knight', ['build']),
      cls('scout', ['research']),
      cls('judge', ['build', 'research'], { is_verifier: true }),
      cls('monk', [], { is_monk: true }),
    ],
  },
  rituals: { version: 1, rituals: [ritual('build_review'), ritual('source_check')] },
  scripts: {
    version: 1,
    scripts: [
      {
        id: 'link-check',
        ...names('link-check'),
        description: 'Checks links.',
        entry: 'scripts/link-check.mjs',
        params_schema: { type: 'object' },
        kinds: ['research'],
        produces: 'units',
        timeout_minutes: 10,
      },
    ],
  },
  tags: { version: 1, tags: [{ id: 'docs', name_vi: 'Tài liệu', name_en: 'Documentation' }] },
});
type Files = ReturnType<typeof consistent>;

/** Issues of the registry after `change`, as `file code path` lines. */
function issuesAfter(change: (files: Files) => void): string[] {
  const files = consistent();
  change(files);
  const result = parseRegistry(files);
  const line = (issue: RegistryIssue) => `${issue.file} ${issue.code} ${issue.path.join('.')}`;
  return result.ok ? [] : result.error.map(line);
}

describe('registry entry schemas', () => {
  it('accept the examples of the v1 contracts', () => {
    expect(KindsFileSchema.parse(kindExamples[0])).toEqual(kindExamples[0]);
    expect(ClassesFileSchema.parse(classExamples[0])).toEqual(classExamples[0]);
    expect(RitualsFileSchema.parse(ritualExamples[0])).toEqual(ritualExamples[0]);
    expect(ScriptsFileSchema.parse(scriptExamples[0])).toEqual(scriptExamples[0]);
    expect(TagsFileSchema.parse(tagExamples[0])).toEqual(tagExamples[0]);
  });
});

describe('parseRegistry', () => {
  it('returns the entries of a consistent registry', () => {
    const result = parseRegistry(consistent());
    expect(result.ok && result.value.classes.map((entry) => entry.id)).toEqual([
      'knight',
      'scout',
      'judge',
      'monk',
    ]);
  });

  it.each(REGISTRY_FILES)('reports a %s file that fails its schema, before any cross-file rule', (file) => {
    expect(issuesAfter((files) => Object.assign(files, { [file]: { version: 2 } }))).toContain(
      `${file} invalid version`,
    );
  });

  it("takes a script's follow-up of a known kind and a class it allows", () => {
    const followUp = { kind: 'research', class: 'scout' };
    expect(issuesAfter((f) => Object.assign(f.scripts.scripts[0]!, { follow_up: followUp }))).toEqual([]);
  });

  it('keeps array indexes as numbers in the issue path', () => {
    const files = consistent();
    files.kinds.kinds[1] = { ...kind('research', 'source_check', ['scout']), ritual: 'Bad' };
    const result = parseRegistry(files);
    expect(!result.ok && result.error[0]?.path).toEqual(['kinds', 1, 'ritual']);
  });

  it.each([
    ['a repeated id', (f: Files) => f.tags.tags.push(f.tags.tags[0]!), 'tags duplicate_id tags.1.id'],
    [
      'a kind with an unknown ritual',
      (f: Files) => (f.kinds.kinds[0]!.ritual = 'nope'),
      'kinds unknown_ritual kinds.0.ritual',
    ],
    [
      'a kind allowing an unknown class',
      (f: Files) => f.kinds.kinds[0]!.classes_allowed.push('ghost'),
      'kinds unknown_class kinds.0.classes_allowed.1',
    ],
    [
      'a kind a verifier may take',
      (f: Files) => f.kinds.kinds[0]!.classes_allowed.push('judge'),
      'kinds verifier_takes_work kinds.0.classes_allowed.1',
    ],
    [
      'a kind allowing a class that does not list it',
      (f: Files) => f.kinds.kinds[0]!.classes_allowed.push('scout'),
      'kinds class_kind_mismatch kinds.0.classes_allowed.1',
    ],
    [
      'a kind allowing the monk',
      (f: Files) => f.kinds.kinds[1]!.classes_allowed.push('monk'),
      'kinds class_kind_mismatch kinds.1.classes_allowed.1',
    ],
    [
      'a class listing a kind that does not allow it',
      (f: Files) => f.classes.classes[0]!.kinds.push('research'),
      'classes class_kind_mismatch classes.0.kinds.1',
    ],
    [
      'a class listing an unknown kind',
      (f: Files) => f.classes.classes[0]!.kinds.push('dance'),
      'classes unknown_kind classes.0.kinds.1',
    ],
    [
      'a class both verifier and monk',
      (f: Files) => (f.classes.classes[2]!.is_monk = true),
      'classes verifier_and_monk classes.2.is_monk',
    ],
    [
      'a ritual step no prompt knows',
      (f: Files) => f.rituals.rituals[0]!.steps.push('dance'),
      'rituals unknown_step rituals.0.steps.3',
    ],
    [
      'a script entry not named after its id',
      (f: Files) => (f.scripts.scripts[0]!.entry = 'scripts/other.mjs'),
      'scripts entry_mismatch scripts.0.entry',
    ],
    [
      'a script serving an unknown kind',
      (f: Files) => f.scripts.scripts[0]!.kinds.push('dance'),
      'scripts unknown_kind scripts.0.kinds.1',
    ],
    [
      'a script whose follow-up is an unknown kind',
      (f: Files) => Object.assign(f.scripts.scripts[0]!, { follow_up: { kind: 'dance', class: 'scribe' } }),
      'scripts unknown_kind scripts.0.follow_up.kind',
    ],
    [
      'a script whose follow-up class its kind does not allow',
      (f: Files) =>
        Object.assign(f.scripts.scripts[0]!, { follow_up: { kind: 'research', class: 'knight' } }),
      'scripts class_kind_mismatch scripts.0.follow_up.class',
    ],
  ])('rejects %s', (_, change, expected) => {
    expect(issuesAfter(change)).toEqual([expected]);
  });
});

describe('the package entry point', () => {
  it('exports the core and the schemas', () => {
    expect(domain.parseRegistry).toBe(parseRegistry);
    expect(typeof domain.KingdomSchema.parse).toBe('function');
    expect(domain.RITUAL_STEPS).toContain('write_verdict');
  });
});
