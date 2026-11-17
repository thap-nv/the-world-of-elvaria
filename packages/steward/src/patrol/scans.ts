// The patrol's scans (PS-26): each catalog script of `territory.patrol.scans`, one after another in the patrol's plot
// before it goes, the way a script-tier quest runs one (§3.12, ADR 0017): no shell, the minimal env, no secret, its
// tree killed at `timeout_minutes` or when the Steward stops. Its output goes to `.runs/patrol-<id>/scans/<id>.log`,
// written over at each run; what it found goes into `patrol.ran` (scanOf reads it by its `produces`).
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { scanOf } from '@elvaria/domain';
import type { PatrolRanData, Territory } from '@elvaria/domain';
import { patrolIdOf } from '@elvaria/runner-core';
import { inKingdom, kingdomLayout } from '@elvaria/store';

import { nodeScriptRunner } from '../script/run-script.ts';
import type { Context } from '../context.ts';
import type { ScriptRunResult } from '../script/run-script.ts';

const MS_PER_MINUTE = 60_000;

type PatrolScan = PatrolRanData['scans'][number];

async function writeLog(ctx: Context, territory: Territory, script: string, run: ScriptRunResult) {
  const file = inKingdom(ctx.root, `.runs/${patrolIdOf(territory.id)}/scans/${script}.log`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${run.stdout}\n${run.stderr}`.trim() + '\n');
}

/** The territory's scans in `cwd`, in order; none once the Steward stops. */
export async function scansIn(
  ctx: Context,
  territory: Territory,
  cwd: string,
  signal: AbortSignal,
): Promise<PatrolScan[]> {
  const runner = ctx.deps.scripts ?? nodeScriptRunner();
  const scans: PatrolScan[] = [];
  for (const scan of territory.patrol?.scans ?? []) {
    if (signal.aborted) break;
    const script = ctx.world.registry.scripts.find(({ id }) => id === scan.script);
    if (script === undefined) {
      scans.push(scanOf(scan.script, undefined, undefined));
      continue;
    }
    const run = await runner({
      file: inKingdom(ctx.root, kingdomLayout.registryEntry(script.entry)),
      params: scan.params,
      context: { run_dir: `.runs/${patrolIdOf(territory.id)}`, checks: [] },
      cwd,
      env: ctx.deps.env,
      timeout_ms: script.timeout_minutes * MS_PER_MINUTE,
      signal,
    });
    await writeLog(ctx, territory, script.id, run);
    scans.push(scanOf(scan.script, script.produces, run));
  }
  return scans;
}
