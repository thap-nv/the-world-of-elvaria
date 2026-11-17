import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { fakeImageAnswer, fakeImageOf, fakeImagePath, writeFakeImage } from './image-probe.ts';
import { COLORS, randomColors, stripesOf, stripesPng } from './stripes.ts';

const temp = await mkdtemp(path.join(tmpdir(), 'elvaria image probe '));
afterAll(() => rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));

describe('the stripes of the vision spike (§7)', () => {
  it('draws four of the seven colours, each once', () => {
    const colors = randomColors();
    expect(colors).toHaveLength(4);
    expect(new Set(colors).size).toBe(4);
    for (const color of colors) expect(Object.keys(COLORS)).toContain(color);
  });

  it('reads back the stripes it drew, left to right, noise below them or not', () => {
    expect(stripesOf(stripesPng(['purple', 'yellow', 'black', 'blue'], 1280, 72))).toEqual([
      'purple',
      'yellow',
      'black',
      'blue',
    ]);
    expect(stripesOf(stripesPng(['red', 'green', 'orange', 'blue'], 640, 10, 20))).toEqual([
      'red',
      'green',
      'orange',
      'blue',
    ]);
  });

  it('sees no stripes in what is not one of its images', () => {
    expect(stripesOf(Buffer.from('not a png, only text named .png'))).toBeUndefined();
    // Colours outside its palette: noise rows alone.
    expect(stripesOf(stripesPng([], 64, 0, 4))).toBeUndefined();
    // A PNG of another colour type (grey) than its own RGB.
    const grey = stripesPng(['red', 'red', 'red', 'red'], 8, 1);
    grey[8 + 8 + 9] = 0;
    expect(stripesOf(grey)).toBeUndefined();
  });
});

describe('the image probe (PS-11b)', () => {
  it('writes its image in the run folder screens and says what it shows', async () => {
    const runDir = path.join(temp, '.runs', 'q_20261107_c0nf0r-1');
    const colors = await writeFakeImage(runDir);
    const file = fakeImagePath(runDir);
    expect(stripesOf(await readFile(file))).toEqual(colors);
    const env = { ELVARIA_KINGDOM: temp, ELVARIA_QUEST: 'q_20261107_c0nf0r', ELVARIA_ATTEMPT: '1' };
    expect(fakeImageOf(env)).toBe(file);
    expect(fakeImageAnswer(file, true)).toEqual({ opened: true, colors });
  });

  it('opens nothing its gates refuse, or that is no image of stripes', async () => {
    const text = path.join(temp, 'text.png');
    await writeFile(text, 'not a png');
    expect(fakeImageOf({ ELVARIA_KINGDOM: temp })).toBeUndefined();
    expect(fakeImageAnswer(undefined, true)).toEqual({ opened: false, colors: [] });
    expect(fakeImageAnswer(text, false)).toEqual({ opened: false, colors: [] });
    expect(fakeImageAnswer(text, true)).toEqual({ opened: false, colors: [] });
    expect(fakeImageAnswer(path.join(temp, 'missing.png'), true)).toEqual({ opened: false, colors: [] });
  });
});
