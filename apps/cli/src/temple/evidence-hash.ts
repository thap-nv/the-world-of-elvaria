import { createHash } from 'node:crypto';

import type { TempleEvidence } from '@elvaria/domain';

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (typeof value !== 'object' || value === null) return value;
  const keys = Object.keys(value).sort();
  return Object.fromEntries(keys.map((key) => [key, sorted(Reflect.get(value, key))]));
}

/** Only the pack the Monk reads: no trigger, local day, run id or session directory. */
export const evidenceHashOf = (evidence: TempleEvidence): string =>
  createHash('sha256')
    .update(JSON.stringify(sorted(evidence)))
    .digest('hex');
