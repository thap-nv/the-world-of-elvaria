// Asking a tribe's account how much mana it has (implementation-plan §3.5, ADR 0009). After each session of an
// awake tribe the gauge is read again without a model call, in the background: the tick never waits for a CLI,
// and the next tick's mana step takes the windows in.
import type { TribeId } from '@elvaria/domain';
import type { AgentRunner, ProbeOptions, ProbeResult } from '@elvaria/runner-core';

import { nextRead } from './pools.ts';
import type { Context } from '../context.ts';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** A probe that throws (an adapter file, a CLI gone) is an error answer, never a failed tick. */
export async function probeOf(runner: AgentRunner, options: ProbeOptions): Promise<ProbeResult> {
  try {
    return await runner.probe(options);
  } catch (error) {
    return { status: 'error', detail: messageOf(error) };
  }
}

/** A read of the tribe's windows right after one of its sessions ended; it stands for this interval's read. */
export function readAfterSession(ctx: Context, tribe: TribeId): void {
  const runner = ctx.deps.runners[tribe];
  const { mana } = ctx;
  // A whole pool asleep is probed instead; only a model's cap asleep (P1-22) leaves the tribe read as usual.
  const probed = mana.asleep.some((pool) => pool.tribe === tribe && pool.model === undefined);
  if (runner === undefined || mana.reading.has(tribe) || probed) return;
  mana.readAt.set(tribe, nextRead(ctx));
  const read = probeOf(runner, { ping: false })
    .then(({ windows }) => {
      if (windows !== undefined) mana.heard.push({ tribe, windows });
    })
    .finally(() => mana.reading.delete(tribe));
  mana.reading.set(tribe, read);
}
