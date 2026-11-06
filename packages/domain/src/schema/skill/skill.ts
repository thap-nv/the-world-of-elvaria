// skill v1: the front matter of temple/skills/<id>/SKILL.md (implementation-plan §2.3, §3.13, ADR 0020).
// A skill is not attached to a character; selectSkills picks at most three per quest by tag and territory.
import { z } from 'zod';

import { LessonIdSchema, SLUG_PATTERN, TagIdSchema } from '../../core/ids.ts';
import { DateTimeSchema, GENERATED_NOTE, unique } from '../common.ts';
import {
  SKILL_DESCRIPTION_MAX_LENGTH,
  SKILL_MAX_TOKENS_DEFAULT,
  SKILL_MAX_TOKENS_MIN,
  SKILL_TAGS_MAX,
  SKILL_TITLE_MAX_LENGTH,
} from './constants.ts';

const describe = (description: string) => ({ description });
/** Skill ids are kebab-case because they name folders (`temple/skills/<id>/`), like script ids. */
const SKILL_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

const isOneLine = (text: string): boolean => !/[\r\n]/.test(text);

export const SkillSchema = z
  .strictObject({
    version: z.literal(1),
    id: z
      .string()
      .regex(SKILL_ID_PATTERN)
      .meta(describe('Folder name under temple/skills/ (kebab-case: it is a file id).')),
    title: z.string().min(1).max(SKILL_TITLE_MAX_LENGTH),
    // A line break would turn the CLI-native skill's one-line description into a block.
    description: z
      .string()
      .min(1)
      .max(SKILL_DESCRIPTION_MAX_LENGTH)
      .refine(isOneLine, { message: 'a skill description is one line' })
      .meta(describe('One line: when this skill applies. Becomes the description of the CLI-native skill.')),
    tags: unique(z.array(TagIdSchema).min(1).max(SKILL_TAGS_MAX)).meta(
      describe('Quest tags this skill applies to (registry/tags.json).'),
    ),
    scope: z
      .string()
      .regex(SLUG_PATTERN)
      .meta(
        describe(
          '`global`, or the id of the one territory this skill applies to. A territory skill ranks before a global one.',
        ),
      ),
    source: z
      .enum(['monk', 'user'])
      .meta(
        describe(
          'monk: written by the Temple from a lesson that repeats across characters and is a technique, not a habit; user: written by the owner.',
        ),
      ),
    derived_from: unique(z.array(LessonIdSchema))
      .optional()
      .meta(describe('Lesson ids the Temple distilled this skill from; required when source = monk.')),
    // Required although a new skill starts at the default: the v1 contract keeps the cap explicit in the file.
    max_tokens: z.int().min(SKILL_MAX_TOKENS_MIN).meta({
      default: SKILL_MAX_TOKENS_DEFAULT,
      description:
        'Size cap of the body and attached files; a skill that grows past it is split. The default is a starting value.',
    }),
    created_at: DateTimeSchema,
    updated_at: DateTimeSchema.optional(),
  })
  .refine((skill) => skill.source !== 'monk' || (skill.derived_from ?? []).length > 0, {
    path: ['derived_from'],
    message: 'a monk skill needs derived_from',
  })
  .meta({
    title: 'Skill',
    description:
      "Front matter of temple/skills/<id>/SKILL.md: one skill (bí kíp), domain knowledge such as 'React + TanStack Query by this repo's conventions' or 'Playwright + axe' (product plan 0.5 §4, §6). A skill is not attached to any character: for each quest the runner loads at most 3 skills whose tags match the quest's tags and whose scope is global or the quest's territory (selectSkills in packages/domain), converting them to the CLI's own skill format in the worktree or inlining them in the prompt. The body below the front matter is written in English, like character prompts. Stage 1 has no skills: a territory's CLAUDE.md is its skill.",
    $comment: `${GENERATED_NOTE} The path is the convention temple/skills/<id>/SKILL.md (plus attached files in the same folder), so it is not a field. Not expressible here: tags exist in registry/tags.json; scope is \`global\` or an existing territory id (a territory may not be named \`global\`); the body fits max_tokens; derived_from lessons exist and come from at least two characters; description holds no line break.`,
    // The same rule as the refine above, for readers of the JSON contract.
    allOf: [
      {
        if: { properties: { source: { const: 'monk' } } },
        then: { required: ['derived_from'], properties: { derived_from: { minItems: 1 } } },
      },
    ],
  });

export type Skill = z.infer<typeof SkillSchema>;
