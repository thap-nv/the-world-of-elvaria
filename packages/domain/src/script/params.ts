// A script-tier quest's params against its catalog entry's params_schema (implementation-plan §3.12, ADR 0017).
// The params are written by a model (the Chancellor) or the owner, so the Steward checks them when it applies
// `create_quest`, and the Chancellor's screen drops a draft whose params do not fit, before the script ever runs.
// params_schema is JSON Schema data in registry/scripts.json; zod reads it, so the domain needs no other validator.
import { z } from 'zod';

import type { CatalogScript } from '../schema/registry-entries.ts';

/**
 * What is wrong with `params` for `script`, one line per issue in English (for logs and the drop reason); empty when
 * they fit. A params_schema zod cannot read is an issue too: no params can be checked against it.
 */
export function scriptParamsIssues(
  script: Pick<CatalogScript, 'id' | 'params_schema'>,
  params: unknown,
): string[] {
  let schema: z.ZodType;
  try {
    schema = z.fromJSONSchema(script.params_schema);
  } catch (error) {
    // zod throws an Error naming what it cannot read (an unknown type, a $ref nowhere, a bad pattern).
    return [`the params_schema of ${script.id} cannot be read: ${String(error)}`];
  }
  const parsed = schema.safeParse(params);
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => {
    const where = issue.path.length === 0 ? 'params' : `params.${issue.path.map(String).join('.')}`;
    return `${where}: ${issue.message}`;
  });
}
