// One run of the Temple (PS-12f, temple-first plan PS-12d; ADR 0027), as the Steward's job on call and `elvaria temple
// run` run it: the evidence pack, cut at the prompt ceiling of the Monk who speaks; with no group and no line to review,
// no model call. Else one session of the Monk (askTemple), its reply made one temple_report command of source `monk`
// (templeCommands) in the inbox, which the Steward applies at its next tick (ADR 0005). Then one `temple.ran` line, for
// a failed session too: its tokens count, and the Temple does not try again before its next trigger, where a session
// that keeps failing would otherwise open at every tick. None when the Steward stopped the session: the log still says
// the Temple is due, so the next start runs it again.
import { askTemple, templeIssueText } from '@elvaria/chancellor';
import type { ChancellorFailure, TempleFailure } from '@elvaria/chancellor';
import {
  evidenceIsEmpty,
  lessonVocabularyOf,
  promptMaxOf,
  shouldSkipTempleSession,
  templeCommands,
} from '@elvaria/domain';
import type {
  Event,
  EventData,
  TempleEvidence,
  TempleReportPayload,
  TempleTrigger,
  TribeHold,
} from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { readClassPrompt, readDecree } from '@elvaria/store';

import { recordTempleRan } from '../event/events.ts';
import { registryIssueLines, storeIssueLines } from '../issues.ts';
import { commandHeader } from '../quest/send-command.ts';
import { sessionOf } from '../say/hearing.ts';
import { evidenceHashOf } from './evidence-hash.ts';
import { evidenceOf } from './evidence.ts';
import { monkOf, structuredOf } from './monk.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { Runners } from '../say/hearing.ts';
import type { Monk, MonkWaits } from './monk.ts';

export type TempleRun =
  /** The registry or the scriptures could not be read: the reason is printed. */
  | { readonly status: 'unreadable' }
  | { readonly status: 'no_monk' }
  | { readonly status: 'held'; readonly holds: readonly TribeHold[] }
  | { readonly status: 'waiting' }
  /** Nothing to decide: no model was called, `temple.ran` is written. */
  | { readonly status: 'empty' }
  | { readonly status: 'unchanged' }
  /** The Steward stopped the session: nothing is written. */
  | { readonly status: 'stopped' }
  | { readonly status: 'failed'; readonly failure: ChancellorFailure; readonly run_dir: string }
  /** The command could not be written: the reason is printed. */
  | { readonly status: 'unwritten' }
  /** The report is in the inbox, or the Monk changed nothing (0 and 0). */
  | { readonly status: 'sent'; readonly operations: number; readonly letters: number };

export interface TempleOptions {
  readonly trigger: TempleTrigger;
  /** The kingdom's local day the run counts for. */
  readonly day: string;
  readonly waits: MonkWaits;
  /** Who runs it when no Monk speaks: the Steward's job, or the owner. */
  readonly actor: Event['actor'];
  readonly signal?: AbortSignal;
  /** Told who reads how many groups, once the session is about to start. */
  readonly onListening?: (name: string, evidence: TempleEvidence) => void;
}

type Ran = Pick<EventData<'temple.ran'>, 'operations' | 'letters'> & {
  readonly monk?: Monk;
  readonly spent?: Pick<TempleFailure, 'tokens' | 'session_ids'>;
};

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Writes the line; one that cannot be written is said, and what the run did stands. */
async function ran(ctx: KingdomContext, options: TempleOptions, evidence: TempleEvidence, done: Ran) {
  const { monk, spent } = done;
  const [session] = spent?.session_ids ?? [];
  const data: EventData<'temple.ran'> = {
    trigger: options.trigger,
    evidence_hash: evidenceHashOf(evidence),
    day: options.day,
    groups: evidence.groups.length,
    operations: done.operations,
    letters: done.letters,
    tokens: spent?.tokens ?? 0,
    ...(monk === undefined ? {} : { tribe: monk.character.tribe, model: monk.character.model }),
    ...(session === undefined ? {} : { session }),
  };
  const actor = monk === undefined ? options.actor : { kind: 'character' as const, id: monk.character.id };
  try {
    await recordTempleRan(ctx, actor, data);
  } catch (error) {
    ctx.io.err(ctx.t('cli.temple.run.unrecorded', { problem: messageOf(error) }));
  }
}

async function send(ctx: KingdomContext, payload: TempleReportPayload): Promise<boolean> {
  const header = { ...commandHeader(ctx), source: 'monk' as const };
  const written = await ctx.store.inbox.write({ ...header, kind: 'temple_report', payload });
  if (!written.ok) storeIssueLines(ctx.t, written.error).forEach(ctx.io.err);
  return written.ok;
}

/** The Monk's session on the pack, and what came of it. */
async function hearMonk(
  ctx: KingdomContext,
  monk: Monk,
  evidence: TempleEvidence,
  options: TempleOptions,
): Promise<TempleRun> {
  const registry = await ctx.store.loadRegistry();
  const territories = (await ctx.store.territories.list()).items;
  const choice = { character: monk.character, structured_output: structuredOf(monk.runner) };
  const session = await sessionOf(ctx, { choice, runner: monk.runner, class: monk.class }, 'temple');
  const context = {
    locale: ctx.kingdom.owner.locale,
    decree: await readDecree(ctx.store.root),
    class_prompt: await readClassPrompt(ctx.store.root, monk.class),
    trigger: options.trigger,
    evidence,
    vocabulary: lessonVocabularyOf(
      registry.ok ? registry.value : { classes: [], tags: [] },
      ctx.kingdom,
      territories,
    ),
  };
  options.onListening?.(monk.character.name, evidence);
  const answer = await askTemple(context, session, options.signal);
  if (!answer.ok && answer.error.failure.code === 'stopped') return { status: 'stopped' };
  const spent = answer.ok ? answer.value : answer.error;
  // The reply was held against the pack already (templeCheckOf): templeCommands finds no issue left.
  const made = answer.ok ? templeCommands(answer.value.reply, evidence, monk.character.id) : undefined;
  if (made?.ok !== true) {
    await ran(ctx, options, evidence, { operations: 0, letters: 0, monk, spent });
    const issues = made?.ok === false ? made.error.issues.map(templeIssueText) : [];
    const failure = answer.ok ? { code: 'invalid_reply' as const, issues } : answer.error.failure;
    return { status: 'failed', failure, run_dir: session.run_dir };
  }
  const payload = made.value;
  const sent = payload === null || (await send(ctx, payload));
  const count = { operations: payload?.operations.length ?? 0, letters: payload?.letters.length ?? 0 };
  await ran(ctx, options, evidence, { ...(sent ? count : { operations: 0, letters: 0 }), monk, spent });
  return sent ? { status: 'sent', ...count } : { status: 'unwritten' };
}

export async function runTemple(
  ctx: KingdomContext,
  runners: Runners,
  options: TempleOptions,
): Promise<TempleRun> {
  const registry = await ctx.store.loadRegistry();
  if (!registry.ok) {
    registry.error.flatMap((issue) => registryIssueLines(ctx.t, issue)).forEach(ctx.io.err);
    return { status: 'unreadable' };
  }
  const characters = (await ctx.store.characters.list()).items;
  const found = monkOf(registry.value, characters, runners, options.waits);
  if (found.status === 'none') return { status: 'no_monk' };
  if (found.status !== 'ready') return found;
  const { monk } = found;
  const evidence = await evidenceOf(ctx, () =>
    Promise.resolve(promptMaxOf(monk.runner.capabilities, ctx.io.platform)),
  );
  if (evidence === undefined) return { status: 'unreadable' };
  const { events } = await openEventLog(ctx.store.root).read();
  if (shouldSkipTempleSession({ trigger: options.trigger, evidenceHash: evidenceHashOf(evidence), events })) {
    await ran(ctx, options, evidence, { operations: 0, letters: 0 });
    return { status: 'unchanged' };
  }
  if (!evidenceIsEmpty(evidence)) return hearMonk(ctx, monk, evidence, options);
  await ran(ctx, options, evidence, { operations: 0, letters: 0 });
  return { status: 'empty' };
}
