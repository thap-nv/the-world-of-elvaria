// One line of text → one Event: JSON, upgrade by `v`, the domain's EventSchema. Unknown types pass (the schema
// keeps them, renderers skip them; forward compatible), so only a line no reader could use is an issue.
import { EVENT_MIGRATIONS } from './migrations/index.ts';
import { migrateEvent } from './migrations/run.ts';
import type { EventLogIssueCode, IssueDetail } from './issues.ts';
import type { EventMigrationChain, MigrateProblem } from './migrations/run.ts';
import type { EventLineSchema } from './schema.ts';
import type { Event, Result } from '@elvaria/domain';

export interface LineProblem {
  readonly code: EventLogIssueCode;
  readonly message: string;
  readonly details?: readonly IssueDetail[];
}

function problemOf(problem: MigrateProblem): LineProblem {
  switch (problem.code) {
    case 'missing_version':
      return { code: problem.code, message: 'no integer v ≥ 1' };
    case 'future_version':
      return {
        code: problem.code,
        message: `v ${problem.v} is newer than this reader (v ${problem.current})`,
      };
    case 'migration_failed':
      return { code: problem.code, message: `upgrade from v ${problem.from} failed: ${problem.message}` };
  }
}

const pathOf = (path: readonly PropertyKey[]): (string | number)[] =>
  path.map((key) => (typeof key === 'number' ? key : String(key)));

export function parseEventLine(
  text: string,
  schema: EventLineSchema,
  chain: EventMigrationChain = EVENT_MIGRATIONS,
): Result<Event, LineProblem> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: { code: 'invalid_json', message: String(error) } };
  }
  const migrated = migrateEvent(raw, chain);
  if (!migrated.ok) return { ok: false, error: problemOf(migrated.error) };
  const parsed = schema.safeParse(migrated.value);
  if (parsed.success) return { ok: true, value: parsed.data };
  const details = parsed.error.issues.map((issue) => ({ path: pathOf(issue.path), message: issue.message }));
  return { ok: false, error: { code: 'invalid', message: 'the event schema rejects the line', details } };
}
