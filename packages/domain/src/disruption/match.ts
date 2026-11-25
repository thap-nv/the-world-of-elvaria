// How one event meets a kind's match (LL-01, ADR 0036): a dotted path into the line and one of three operations, so
// a kind is data the core reads, never code (ADR 0016).
import type { DisruptionCondition, DisruptionMatch } from '../schema/disruption/disruption-kind.ts';

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The value at a dotted path, or undefined when a step of it is missing or is not an object. */
export function valueAt(root: unknown, path: string): unknown {
  let value: unknown = root;
  for (const key of path.split('.')) {
    if (!isRecord(value) || !Object.hasOwn(value, key)) return undefined;
    value = value[key];
  }
  return value;
}

export function meetsCondition(event: unknown, condition: DisruptionCondition): boolean {
  const value = valueAt(event, condition.path);
  if ('in' in condition) return condition.in.some((option) => option === value);
  if ('gte' in condition) return typeof value === 'number' && value >= condition.gte;
  return (value !== undefined && value !== null) === condition.exists;
}

export const meetsMatch = (event: { readonly type: string }, match: DisruptionMatch): boolean =>
  event.type === match.type && (match.where ?? []).every((condition) => meetsCondition(event, condition));

/** A code a cause may name: a string, or a number written as one; anything else is no cause. */
export function codeAt(root: unknown, path: string | undefined): string | undefined {
  if (path === undefined) return undefined;
  const value = valueAt(root, path);
  if (typeof value === 'string') return value;
  return typeof value === 'number' ? String(value) : undefined;
}
