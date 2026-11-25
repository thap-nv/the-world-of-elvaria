// registry/disruptions.json is read apart from the six files of parseRegistry (LL-01): a broken file of kinds drops
// the disruption reading and nothing else, so the kingdom still loads and the rest of the metrics still print
// (plans/learning-loop.md §7). The loader adds what the schema cannot say: unique ids, known event types.
import { err, ok } from '../core/result.ts';
import { DisruptionsFileSchema } from '../schema/disruption/disruption-kind.ts';
import { EVENT_TYPES } from '../schema/event/event-types.ts';
import type { Result } from '../core/result.ts';
import type { DisruptionKind, DisruptionMatch } from '../schema/disruption/disruption-kind.ts';

/** Stable codes, as RegistryIssueCode, so the CLI translates an issue through i18n. */
export type DisruptionsIssueCode = 'invalid' | 'duplicate_id' | 'unknown_event';

export interface DisruptionsIssue {
  readonly file: 'disruptions';
  /** From the root of the file, e.g. `['disruptions', 3, 'first', 'type']`. */
  readonly path: readonly (string | number)[];
  readonly code: DisruptionsIssueCode;
  readonly message: string;
}

type Path = DisruptionsIssue['path'];
const issue = (path: Path, code: DisruptionsIssueCode, message: string): DisruptionsIssue => ({
  file: 'disruptions',
  path,
  code,
  message,
});

const KNOWN_TYPES = new Set<string>(EVENT_TYPES);
const MATCH_KEYS = ['first', 'then', 'unless'] as const;

/** Every match of a kind with the path to its `type`: a typo there would match nothing, quietly. */
function matchesOf(kind: DisruptionKind): { readonly path: Path; readonly match: DisruptionMatch }[] {
  if (kind.shape === 'event') return [{ path: ['type'], match: kind }];
  return MATCH_KEYS.flatMap((key) => {
    const match = kind[key];
    return match === undefined ? [] : [{ path: [key, 'type'], match }];
  });
}

function kindIssues(kinds: readonly DisruptionKind[]): DisruptionsIssue[] {
  const seen = new Set<string>();
  return kinds.flatMap((kind, index) => {
    const repeated = seen.has(kind.id)
      ? [issue(['disruptions', index, 'id'], 'duplicate_id', `duplicate id "${kind.id}"`)]
      : [];
    seen.add(kind.id);
    const unknown = matchesOf(kind).flatMap(({ path, match }) =>
      KNOWN_TYPES.has(match.type)
        ? []
        : [issue(['disruptions', index, ...path], 'unknown_event', `no event type "${match.type}"`)],
    );
    return [...repeated, ...unknown];
  });
}

/** Validates the parsed JSON of registry/disruptions.json and returns its kinds, in file order. */
export function parseDisruptionKinds(json: unknown): Result<DisruptionKind[], DisruptionsIssue[]> {
  const parsed = DisruptionsFileSchema.safeParse(json);
  if (!parsed.success)
    return err(
      parsed.error.issues.map((zodIssue) =>
        issue(
          zodIssue.path.map((key) => (typeof key === 'number' ? key : String(key))),
          'invalid',
          zodIssue.message,
        ),
      ),
    );
  const issues = kindIssues(parsed.data.disruptions);
  return issues.length === 0 ? ok(parsed.data.disruptions) : err(issues);
}
