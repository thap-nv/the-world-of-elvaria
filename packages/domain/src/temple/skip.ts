import type { Event } from '../schema/event/event.ts';
import type { TempleTrigger } from './constants.ts';

/** Sessionless runs advance the schedule, but never replace the last model's evidence. */
export function shouldSkipTempleSession(input: {
  readonly trigger: TempleTrigger;
  readonly evidenceHash: string;
  readonly events: readonly Event[];
}): boolean {
  if (input.trigger === 'owner') return false;
  const previous = input.events.findLast(
    (event) =>
      event.type === 'temple.ran' && (event.data.tribe !== undefined || event.data.session !== undefined),
  );
  return previous?.type === 'temple.ran' && previous.data.evidence_hash === input.evidenceHash;
}
