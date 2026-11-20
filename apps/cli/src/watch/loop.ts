// The terminal never enters raw mode or hides its cursor, so cleanup needs no terminal escape sequence.
export interface WatchRuntime {
  readonly isTTY: boolean;
  readonly setInterval: (refresh: () => void, ms: number) => ReturnType<typeof setInterval>;
  readonly clearInterval: (timer: ReturnType<typeof setInterval>) => void;
  readonly onInterrupt: (stop: () => void) => void;
  readonly offInterrupt: (stop: () => void) => void;
  readonly now: () => number;
}

/** Serial refreshes avoid stale output if disk reads take longer than the interval. */
export async function watchLoop(
  render: () => Promise<string>,
  out: (text: string) => void,
  intervalMs: number,
  runtime: WatchRuntime,
): Promise<void> {
  if (!runtime.isTTY) {
    out(await render());
    return;
  }
  const state = { stopped: false, busy: false };
  const isStopped = () => state.stopped;
  let pending: Promise<void> = Promise.resolve();
  let failure: Error | undefined;
  let stop = () => {
    state.stopped = true;
  };
  const ended = new Promise<void>((resolve) => {
    stop = () => {
      state.stopped = true;
      resolve();
    };
  });
  const refresh = async () => {
    if (state.busy || state.stopped) return;
    state.busy = true;
    try {
      const text = await render();
      if (!isStopped()) out(`\u001b[2J\u001b[H${text}`);
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
      stop();
    } finally {
      state.busy = false;
    }
  };
  runtime.onInterrupt(stop);
  const maxDelay = 2_147_483_647;
  let refreshedAt = runtime.now();
  const timer = runtime.setInterval(
    () => {
      if (state.busy || state.stopped || runtime.now() - refreshedAt < intervalMs) return;
      refreshedAt = runtime.now();
      pending = refresh();
    },
    Math.min(intervalMs, maxDelay),
  );
  try {
    pending = refresh();
    await ended;
  } finally {
    runtime.clearInterval(timer);
    runtime.offInterrupt(stop);
    await pending;
  }
  if (failure !== undefined) throw failure;
}
