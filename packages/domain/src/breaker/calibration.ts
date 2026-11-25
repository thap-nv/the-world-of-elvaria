// File snapshots only: each tribe keeps the token measure its runner recorded (G).
import { CALIBRATION_MIN_SAMPLES, MEDIAN_PAIR_SIZE } from './constants.ts';
import type { Character } from '../schema/character/character.ts';
import type { Kingdom } from '../schema/kingdom.ts';
import type { Quest } from '../schema/quest/quest.ts';

export interface CalibratedValue {
  readonly value: number;
  readonly samples: number;
  readonly source: 'default' | 'measured';
}

export interface TribeCalibration {
  readonly estimate_factor: CalibratedValue;
  readonly max_turns: CalibratedValue;
}

export type Calibration = ReadonlyMap<string, TribeCalibration>;

/** Average the middle pair for an even sample count, without changing the input. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / MEDIAN_PAIR_SIZE);
  const lower = Math.floor((sorted.length - 1) / MEDIAN_PAIR_SIZE);
  const pair = sorted.slice(lower, middle + 1);
  return pair.reduce((sum, value) => sum + value, 0) / pair.length;
}

const calibrated = (values: readonly number[], fallback: number): CalibratedValue => ({
  value: values.length < CALIBRATION_MIN_SAMPLES ? fallback : median(values),
  samples: values.length,
  source: values.length < CALIBRATION_MIN_SAMPLES ? 'default' : 'measured',
});

/**
 * One completed first assignee run per quest, including its resumed sessions, as in firstRunOf.
 * Incomplete measurements and mixed-tribe runs cannot teach a tribe its own ceiling. A heal session (ADR 0034) is
 * left out: it fixes what the hooks refused under ceilings of its own, so it says nothing of what the work cost.
 */
function samplesOf(quests: readonly Quest[], characters: ReadonlyMap<string, Pick<Character, 'tribe'>>) {
  return quests.flatMap((quest) => {
    const first = quest.attempt_log.find(({ role, character }) => role === 'assignee' && character !== null);
    if (first === undefined || quest.estimate.tokens <= 0) return [];
    const tribe = characters.get(first.character as string)?.tribe;
    const run = quest.attempt_log.filter(
      ({ role, n, heal }) => role === 'assignee' && n === first.n && heal !== 'session',
    );
    if (
      tribe === undefined ||
      run.some(
        (entry) =>
          entry.ended_at === undefined ||
          entry.character === null ||
          characters.get(entry.character)?.tribe !== tribe,
      )
    )
      return [];
    return [
      {
        tribe,
        tokens: run.every(({ tokens }) => tokens !== undefined)
          ? run.reduce((sum, entry) => sum + Number(entry.tokens), 0) / quest.estimate.tokens
          : undefined,
        turns: run.every(({ turns }) => turns !== undefined)
          ? run.reduce((sum, entry) => sum + Number(entry.turns), 0)
          : undefined,
      },
    ];
  });
}

/** Independent sample counts keep old attempts without turns from inventing zero-turn measurements. */
export function calibrationOf(
  quests: readonly Quest[],
  characters: ReadonlyMap<string, Pick<Character, 'tribe'>>,
  kingdom: Pick<Kingdom, 'tribes' | 'breakers'>,
): Calibration {
  const samples = samplesOf(quests, characters);
  return new Map(
    kingdom.tribes.map((tribe) => {
      const own = samples.filter((sample) => sample.tribe === tribe.id);
      const tokens = own.flatMap((sample) => (sample.tokens === undefined ? [] : [sample.tokens]));
      const turns = own.flatMap((sample) => (sample.turns === undefined ? [] : [sample.turns]));
      const turnLimit = calibrated(turns, tribe.max_turns ?? kingdom.breakers.max_turns);
      // A median resists outliers; round upward because a nominal turn ceiling must be a positive integer.
      return [
        tribe.id,
        {
          estimate_factor: calibrated(tokens, kingdom.breakers.estimate_factor),
          max_turns: { ...turnLimit, value: Math.max(1, Math.ceil(turnLimit.value)) },
        },
      ];
    }),
  );
}
