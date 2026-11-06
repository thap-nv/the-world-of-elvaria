// What the world sees of a territory (a region of the map): its name, kind and health. Commands, checks, laws
// and paths stay in territory.json; the renderer has no use for them (ADR 0001).
import { z } from 'zod';

import { TerritoryIdSchema } from '../core/ids.ts';
import { DateTimeSchema, NameSchema } from '../schema/common.ts';
import type { Territory } from '../schema/territory.ts';

// The enums repeat territory.json's; territoryViewOf assigns one to the other, so tsc fails if they part.
export const TerritoryViewSchema = z.strictObject({
  id: TerritoryIdSchema,
  name: NameSchema,
  kind: z.enum(['code', 'docs', 'content', 'data', 'mixed']),
  health: z.strictObject({
    ci: z.enum(['green', 'red', 'unknown']),
    open_bugs: z.int().min(0),
    last_patrol_at: DateTimeSchema.nullable(),
  }),
  surveyed_at: DateTimeSchema.nullable(),
});

export type TerritoryView = z.infer<typeof TerritoryViewSchema>;

/** The view of a territory file; `territory.*` events carry it after the change. */
export function territoryViewOf(territory: Territory): TerritoryView {
  const { health } = territory;
  return {
    id: territory.id,
    name: territory.name,
    kind: territory.kind,
    health: { ci: health.ci, open_bugs: health.open_bugs, last_patrol_at: health.last_patrol_at ?? null },
    surveyed_at: territory.surveyed_at ?? null,
  };
}
