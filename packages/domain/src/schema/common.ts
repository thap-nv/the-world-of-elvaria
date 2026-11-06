// Pieces shared by the v1 schemas; patterns are the `$defs` of docs/schemas/*.schema.json (ADR 0003).
import { z } from 'zod';

import { NAME_MAX_LENGTH } from '../constants.ts';

/** Absolute path written with `/`: data files never hold backslashes (implementation-plan §2.1, ADR 0015). */
export const AbsPathSchema = z.string().regex(/^(?:[A-Za-z]:\/|\/)[^\\]*$/);
export const ModelSlugSchema = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/);
export const NameSchema = z.string().min(1).max(NAME_MAX_LENGTH);
export const NonEmptyStringSchema = z.string().min(1);
/** ISO 8601 with an offset (`Z` or `+07:00`), as every timestamp in a kingdom file (implementation-plan §2.1). */
export const DateTimeSchema = z.iso.datetime({ offset: true });

export const RANKS = ['F', 'E', 'D', 'C', 'B', 'A', 'S'] as const;
export const RankSchema = z.enum(RANKS);
export type Rank = z.infer<typeof RankSchema>;

/** JSON Schema `uniqueItems` for an array of plain values. */
export const allUnique = (items: readonly unknown[]): boolean => new Set(items).size === items.length;
export const UNIQUE_ITEMS = { message: 'items must be unique' } as const;

/** Adds an issue for every repeated `id` in a list; ids are unique in every file, which JSON Schema cannot say. */
export function rejectDuplicateIds(items: readonly { id: string }[], ctx: z.RefinementCtx): void {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id))
      ctx.addIssue({ code: 'custom', path: [index, 'id'], message: `duplicate id "${item.id}"` });
    seen.add(item.id);
  });
}
