import { describe, expect, it } from 'vitest';

import { createSignalChannel } from './signal-channel.ts';

const readAll = async <T>(iterable: AsyncIterable<T>): Promise<T[]> => {
  const read: T[] = [];
  for await (const value of iterable) read.push(value);
  return read;
};

describe('createSignalChannel', () => {
  it('keeps what is pushed before the reader starts', async () => {
    const channel = createSignalChannel<number>();
    channel.push(1);
    channel.push(2);
    channel.close();
    expect(await readAll(channel.iterable)).toEqual([1, 2]);
  });

  it('hands a value to a waiting reader, and ends it on close', async () => {
    const channel = createSignalChannel<string>();
    const reading = readAll(channel.iterable);
    await Promise.resolve();
    channel.push('a');
    await Promise.resolve();
    channel.push('b');
    channel.close();
    expect(await reading).toEqual(['a', 'b']);
  });

  it('drops pushes after close and tells undefined values from an empty buffer', async () => {
    const channel = createSignalChannel<undefined | number>();
    channel.push(undefined);
    channel.close();
    channel.push(3);
    channel.close();
    expect(await readAll(channel.iterable)).toEqual([undefined]);
  });
});
