// What the world sees of a character (implementation-plan §2.6, §2.7): status, the quest it holds, the avatar
// ring and the title. A quest or character event carries this view after its change (P0-09).
import { z } from 'zod';

import { reputationOf, titleOf } from '../character/reputation.ts';
import { CharacterIdSchema, ClassIdSchema, QuestIdSchema, TagIdSchema, TribeIdSchema } from '../core/ids.ts';
import { CHARACTER_STATUSES } from '../schema/character/character.ts';
import { CHARACTER_LEVEL_MAX } from '../schema/character/constants.ts';
import { DateTimeSchema, NameSchema, RoleSchema } from '../schema/common.ts';
import type { Character } from '../schema/character/character.ts';

const describe = (description: string) => ({ description });

// ModelSlugSchema without its `$defs` id, for the same reason as in quest-view.ts.
const ModelSlugSchema = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/);

export const CharacterViewSchema = z.strictObject({
  id: CharacterIdSchema,
  name: NameSchema,
  class: ClassIdSchema,
  tribe: TribeIdSchema,
  model: ModelSlugSchema,
  level: z.int().min(1).max(CHARACTER_LEVEL_MAX),
  status: z.enum(CHARACTER_STATUSES),
  status_since: DateTimeSchema,
  current: z.strictObject({ quest: QuestIdSchema, role: RoleSchema }).nullable(),
  // Derived values are never stored in character.json (§9.1 items 5, 20). A view is not a source: an event
  // states what the ring showed at that moment, and a snapshot is a cache dropped when it disagrees.
  reputation: z
    .strictObject({ verdicts: z.int().min(0), pct: z.number().min(0).max(100).nullable() })
    .meta(describe('reputationOf(reputation.window): the avatar ring (--rep); pct null before any verdict.')),
  title: TagIdSchema.nullable().meta(describe('titleOf(character): the tag shown over the head, if any.')),
});

export type CharacterView = z.infer<typeof CharacterViewSchema>;

/** The view of a character file; the Steward writes it into the event of every change it makes. */
export function characterViewOf(character: Character): CharacterView {
  return {
    id: character.id,
    name: character.name,
    class: character.class,
    tribe: character.tribe,
    model: character.model,
    level: character.level,
    status: character.status,
    status_since: character.status_since,
    current: character.current ?? null,
    reputation: reputationOf(character.reputation.window),
    title: titleOf(character),
  };
}
