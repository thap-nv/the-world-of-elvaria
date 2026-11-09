// The five registry files load together: each passes its own schema, then the cross-file rules that the v1
// schemas leave to "the registry loader" ($comment of kind, class and ritual .schema.json) run here, so a hand
// edit of registry/*.json fails when the kingdom loads instead of in the middle of a quest (ADR 0016).
import { RITUAL_STEPS } from '../constants.ts';
import { err, ok } from '../core/result.ts';
import {
  ClassesFileSchema,
  KindsFileSchema,
  RitualsFileSchema,
  ScriptsFileSchema,
  TagsFileSchema,
} from './registry-entries.ts';
import type { Result } from '../core/result.ts';
import type { CatalogScript, CharacterClass, Kind, Ritual, Tag } from './registry-entries.ts';
import type { z } from 'zod';

export const REGISTRY_FILES = ['kinds', 'classes', 'rituals', 'scripts', 'tags'] as const;
export type RegistryFile = (typeof REGISTRY_FILES)[number];

export interface Registry {
  readonly kinds: readonly Kind[];
  readonly classes: readonly CharacterClass[];
  readonly rituals: readonly Ritual[];
  readonly scripts: readonly CatalogScript[];
  readonly tags: readonly Tag[];
}

/** Stable codes, so the CLI can translate an issue through i18n; `message` is the English text for logs. */
export type RegistryIssueCode =
  | 'invalid'
  | 'duplicate_id'
  | 'unknown_ritual'
  | 'unknown_class'
  | 'unknown_kind'
  | 'unknown_step'
  | 'unknown_tag'
  | 'verifier_and_monk'
  | 'verifier_takes_work'
  | 'class_kind_mismatch'
  | 'entry_mismatch';

export interface RegistryIssue {
  readonly file: RegistryFile;
  /** From the root of the file, e.g. `['kinds', 3, 'ritual']`. */
  readonly path: readonly (string | number)[];
  readonly code: RegistryIssueCode;
  readonly message: string;
}

type Path = RegistryIssue['path'];
const issue = (file: RegistryFile, path: Path, code: RegistryIssueCode, message: string): RegistryIssue => ({
  file,
  path,
  code,
  message,
});

/** Validates the five parsed JSON files of `registry/` and returns them as one Registry. */
export function parseRegistry(
  files: Readonly<Record<RegistryFile, unknown>>,
): Result<Registry, RegistryIssue[]> {
  const invalid: RegistryIssue[] = [];
  const take = <T>(file: RegistryFile, schema: z.ZodType<T>): T | undefined => {
    const parsed = schema.safeParse(files[file]);
    if (parsed.success) return parsed.data;
    for (const zodIssue of parsed.error.issues) {
      const path = zodIssue.path.map((key) => (typeof key === 'number' ? key : String(key)));
      invalid.push(issue(file, path, 'invalid', zodIssue.message));
    }
    return undefined;
  };
  const kinds = take('kinds', KindsFileSchema);
  const classes = take('classes', ClassesFileSchema);
  const rituals = take('rituals', RitualsFileSchema);
  const scripts = take('scripts', ScriptsFileSchema);
  const tags = take('tags', TagsFileSchema);
  // Cross-file rules need every file; report the schema errors of all files first.
  if (!kinds || !classes || !rituals || !scripts || !tags) return err(invalid);
  const registry: Registry = {
    kinds: kinds.kinds,
    classes: classes.classes,
    rituals: rituals.rituals,
    scripts: scripts.scripts,
    tags: tags.tags,
  };
  const issues = checkRegistry(registry);
  return issues.length === 0 ? ok(registry) : err(issues);
}

/** Cross-file rules of a registry whose files each passed their schema. */
export function checkRegistry(registry: Registry): RegistryIssue[] {
  return [
    ...duplicateIds(registry),
    ...kindRules(registry),
    ...classRules(registry),
    ...ritualRules(registry),
    ...scriptRules(registry),
  ];
}

function duplicateIds(registry: Registry): RegistryIssue[] {
  return REGISTRY_FILES.flatMap((file) => {
    const seen = new Set<string>();
    return registry[file].flatMap((entry, index) => {
      const repeated = seen.has(entry.id);
      seen.add(entry.id);
      return repeated ? [issue(file, [file, index, 'id'], 'duplicate_id', `duplicate id "${entry.id}"`)] : [];
    });
  });
}

/** Each override names a known ritual and known tags (ADR 0022): a typo would quietly keep the kind's ritual. */
function overrideRules(registry: Registry, kind: Kind, index: number): RegistryIssue[] {
  const ritualIds = new Set<string>(registry.rituals.map((ritual) => ritual.id));
  const tagIds = new Set<string>(registry.tags.map((tag) => tag.id));
  return (kind.ritual_overrides ?? []).flatMap((override, position) => {
    const path = ['kinds', index, 'ritual_overrides', position];
    const ritual = ritualIds.has(override.ritual)
      ? []
      : [issue('kinds', [...path, 'ritual'], 'unknown_ritual', `no ritual "${override.ritual}"`)];
    const tags = override.tags_any.flatMap((tag, at) =>
      tagIds.has(tag) ? [] : [issue('kinds', [...path, 'tags_any', at], 'unknown_tag', `no tag "${tag}"`)],
    );
    return [...ritual, ...tags];
  });
}

function kindRules(registry: Registry): RegistryIssue[] {
  const { kinds, classes, rituals } = registry;
  const ritualIds = new Set<string>(rituals.map((ritual) => ritual.id));
  const classById = new Map<string, CharacterClass>(classes.map((entry) => [entry.id, entry]));
  return kinds.flatMap((kind, index) => {
    const ritual = ritualIds.has(kind.ritual)
      ? []
      : [issue('kinds', ['kinds', index, 'ritual'], 'unknown_ritual', `no ritual "${kind.ritual}"`)];
    const allowed = kind.classes_allowed.flatMap((classId, position) => {
      const path = ['kinds', index, 'classes_allowed', position];
      const entry = classById.get(classId);
      if (!entry) return [issue('kinds', path, 'unknown_class', `no class "${classId}"`)];
      // The one who does the work never judges it (ADR 0008): a verifier class cannot take a kind.
      if (entry.is_verifier) return [issue('kinds', path, 'verifier_takes_work', `${classId} is a verifier`)];
      if (entry.kinds.includes(kind.id)) return [];
      return [issue('kinds', path, 'class_kind_mismatch', `${classId} does not list kind ${kind.id}`)];
    });
    return [...ritual, ...allowed, ...overrideRules(registry, kind, index)];
  });
}

function classRules({ kinds, classes }: Registry): RegistryIssue[] {
  const kindById = new Map<string, Kind>(kinds.map((kind) => [kind.id, kind]));
  return classes.flatMap((entry, index) => {
    const role = entry.is_verifier && entry.is_monk;
    const both = role
      ? [
          issue(
            'classes',
            ['classes', index, 'is_monk'],
            'verifier_and_monk',
            'a class is a verifier or a monk',
          ),
        ]
      : [];
    const listed = entry.kinds.flatMap((kindId, position) => {
      const path = ['classes', index, 'kinds', position];
      const kind = kindById.get(kindId);
      if (!kind) return [issue('classes', path, 'unknown_kind', `no kind "${kindId}"`)];
      // A verifier lists the kinds it may judge; any other class must be allowed by the kind itself.
      if (entry.is_verifier || kind.classes_allowed.includes(entry.id)) return [];
      return [issue('classes', path, 'class_kind_mismatch', `kind ${kindId} does not allow ${entry.id}`)];
    });
    return [...both, ...listed];
  });
}

function ritualRules({ kinds, rituals }: Registry): RegistryIssue[] {
  const known = new Set<string>(RITUAL_STEPS);
  return rituals.flatMap((ritual, index) => [
    ...ritual.steps.flatMap((step, position) =>
      known.has(step)
        ? []
        : [issue('rituals', ['rituals', index, 'steps', position], 'unknown_step', `unknown step "${step}"`)],
    ),
    ...followUpRules(kinds, ritual.flaky_follow_up, 'rituals', ['rituals', index, 'flaky_follow_up']),
  ]);
}

function scriptRules({ kinds, scripts }: Registry): RegistryIssue[] {
  const kindIds = new Set<string>(kinds.map((kind) => kind.id));
  return scripts.flatMap((script, index) => {
    // The Steward runs registry/scripts/<id>.mjs (implementation-plan §3.12); another entry would be ambiguous.
    const entry =
      script.entry === `scripts/${script.id}.mjs`
        ? []
        : [
            issue(
              'scripts',
              ['scripts', index, 'entry'],
              'entry_mismatch',
              `entry must be scripts/${script.id}.mjs`,
            ),
          ];
    const unknown = script.kinds.flatMap((kindId, position) =>
      kindIds.has(kindId)
        ? []
        : [issue('scripts', ['scripts', index, 'kinds', position], 'unknown_kind', `no kind "${kindId}"`)],
    );
    const followUp = followUpRules(kinds, script.follow_up, 'scripts', ['scripts', index, 'follow_up']);
    return [...entry, ...unknown, ...followUp];
  });
}

/**
 * The quest the Steward opens on its own must be one the kingdom can make: a known kind, a class it allows (a failed
 * script run, P1-17; a flaky verdict, P1-20).
 */
function followUpRules(
  kinds: Registry['kinds'],
  followUp: CatalogScript['follow_up'],
  file: RegistryFile,
  path: Path,
): RegistryIssue[] {
  if (followUp === undefined) return [];
  const kind = kinds.find(({ id }) => id === followUp.kind);
  if (kind === undefined)
    return [issue(file, [...path, 'kind'], 'unknown_kind', `no kind "${followUp.kind}"`)];
  if (kind.classes_allowed.includes(followUp.class)) return [];
  const message = `kind ${kind.id} does not allow class ${followUp.class}`;
  return [issue(file, [...path, 'class'], 'class_kind_mismatch', message)];
}
