// What a verdict does (implementation-plan §2.3, §2.6, §3.13): the verdict file, then one entry in the assignee's
// reputation window and in the window of each of the quest's tags (the last 20 kept), then a new level when
// levelChange says the window has earned it (character.level_up or level_down, with level_since).
import { CharacterSchema, VERDICT_WINDOW_MAX, VerdictSchema, err, levelChange, ok } from '@elvaria/domain';
import type { Character, Quest, Result, Verdict, VerdictEntry, VerdictId } from '@elvaria/domain';

import type { Context } from './context.ts';
import type { CharacterEdit } from './record.ts';

/** The verdict on run `n` of the quest, as verdict ids name it (`<quest>-<n>`, §2.1). */
export const verdictIdOf = (quest: Quest, n: number): VerdictId => `${quest.id}-${n}` as VerdictId;

const kept = (window: readonly VerdictEntry[], entry: VerdictEntry): VerdictEntry[] =>
  [...window, entry].slice(-VERDICT_WINDOW_MAX);

/** The assignee's windows after a verdict on `quest`; the owner's seal or return weighs three (by_human). */
export const judged =
  (quest: Quest, verdict: VerdictId, result: 'pass' | 'fail', byHuman = false): CharacterEdit =>
  (character, at) => {
    const entry: VerdictEntry = { verdict_id: verdict, result, by_human: byHuman, at };
    const affinity = { ...character.skill_affinity };
    for (const tag of quest.tags) affinity[tag] = { window: kept(affinity[tag]?.window ?? [], entry) };
    return ok({
      ...character,
      reputation: { window: kept(character.reputation.window, entry) },
      skill_affinity: affinity,
    });
  };

/** After a verdict entered the window: a new level when the window has earned it. */
export async function levelAfterVerdict(ctx: Context, character: Character): Promise<void> {
  const level = levelChange(character);
  if (level === character.level) return;
  const type = level > character.level ? 'character.level_up' : 'character.level_down';
  const changed = await ctx.record.change(character.id, type, (before, at) => {
    const parsed = CharacterSchema.safeParse({ ...before, level, level_since: at });
    return parsed.success ? ok(parsed.data) : err('invalid_character');
  });
  if (!changed.ok) ctx.deps.log.warn(`steward: ${character.id} ${type}: ${changed.error}`);
}

/** What the verifier's structured output says, as far as a verdict file takes it. */
interface VerdictOutput {
  readonly result?: unknown;
  readonly fail_kind?: unknown;
  readonly notes?: unknown;
  readonly progress?: unknown;
}

/** The verdict file of a verifier's session, or why its output is not one (the verdict schema decides). */
export function verdictOf(
  ctx: Context,
  quest: Quest,
  run: { readonly n: number; readonly verifier: string; readonly session_id: string },
  output: unknown,
): Result<Verdict, string> {
  if (typeof output !== 'object' || output === null) return err('no_verdict');
  const { result, fail_kind: failKind, notes, progress } = output as VerdictOutput;
  const kind = ctx.world.registry.kinds.find(({ id }) => id === quest.kind);
  const parsed = VerdictSchema.safeParse({
    version: 1,
    id: verdictIdOf(quest, run.n),
    quest_id: quest.id,
    attempt: run.n,
    verifier_id: run.verifier,
    ritual: kind?.ritual,
    // The machine checks come with P1-07 (runChecks).
    checks: [],
    result,
    ...(failKind === undefined ? {} : { fail_kind: failKind }),
    ...(notes === undefined ? {} : { notes }),
    ...(progress === undefined ? {} : { progress }),
    by_human: false,
    session_id: run.session_id,
    created_at: ctx.record.stamp(),
  });
  return parsed.success ? ok(parsed.data) : err('invalid_verdict');
}
