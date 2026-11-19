// The scope of a lesson (PS-12, temple-first plan DB2, DB3; lesson-sharing S1, S2): written at the head of its line in
// the Markdown, `{role=verifier tribe=codex,claude os=win32}`, so the owner writes it by hand and sees it where the
// lesson is. Every key present must match the session for the line to load; a line without a scope loads everywhere.
import { z } from 'zod';

import {
  ClassIdSchema,
  LESSON_REF_PATTERN,
  SLUG_PATTERN,
  TagIdSchema,
  TribeIdSchema,
} from '../../core/ids.ts';
import { NonEmptyStringSchema, RoleSchema } from '../common.ts';

const describe = (description: string) => ({ description });

/** The keys that filter, in the order the grammar names them; `fail_kind` and `cli` describe a line, never filter it. */
export const LESSON_SCOPE_KEYS = ['role', 'class', 'tribe', 'os', 'territory', 'tag'] as const;
export type LessonScopeKey = (typeof LESSON_SCOPE_KEYS)[number];

/** The operating systems the Steward runs on, as Node names them (`process.platform`, the source of `shellOf`). */
export const LESSON_PLATFORMS = ['win32', 'darwin', 'linux'] as const;
export const LessonPlatformSchema = z.enum(LESSON_PLATFORMS);
export type LessonPlatform = z.infer<typeof LessonPlatformSchema>;

const listOf = <T extends z.ZodType>(item: T, description: string) =>
  z.array(item).min(1).meta(describe(description));

// The territory is a slug, checked against the kingdom's territories where the line is read: a reserved name (`global`)
// simply matches no territory, so the plain pattern is enough here.
export const LessonTerritorySchema = z.string().regex(SLUG_PATTERN);

export const LessonScopeSchema = z
  .strictObject({
    role: listOf(RoleSchema, 'The role of the session: assignee, verifier.').optional(),
    class: listOf(ClassIdSchema, "The character's class, a registry id.").optional(),
    tribe: listOf(TribeIdSchema, "The character's tribe, an id of kingdom.tribes[].").optional(),
    os: listOf(LessonPlatformSchema, 'The OS the Steward runs on.').optional(),
    territory: listOf(
      LessonTerritorySchema,
      "The quest's territory: a scope that never leaves the kingdom (lesson-sharing S2, P3).",
    ).optional(),
    tag: listOf(TagIdSchema, 'At least one of these tags on the quest.').optional(),
  })
  .meta(
    describe(
      'Where a lesson loads (PS-12): every key present must match the session, values of one key are alternatives. Absent, the lesson loads in every session. The CLI version is no filter but where the lesson was measured (cli_version, lesson-sharing S5).',
    ),
  );
export type LessonScope = z.infer<typeof LessonScopeSchema>;

/** Where a lesson that came from outside the kingdom came from (lesson-sharing S4, T9); a lesson without one is ours. */
export const LessonOriginSchema = z
  .strictObject({
    from: NonEmptyStringSchema.meta(describe('The release or the pack the lesson came with.')),
    lesson: z
      .string()
      .regex(LESSON_REF_PATTERN)
      .optional()
      .meta(describe('Its id, or the ref of its sentence, where it came from.')),
    received_at: z.iso.date().meta(describe('The day the owner took it in.')),
  })
  .meta(describe('Where a lesson from outside the kingdom came from (lesson-sharing S4, T9).'));
export type LessonOrigin = z.infer<typeof LessonOriginSchema>;
