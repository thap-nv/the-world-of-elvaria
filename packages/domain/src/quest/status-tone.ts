// The design system colours a quest by one of 8 tones (`data-status` in elvaria.css, implementation-plan §2.7);
// the domain has 12 statuses. The mapping is data here, so either side can change without renaming the other.
import type { QuestStatus } from '../schema/quest/shared.ts';

/** The `data-status` values of elvaria.css; the spec reads them from the current CSS source. */
export const STATUS_TONES = [
  'open',
  'working',
  'review',
  'done',
  'returned',
  'sleep',
  'infirmary',
  'seal',
] as const;
export type StatusTone = (typeof STATUS_TONES)[number];

const TONE_OF: Readonly<Record<QuestStatus, StatusTone>> = {
  // Waiting for someone (the owner, a dependency, a free character) or out of play: all read as "open".
  draft: 'open',
  open: 'open',
  blocked: 'open',
  archived: 'open',
  claimed: 'working',
  working: 'working',
  review: 'review',
  returned: 'returned',
  awaiting_seal: 'seal',
  done: 'done',
  paused_mana: 'sleep',
  infirmary: 'infirmary',
};

export const statusToneOf = (status: QuestStatus): StatusTone => TONE_OF[status];
