// quest.json v1: one unit of real work on a territory (implementation-plan §2.3, §2.5).
import type { z } from 'zod';

import { GENERATED_NOTE } from '../common.ts';
import { QuestFieldsSchema } from './quest-fields.ts';
import { QUEST_RULES } from './quest-rules.ts';
import { allOfRules, checkRules } from './rules.ts';

export const QuestSchema = QuestFieldsSchema.superRefine(checkRules(QUEST_RULES)).meta({
  title: 'Quest',
  description:
    'quests/<id>.json: one unit of real work on a territory. Only the Steward writes this file (ADR 0005); the CLI, Herald and phone write commands to inbox/. The quest folder quests/<id>/ holds handover.md (written by the character) and journal.jsonl (written by hooks); there is no `journal` path field because the location is a convention.',
  $comment: `${GENERATED_NOTE} Not expressible here, checked by zod: verifier != assignee; the verifier never appears in attempt_log with role assignee for this quest; party_id = id exactly when party_role = contract; plot.branch is quest/<id>; unit ids are unique. Not checked by this schema because they need other files: secrets_required is a subset of territory.secrets_allowed; kind, class_required and tags are validated against the registry, and class_required is in kinds[kind].classes_allowed; no character who worked on any quest of a party (same party_id) verifies a quest of that party; status changes only through the transition table (domain/src/quest/transitions.ts).`,
  allOf: allOfRules(QUEST_RULES),
});

export type Quest = z.infer<typeof QuestSchema>;
