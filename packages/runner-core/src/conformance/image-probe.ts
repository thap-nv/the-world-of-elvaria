// The image probe of the conformance suite (`image`, PS-11b): a judge whose policy opens one PNG of four stripes in
// colours of random order (stripes.ts), outside its plot where the Steward keeps a review's screens
// (`.runs/<quest>-<n>/screens/`), names the colours from left to right. A session that cannot open the image says so
// instead of guessing. The image is read with the CLI's own tool, never put in the prompt (owner's (Q4)).
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { SCREENS_FOLDER } from '../checks/screens.ts';
import { COLORS, randomColors, stripesOf, stripesPng } from './stripes.ts';
import type { StripeColor } from './stripes.ts';

export const FAKE_IMAGE_FILE = 'stripes.png';
/** A few kilobytes, far inside every ceiling (SCREEN_*), as the spike's 640×360 images of case D. */
const IMAGE_WIDTH = 640;
const IMAGE_ROWS = 360;

/** What the judge answers: strict enough for Codex's structured output (every key required, closed object). */
export const FAKE_IMAGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['opened', 'colors'],
  properties: {
    opened: { type: 'boolean' },
    colors: { type: 'array', items: { enum: Object.keys(COLORS) } },
  },
} as const;

/** Where the probe's image lies: the run folder's screens, as a review's; native. */
export const fakeImagePath = (runDir: string): string => path.join(runDir, SCREENS_FOLDER, FAKE_IMAGE_FILE);

/** For a fake CLI: the image of its session, from the context env every adapter hands its CLI. */
export function fakeImageOf(env: Readonly<Record<string, string | undefined>>): string | undefined {
  const { ELVARIA_KINGDOM: kingdom, ELVARIA_QUEST: quest, ELVARIA_ATTEMPT: attempt } = env;
  if (kingdom === undefined || quest === undefined || attempt === undefined) return undefined;
  return fakeImagePath(path.join(kingdom, '.runs', `${quest}-${attempt}`));
}

/** Writes the probe's image before the session; the colours it shows, left to right. */
export async function writeFakeImage(runDir: string): Promise<StripeColor[]> {
  const colors = randomColors();
  const file = fakeImagePath(runDir);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, stripesPng(colors, IMAGE_WIDTH, IMAGE_ROWS));
  return colors;
}

/** What the probe asks a judge, real or fake. */
export const fakeImageAsk = (file: string): string =>
  [
    `Open the image file ${file} with your own tool for reading files or viewing images; run no command on it.`,
    'It shows four vertical stripes of colour.',
    `Name their colours from left to right, each one of: ${Object.keys(COLORS).join(', ')}.`,
    'When you cannot open it, answer opened false and no colours: do not guess.',
  ].join(' ');

export interface FakeImageAnswer {
  readonly opened: boolean;
  readonly colors: readonly StripeColor[];
}

/** What a fake CLI answers: the stripes it "sees" once its gates let it open `file`; nothing when they do not. */
export function fakeImageAnswer(file: string | undefined, allowed: boolean): FakeImageAnswer {
  if (file === undefined || !allowed) return { opened: false, colors: [] };
  try {
    const colors = stripesOf(readFileSync(file));
    return colors === undefined ? { opened: false, colors: [] } : { opened: true, colors };
  } catch {
    return { opened: false, colors: [] };
  }
}
