// selectChancellor: who drafts the quests of one utterance (implementation-plan §3.11, §3.14; §10 question 6). A
// rule over several tribes, so it sits beside tribeLimitsOf and not inside it: a tribe without structured output
// (schema in the prompt, a parse, one retry) speaks as the Chancellor only when no ready tribe has it (§9.1 item 13).
import type { ClassId, TribeId } from '../core/ids.ts';
import type { Character } from '../schema/character/character.ts';
import type { TribeLimits } from './tribe-limits.ts';

/** The class whose characters draft quests and never take one (registry/classes.json, product plan §6). */
export const CHANCELLOR_CLASS = 'chancellor' as ClassId;

/** The limits of each tribe that can run a session now (enabled, with a runner); every other tribe is absent. */
export type LimitsByTribe = Readonly<Partial<Record<TribeId, TribeLimits>>>;

export interface ChancellorChoice {
  readonly character: Character;
  /** How the drafts come back: the CLI's JSON Schema flag, or the schema in the prompt and a parse. */
  readonly structured_output: TribeLimits['structured_output'];
}

/** The highest level first, then the id: the same kingdom always hears the same Chancellor. */
const byStanding = (a: ChancellorChoice, b: ChancellorChoice): number =>
  b.character.level - a.character.level || (a.character.id < b.character.id ? -1 : 1);

/**
 * The Chancellor for the next utterance: a character of the chancellor class, idle (awake, not suspended), whose
 * tribe runs now; one whose tribe has structured output whenever there is one. Undefined when nobody can speak.
 */
export function selectChancellor(
  characters: readonly Character[],
  limits: LimitsByTribe,
): ChancellorChoice | undefined {
  const ready = characters.flatMap((character): ChancellorChoice[] => {
    const tribe = limits[character.tribe];
    const able = character.class === CHANCELLOR_CLASS && character.status === 'idle' && tribe?.enabled;
    return able === true ? [{ character, structured_output: tribe.structured_output }] : [];
  });
  const native = ready.filter((choice) => choice.structured_output === 'native');
  return (native.length > 0 ? native : ready).sort(byStanding)[0];
}
