import { describe, expect, it } from 'vitest';

import { textOf } from './json.ts';
import { lineSplitter, streamReaderOf } from './line-reader.ts';

describe('streamReaderOf', () => {
  it('hands each object line to the adapter and shows its tally', () => {
    const reader = streamReaderOf(
      { said: [] as string[] },
      (tally, value) => {
        const text = textOf(value, 'text');
        if (text === undefined) return [];
        tally.said.push(text);
        return [{ kind: 'text', text }];
      },
      (tally) => tally.said.length,
    );
    expect(reader.read('{"text":"one"}')).toEqual([{ kind: 'text', text: 'one' }]);
    expect(reader.read('not json')).toEqual([]);
    expect(reader.read('[{"text":"no"}]')).toEqual([]);
    expect(reader.read('{"other":1}')).toEqual([]);
    expect(reader.read('{"text":"two"}')).toEqual([{ kind: 'text', text: 'two' }]);
    expect(reader.state).toBe(2);
  });
});

describe('lineSplitter', () => {
  it('splits chunks into whole lines, the last one at the end', () => {
    const lines: string[] = [];
    const splitter = lineSplitter((line) => lines.push(line));
    splitter.push('one\r\ntw');
    splitter.push('o\nthr');
    splitter.end();
    splitter.end();
    expect(lines).toEqual(['one', 'two', 'thr']);
  });
});
