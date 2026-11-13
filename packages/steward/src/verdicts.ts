// What a verdict does (implementation-plan §2.3, §2.6, §3.13): its file and its line, then one entry in the
// assignee's reputation window and in the window of each of the quest's tags, and the fail streak (withVerdict of
// the domain, which the sandbox uses too), then a new level when levelChange says the window has earned it. The
// judge's, the machine's and the owner's verdicts all go through here.
import { CharacterSchema, ritualOf as ritualIn, err, levelChange, ok, withVerdict } from '@elvaria/domain';
import type { Actor, Character, Quest, Result, Ritual, Verdict } from '@elvaria/domain';

import { moveAndRing } from './notices.ts';
import { describeIssue } from './world.ts';
import type { Context } from './context.ts';
import type { CharacterEdit, Move } from './record.ts';

/**
 * The assignee's windows after a pass or a fail on `quest`; the owner's seal or return weighs three (by_human), and
 * the owner's return for a new judgement (`rejudge`, P1-40) leaves them as they were, and a pass that sustains the
 * assignee's objection takes the verdict it overturned out of them (PS-22).
 */
export const judged =
  (quest: Quest, verdict: Judged): CharacterEdit =>
  (character, at) => {
    const base = { verdict_id: verdict.id, by_human: verdict.by_human, at, tags: quest.tags };
    const rejudge = verdict.rejudge === true ? { rejudge: true } : {};
    return ok(
      withVerdict(
        character,
        verdict.result === 'pass'
          ? {
              ...base,
              result: 'pass',
              ...(verdict.objection === undefined ? {} : { overturns: verdict.objection.verdict }),
            }
          : // The verdict schema requires fail_kind on a fail; `other` only stands in for a broken file.
            { ...base, result: 'fail', fail_kind: verdict.fail_kind ?? 'other', ...rejudge },
      ),
    );
  };

/**
 * The ritual that judges the quest (registry/kinds.json, rituals.json): its kind's, or the one its tags choose
 * (`ritual_overrides`, ADR 0022); its id and pass rule.
 */
export const ritualOf = (ctx: Context, quest: Quest): Ritual | undefined =>
  ritualIn(quest, ctx.world.registry);

/** Writes the verdict file, then its line (`verdict.pass|fail|partial`); a file the store refuses writes no line. */
export async function recordVerdict(
  ctx: Context,
  quest: Quest,
  verdict: Verdict,
  actor: Actor,
): Promise<Result<Verdict, string>> {
  const written = await ctx.deps.store.verdicts.write(verdict);
  if (!written.ok) return err(describeIssue(written.error));
  const data = {
    verdict: verdict.id,
    ...(verdict.fail_kind === undefined ? {} : { fail_kind: verdict.fail_kind }),
  };
  await ctx.record.note({
    type: `verdict.${verdict.result}`,
    actor,
    data,
    quest,
    session: verdict.session_id,
  });
  return ok(written.value);
}

/** A pass or a fail: what enters the assignee's windows. */
export type Judged = Verdict & { readonly result: 'pass' | 'fail' };

/** The quest's move on a judge's or the machine's verdict (§2.5). */
export const VERDICT_EVENT = { pass: 'verdict_pass', fail: 'verdict_fail' } as const;

/**
 * The quest's move on a verdict (`verdict_pass`/`verdict_fail` of a judge or the machine, the owner's `seal` or
 * `return`), the assignee's windows with it, then its level.
 */
export async function moveOnVerdict(
  ctx: Context,
  quest: Quest,
  verdict: Judged,
  move: Omit<Move, 'quest'>,
): Promise<Result<Quest, string>> {
  const assignee = typeof quest.assignee === 'string' ? quest.assignee : undefined;
  const edits = { ...move.edits, ...(assignee === undefined ? {} : { [assignee]: judged(quest, verdict) }) };
  const moved = await moveAndRing(ctx, { ...move, quest: quest.id, edits });
  const after = assignee === undefined ? undefined : ctx.world.characters.get(assignee);
  if (moved.ok && after !== undefined) await levelAfterVerdict(ctx, after);
  return moved;
}

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
