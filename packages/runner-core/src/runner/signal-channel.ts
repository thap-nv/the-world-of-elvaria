// RunningSession.signals: the runner pushes signals as the CLI prints them, the Steward reads them with
// `for await`. One reader; what is pushed before it starts is kept, and close() ends its loop.

export interface SignalChannel<T> {
  push(value: T): void;
  /** Ends the iteration once the buffered values are read; later pushes are dropped. */
  close(): void;
  readonly iterable: AsyncIterable<T>;
}

export function createSignalChannel<T>(): SignalChannel<T> {
  // Boxed, so a value that is itself `undefined` is still told apart from an empty buffer.
  const buffered: { readonly value: T }[] = [];
  let waiting: ((result: IteratorResult<T, undefined>) => void) | undefined;
  let closed = false;

  const handOver = (result: IteratorResult<T, undefined>): boolean => {
    const reader = waiting;
    if (reader === undefined) return false;
    waiting = undefined;
    reader(result);
    return true;
  };

  const next = (): Promise<IteratorResult<T, undefined>> => {
    const box = buffered.shift();
    if (box !== undefined) return Promise.resolve({ done: false, value: box.value });
    if (closed) return Promise.resolve({ done: true, value: undefined });
    return new Promise((resolve) => {
      waiting = resolve;
    });
  };

  return {
    push(value) {
      if (closed) return;
      if (!handOver({ done: false, value })) buffered.push({ value });
    },
    close() {
      closed = true;
      handOver({ done: true, value: undefined });
    },
    iterable: { [Symbol.asyncIterator]: () => ({ next }) },
  };
}
