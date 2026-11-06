// world/map.json v1 (stage 3): one region per territory (implementation-plan §2.3). The schema exists from
// stage 0 so stage 3 needs no domain change; terrain, buildings and level of detail are derived, never stored.
import { z } from 'zod';

import { SLUG_PATTERN, TerritoryIdSchema } from '../../core/ids.ts';
import { DateTimeSchema, GENERATED_NOTE, rejectDuplicateIds, unique } from '../common.ts';
import { POLYGON_MIN_POINTS } from './constants.ts';

const SlugSchema = z.string().regex(SLUG_PATTERN);
/** A point on the ground plane, in metres. */
const PointSchema = z.strictObject({ x: z.number(), z: z.number() });

const RegionSchema = z.strictObject({
  id: SlugSchema,
  territory: TerritoryIdSchema,
  anchor: PointSchema,
  bounds: z.array(PointSchema).min(POLYGON_MIN_POINTS).meta({ description: 'Polygon, counter-clockwise.' }),
  roads_to: unique(z.array(SlugSchema)),
});

type Region = z.output<typeof RegionSchema>;

/** The three rules the v1 contract states but JSON Schema cannot check. */
function checkRegions(regions: readonly Region[], ctx: z.RefinementCtx): void {
  rejectDuplicateIds(regions, ctx);
  const ids = new Set(regions.map((region) => region.id));
  const territories = new Set<string>();
  regions.forEach((region, index) => {
    if (territories.has(region.territory)) {
      const message = `territory "${region.territory}" has more than one region`;
      ctx.addIssue({ code: 'custom', path: [index, 'territory'], message });
    }
    territories.add(region.territory);
    region.roads_to.forEach((target, road) => {
      if (!ids.has(target)) {
        const message = `road to unknown region "${target}"`;
        ctx.addIssue({ code: 'custom', path: [index, 'roads_to', road], message });
      }
    });
  });
}

export const WorldMapSchema = z
  .strictObject({
    version: z.literal(1),
    generated_at: DateTimeSchema,
    regions: z.array(RegionSchema).superRefine(checkRegions),
  })
  .meta({
    title: 'World map',
    description:
      'world/map.json in the kingdom (stage 3): one region per attached territory, placed on the map when the realm is opened. Minimal v1: anchor, polygon bounds on the ground plane (x, z in metres) and roads to other regions. Terrain, buildings and level of detail are derived (Three.js world and the 2D lite client both draw from this file plus WorldState).',
    $comment: `${GENERATED_NOTE} The schema exists from stage 0 so stage 3 needs no domain change; heightmap and survey data are added in later versions with a migration. Not expressible here: region ids unique; roads_to refer to existing regions; each territory has at most one region.`,
  });

export type WorldMap = z.infer<typeof WorldMapSchema>;
export type WorldMapRegion = WorldMap['regions'][number];
