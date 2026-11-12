// The Steward's loop (implementation-plan §3.1): a tick every dispatch.tick_seconds, or at once when work outside the
// tick ended (P1-10b). Apart from steward.ts since PS-03.
import type { State } from './steward-state.ts';
import type { StewardDeps, TickReport } from './types.ts';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * The loop's next tick in `ms`; each tick schedules the one after it when it ends, a beat later, or at once when work
 * outside the tick ended meanwhile, until stop() clears the beat.
 */
export function loop(deps: StewardDeps, state: State, tick: () => Promise<TickReport>, ms: number): void {
  state.timer = setTimeout(() => {
    state.timer = undefined;
    state.woken = false;
    const again = (): void => {
      if (state.beat !== undefined) loop(deps, state, tick, state.woken ? 0 : state.beat);
    };
    tick().then(again, (error: unknown) => {
      deps.log.warn(`steward: tick failed: ${messageOf(error)}`);
      again();
    });
  }, ms);
}

/**
 * Checks or a script ended outside the tick (P1-10b): the loop ticks now, or right after the tick in progress, so
 * a judge opens on checks that ended without waiting up to `tick_seconds` more. Many ends at once make one tick.
 */
export function wake(deps: StewardDeps, state: State, tick: () => Promise<TickReport>): void {
  if (state.beat === undefined) return;
  if (state.timer === undefined) {
    state.woken = true;
    return;
  }
  clearTimeout(state.timer);
  loop(deps, state, tick, 0);
}
