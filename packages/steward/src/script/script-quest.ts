// The script tier (implementation-plan §2.5, §3.12, ADR 0017): `open → claimed (no assignee) → working → review →
// done | awaiting_seal`, with no model, no secret and mana 0. A tick claims and starts the quest, and the catalog
// script runs in the plot outside the tick (P1-25, background.ts); its output waits beside its log, and a tick after
// it ended judges from that: a result goes to review and gets the verdict its contract gives; a script past its time
// trips the time breaker; a script that broke, or could not use the quest's params, goes to the infirmary at once
// (Elvaria's fault or the data's, never a character's).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  currentRun,
  err,
  ok,
  runDirOf,
  scriptCheckId,
  scriptOutcomeOf,
  scriptVerdictOf,
} from '@elvaria/domain';
import type {
  CatalogScript,
  Quest,
  QuestId,
  Result,
  ScriptOutcome,
  ScriptResult,
  Territory,
} from '@elvaria/domain';
import { inKingdom, kingdomLayout } from '@elvaria/store';

import { moveAndRing } from '../notices.ts';
import { STEWARD } from '../record.ts';
import { VERDICT_EVENT, moveOnVerdict, recordVerdict, ritualOf } from '../verdicts.ts';
import { openFollowUp, unitsHandedTo } from './follow-up.ts';
import { nodeScriptRunner } from './run-script.ts';
import type { Context } from '../context.ts';
import type { ScriptRequest, ScriptRunResult } from './run-script.ts';

const MS_PER_MINUTE = 60_000;
const JSON_INDENT = 2;
/** Beside the run's other files, `.runs/<quest>-<n>/`: what the owner reads, and what a verdict is made from. */
export const SCRIPT_LOG = 'script.log';
export const SCRIPT_RUN = 'script.json';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

interface Parts {
  readonly quest: Quest;
  readonly territory: Territory;
  readonly script: CatalogScript;
}

function partsOf(ctx: Context, questId: QuestId): Result<Parts, string> {
  const quest = ctx.world.quests.get(questId);
  if (quest === undefined) return err('unknown_quest');
  const territory = ctx.world.territories.get(quest.territory);
  if (territory === undefined) return err('unknown_territory');
  const script = ctx.world.registry.scripts.find(({ id }) => id === quest.script?.id);
  return script === undefined ? err('unknown_script') : ok({ quest, territory, script });
}

/** The run folder of run `n`: relative to the kingdom for the files the quest names, native for writing. */
function runFilesOf(ctx: Context, quest: Quest, n: number) {
  const dir = runDirOf(quest, n, 'assignee');
  return { dir, native: inKingdom(ctx.root, dir), log: `${dir}/${SCRIPT_LOG}`, run: `${dir}/${SCRIPT_RUN}` };
}

async function readRun(ctx: Context, file: string): Promise<ScriptRunResult | undefined> {
  try {
    return JSON.parse(await readFile(inKingdom(ctx.root, file), 'utf8')) as ScriptRunResult;
  } catch {
    return undefined;
  }
}

/**
 * The machine's verdict on the run, written and weighed like a judge's (verdicts.ts). A fail ends in the infirmary,
 * after the follow-up its catalog entry names is open (P1-17): the reason names it, the open units point at it.
 */
async function verdictOn(ctx: Context, parts: Parts, result: ScriptResult, duration: number) {
  const { quest, script } = parts;
  const n = currentRun(quest);
  const ritual = ritualOf(ctx, quest);
  if (ritual === undefined) return err('unknown_ritual');
  const made = scriptVerdictOf({
    quest,
    n,
    ritual: ritual.id,
    script,
    result,
    duration_ms: duration,
    log_path: runFilesOf(ctx, quest, n).log,
    at: ctx.record.stamp(),
  });
  if (!made.ok) return err(made.error.code);
  const written = await recordVerdict(ctx, quest, made.value, STEWARD);
  if (!written.ok) return written;
  const verdict = written.value.result === 'pass' ? 'pass' : 'fail';
  const followUp = verdict === 'fail' ? await openFollowUp(ctx, quest, script, written.value) : undefined;
  const handed = followUp === undefined ? {} : unitsHandedTo(quest, followUp);
  const opened = followUp === undefined ? {} : { follow_up: followUp };
  return moveOnVerdict(
    ctx,
    quest,
    { ...written.value, result: verdict },
    {
      event: { type: VERDICT_EVENT[verdict] },
      actor: 'steward',
      before: { checks_run: [scriptCheckId(script.id)], ...handed },
      infirmary: { trip: 'script_fail', detail: { script: script.id, ...opened } },
    },
  );
}

/** A run with no result: its time ran out (the time breaker), or the script broke or refused the quest. */
function fall(
  ctx: Context,
  quest: Quest,
  outcome: Exclude<ScriptOutcome, ScriptResult>,
  script: CatalogScript,
) {
  if (outcome.kind === 'timeout') {
    const message = `the script ran past ${script.timeout_minutes} minutes`;
    const event = { type: 'breaker', trip: 'time' } as const;
    const infirmary = { trip: 'time', detail: { message, script: script.id } } as const;
    return moveAndRing(ctx, { quest: quest.id, event, actor: 'steward', infirmary });
  }
  const infirmary = {
    trip: SCRIPT_TRIPS[outcome.kind],
    detail: { message: outcome.detail, script: script.id },
  };
  return moveAndRing(ctx, { quest: quest.id, event: { type: 'crash' }, actor: 'steward', infirmary });
}

/** The infirmary trip of a run that broke or could not use the quest's params (P1-32). */
const SCRIPT_TRIPS = { broken: 'script_broken', usage: 'script_usage' } as const;

/**
 * Judges the current run of a script-tier quest from its saved output (`TickPlan.script_verdicts`): a run that ended
 * outside the tick, or one a Steward stopped in the middle of.
 */
export async function judgeScript(ctx: Context, questId: QuestId): Promise<Result<Quest, string>> {
  const parts = partsOf(ctx, questId);
  if (!parts.ok) return parts;
  const { quest, script } = parts.value;
  const saved = await readRun(ctx, runFilesOf(ctx, quest, currentRun(quest)).run);
  if (quest.status === 'review') {
    const outcome = saved === undefined ? undefined : scriptOutcomeOf(script.produces, saved);
    const result: ScriptResult =
      outcome?.kind === 'result'
        ? outcome
        : {
            kind: 'result',
            pass: false,
            summary: 'The output of this run is lost: the Steward stopped before its verdict.',
          };
    return verdictOn(ctx, parts.value, result, saved?.duration_ms ?? 0);
  }
  if (saved === undefined) return runAgain(ctx, quest.id);
  const outcome = scriptOutcomeOf(script.produces, saved);
  if (outcome.kind !== 'result') return fall(ctx, quest, outcome, script);
  const units = outcome.units === undefined ? {} : { units: [...outcome.units] };
  const submitted = await moveAndRing(ctx, {
    quest: quest.id,
    event: { type: 'submit' },
    actor: 'steward',
    before: units,
  });
  if (!submitted.ok) return submitted;
  return verdictOn(ctx, { ...parts.value, quest: submitted.value }, outcome, saved.duration_ms);
}

/** The script's request: the catalog file, the quest's params, and what the Steward knows that the quest may not say. */
async function requestOf(ctx: Context, parts: Parts, cwd: string, runDir: string): Promise<ScriptRequest> {
  const checks = await ctx.deps.plots.scriptChecks(parts.territory);
  return {
    file: inKingdom(ctx.root, kingdomLayout.registryEntry(parts.script.entry)),
    params: parts.quest.script?.params ?? {},
    context: { run_dir: runDir, checks },
    cwd,
    env: ctx.deps.env,
    timeout_ms: parts.script.timeout_minutes * MS_PER_MINUTE,
  };
}

async function save(native: string, run: ScriptRunResult): Promise<void> {
  const log = `${run.stdout}\n${run.stderr === '' ? '' : `\n${run.stderr}`}`;
  await writeFile(path.join(native, SCRIPT_LOG), log, 'utf8');
  await writeFile(path.join(native, SCRIPT_RUN), `${JSON.stringify(run, null, JSON_INDENT)}\n`, 'utf8');
}

/** The plot, or the claim given back: the quest stays open for a later tick, as a session's plot would (P1-09). */
async function plotOf(ctx: Context, parts: Parts) {
  try {
    return ok(await ctx.deps.plots.prepare(parts.quest, parts.territory));
  } catch (error) {
    ctx.deps.log.warn(`steward: ${parts.quest.id}: no plot for its script: ${messageOf(error)}`);
    await moveAndRing(ctx, { quest: parts.quest.id, event: { type: 'release' }, actor: 'steward' });
    return err('plot_failed');
  }
}

/**
 * Claims an open script-tier quest and starts its script outside the tick (step 6 of §3.1, §3.12, P1-25): the output
 * of a run that ended goes beside its log for judgeScript; a run the Steward cut short leaves none, and the quest
 * opens again to run anew.
 */
export async function runScriptQuest(ctx: Context, questId: QuestId): Promise<Result<Quest, string>> {
  const found = partsOf(ctx, questId);
  if (!found.ok) return found;
  const claim = { type: 'claim', assignee: null } as const;
  const claimed = await moveAndRing(ctx, { quest: questId, event: claim, actor: 'steward' });
  if (!claimed.ok) return claimed;
  const parts = { ...found.value, quest: claimed.value };
  const prepared = await plotOf(ctx, parts);
  if (!prepared.ok) return prepared;
  const { plot, cwd } = prepared.value;
  const started = await moveAndRing(ctx, {
    quest: questId,
    event: { type: 'start' },
    actor: 'steward',
    before: { plot },
  });
  if (!started.ok) return started;
  const n = currentRun(started.value);
  const files = runFilesOf(ctx, started.value, n);
  await mkdir(files.native, { recursive: true });
  const runner = ctx.deps.scripts ?? nodeScriptRunner();
  const request = await requestOf(ctx, { ...parts, quest: started.value }, cwd, files.native);
  ctx.background.script(questId, n, async (signal) => {
    const run = await runner({ ...request, signal });
    // Nothing may be read from a run cut short: without its output, the quest opens again and runs anew.
    if (!run.stopped) await save(files.native, run);
  });
  return started;
}

/**
 * A run that says nothing (§2.5 `working.release.script`, P1-17): the Steward stopped under it, or a Steward that died
 * left it without output. Its entry ends `cancelled` and the quest is open again: the next tick runs it anew.
 */
function runAgain(ctx: Context, questId: QuestId): Promise<Result<Quest, string>> {
  ctx.deps.log.warn(
    `steward: ${questId}: its script left no output (the Steward stopped under it); it runs again`,
  );
  return moveAndRing(ctx, { quest: questId, event: { type: 'release' }, actor: 'steward' });
}
