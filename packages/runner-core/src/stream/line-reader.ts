// The frame of a reader of a CLI's stream, one JSON object a line (Codex's `exec --json`, agy's stream-json): lines
// that are not an object are skipped, each object goes to the adapter's `lineOf`, which tallies what it saw and says
// what the Steward should hear; `state` is the tally as the session reads it. Also the splitter for a stream that
// comes in chunks, such as stderr. One copy for every adapter (AH-09).
import { parseJsonLine } from './json.ts';
import type { RunnerSignal } from '../runner/types.ts';
import type { JsonObject } from './json.ts';

export interface StreamReader<S> {
  /** One stdout line; returns what the Steward should hear about it. Lines that are not JSON are skipped. */
  read(line: string): RunnerSignal[];
  readonly state: S;
}

/** A reader over `tally`, which `lineOf` updates line by line and `stateOf` shows. */
export function streamReaderOf<T, S>(
  tally: T,
  lineOf: (tally: T, value: JsonObject) => RunnerSignal[],
  stateOf: (tally: T) => S,
): StreamReader<S> {
  return {
    read: (line) => {
      const value = parseJsonLine(line);
      return value === undefined ? [] : lineOf(tally, value);
    },
    get state() {
      return stateOf(tally);
    },
  };
}

/** Whole lines out of chunks, `\n` or `\r\n`; `end()` gives the last one that had no newline. */
export function lineSplitter(onLine: (line: string) => void): { push(chunk: string): void; end(): void } {
  let rest = '';
  return {
    push(chunk) {
      const lines = (rest + chunk).split(/\r?\n/);
      rest = lines.pop() ?? '';
      lines.forEach(onLine);
    },
    end() {
      if (rest !== '') onLine(rest);
      rest = '';
    },
  };
}
