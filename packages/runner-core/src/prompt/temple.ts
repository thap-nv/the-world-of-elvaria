// buildTemplePrompt: the Monk's session of the Temple (temple-first plan, PS-12d and PS-12f; ADR 0027). Like the
// Chancellor's triage (triage.ts), a session with no tool and one question: the fix ladder, where a cure belongs (L5)
// and how a line is scoped in the system part; the evidence pack (templeEvidenceOf, cut at the tribe's prompt ceiling)
// and the ids a scope may name in the user part. Its reply is the temple-reply structured output. No scripture loads
// here: the Monk reads the lines in the pack, as data.
import {
  LESSON_TEXT_MAX_LENGTH,
  SCRIPTURE_LINES_MAX,
  TEMPLE_ADDS_MAX,
  TEMPLE_LETTERS_MAX,
} from '@elvaria/domain';
import type { LessonVocabulary, TempleEvidence, TempleTrigger } from '@elvaria/domain';

import { LANGUAGE_NAMES, classBlock, decreeBlock } from './blocks.ts';
import { fill, joinBlocks } from './templates.ts';
import type { BuiltPrompt } from '../runner/types.ts';
import type { Locale } from './blocks.ts';
import type { PromptTemplates } from './templates.ts';

export interface TempleContext {
  readonly locale: Locale;
  readonly decree: string | null;
  /** The craft of the Monk's class (registry `prompts/monk.md`, or the kingdom's copy). */
  readonly class_prompt: string | null;
  readonly trigger: TempleTrigger;
  readonly evidence: TempleEvidence;
  /** The ids a scope may name: a line whose scope names another is never loaded. */
  readonly vocabulary: LessonVocabulary;
}

/** Why this run, for the Monk: what made the Temple due, or the owner. */
const TRIGGER_TEXT: Readonly<Record<TempleTrigger, string>> = {
  quests: 'Enough runs were judged since the Temple last ran.',
  weekly: 'A week went by since the Temple last ran, and a judge failed some work.',
  suspension:
    'The Steward suspended a character for failing again and again. A line of its fail kind that its next session loads frees it; a letter leaves it waiting for the owner.',
  owner: 'The owner asked for this run.',
};

const ids = (values: readonly string[]): string =>
  values.length === 0 ? 'none' : values.map((value) => `\`${value}\``).join(', ');

export function buildTemplePrompt(context: TempleContext, t: PromptTemplates): BuiltPrompt {
  const role = fill(t.temple, {
    text_max: String(LESSON_TEXT_MAX_LENGTH),
    lines_max: String(SCRIPTURE_LINES_MAX),
    adds_max: String(TEMPLE_ADDS_MAX),
    letters_max: String(TEMPLE_LETTERS_MAX),
    language: LANGUAGE_NAMES[context.locale],
  });
  const { vocabulary } = context;
  return {
    system: joinBlocks([decreeBlock(context.decree, t), role, classBlock(context.class_prompt, 'Monk', t)]),
    user: fill(t['temple-context'], {
      trigger: TRIGGER_TEXT[context.trigger],
      // Unindented: the pack's ceiling was measured on this text (evidenceSizeOf), and agy takes it on argv.
      evidence: JSON.stringify(context.evidence),
      classes: ids(vocabulary.classes),
      tribes: ids(vocabulary.tribes),
      territories: ids(vocabulary.territories),
      tags: ids(vocabulary.tags),
    }),
  };
}
