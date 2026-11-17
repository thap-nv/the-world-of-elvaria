// The screens a territory's checks capture for the judge (PS-11b; image contract (Q) of plans/phase-2-wave-0.md):
// every check of a round gets ELVARIA_SCREENS_DIR, the `screens/` folder of its run folder in the kingdom's `.runs/`.
// It lies outside the plot, so putting the plot back after the checks and after the judge never removes an image,
// and the images stay there as the evidence of the review. `<name>.png` is a screen, `<name>.ref.png` its reference,
// `<name>.diff.png` the difference between them; names in kebab-case. The core never knows where a design lives: the
// territory's check brings the references (ADR 0016).
import { mkdir, open, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { inKingdom } from '@elvaria/store';

import { SCREEN_EXTENSION, SCREEN_MAX_BYTES, SCREEN_MAX_FILES } from '../policy/constants.ts';

/** The variable every check of a round gets: the native path of the round's screens folder. */
export const SCREENS_ENV = 'ELVARIA_SCREENS_DIR';
export const SCREENS_FOLDER = 'screens';

/** `<run_dir>/screens`, portable and relative to the kingdom like the run folder. */
export const screensDirOf = (runDir: string): string => `${runDir}/${SCREENS_FOLDER}`;

/** One screen and what stands beside it; the paths are native and absolute, as the judge's CLI opens them. */
export interface ScreenPair {
  readonly name: string;
  readonly screen?: string;
  readonly reference?: string;
  readonly diff?: string;
}

export interface Screens {
  /** By name; only images that keep the contract, at most SCREEN_MAX_FILES of them in all. */
  readonly pairs: readonly ScreenPair[];
  /** Every image of `pairs`, in their order: what the judge's policy opens (ToolPolicy.images). */
  readonly files: readonly string[];
  /** What breaks the contract, one line each: the machine check `screens` fails on any. */
  readonly problems: readonly string[];
}

type Role = 'screen' | 'reference' | 'diff';

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MIB = 1024 * 1024;

/** `home.ref.png` → `home` as a reference; undefined for a name that is not `.png`. */
function roleOf(file: string): { name: string; role: Role } | undefined {
  if (!file.endsWith(SCREEN_EXTENSION)) return undefined;
  const base = file.slice(0, -SCREEN_EXTENSION.length);
  if (base.endsWith('.ref')) return { name: base.slice(0, -'.ref'.length), role: 'reference' };
  if (base.endsWith('.diff')) return { name: base.slice(0, -'.diff'.length), role: 'diff' };
  return { name: base, role: 'screen' };
}

/** The size of `file`, and whether it starts as a PNG does: a text file named `.png` is no image (spike, case B). */
async function headOf(file: string): Promise<{ size: number; png: boolean }> {
  const handle = await open(file, 'r');
  try {
    const head = Buffer.alloc(PNG_SIGNATURE.length);
    const { bytesRead } = await handle.read(head, 0, head.length, 0);
    return { size: (await handle.stat()).size, png: bytesRead === head.length && head.equals(PNG_SIGNATURE) };
  } finally {
    await handle.close();
  }
}

/** Why `entry` cannot be shown to the judge, or its name and role. */
async function imageOf(dir: string, entry: string): Promise<{ name: string; role: Role } | string> {
  const image = roleOf(entry);
  if (image === undefined) return `${entry}: not a ${SCREEN_EXTENSION} image, the only kind a judge reads`;
  if (!KEBAB.test(image.name)) return `${entry}: the name is not kebab-case`;
  const { size, png } = await headOf(path.join(dir, entry));
  if (!png) return `${entry}: not a PNG image (its first bytes are not PNG's)`;
  if (size > SCREEN_MAX_BYTES) {
    return `${entry}: ${(size / MIB).toFixed(1)} MiB, over the ceiling of ${SCREEN_MAX_BYTES / MIB} MiB an image`;
  }
  return image;
}

async function entriesOf(dir: string): Promise<{ files: string[]; others: string[] }> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const sorted = entries.sort((a, b) => a.name.localeCompare(b.name));
    return {
      files: sorted.filter((entry) => entry.isFile()).map(({ name }) => name),
      others: sorted.filter((entry) => !entry.isFile()).map(({ name }) => name),
    };
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return { files: [], others: [] };
    throw error;
  }
}

/** The pairs of the images that keep the contract, a reference or difference without its screen said as a problem. */
function pairsOf(dir: string, images: readonly { name: string; role: Role; file: string }[]) {
  const pairs = new Map<string, Record<string, string>>();
  for (const { name, role, file } of images)
    pairs.set(name, { ...pairs.get(name), [role]: path.join(dir, file) });
  const problems = [...pairs]
    .filter(([, pair]) => pair.screen === undefined)
    .map(
      ([name]) => `${name}: a reference or difference image without its screen ${name}${SCREEN_EXTENSION}`,
    );
  const whole = [...pairs].filter(([, pair]) => pair.screen !== undefined);
  return { pairs: whole.map(([name, pair]): ScreenPair => ({ name, ...pair })), problems };
}

/** The first SCREEN_MAX_FILES images of `pairs`, pair by pair. */
function capped(pairs: readonly ScreenPair[]): ScreenPair[] {
  const kept: ScreenPair[] = [];
  let count = 0;
  for (const pair of pairs) {
    const files = [pair.screen, pair.reference, pair.diff].filter((file) => file !== undefined);
    if (count + files.length > SCREEN_MAX_FILES) break;
    kept.push(pair);
    count += files.length;
  }
  return kept;
}

/** The images of run folder `runDir` (portable, relative to `kingdom`), in pairs, and what breaks the contract. */
export async function screensOf(kingdom: string, runDir: string): Promise<Screens> {
  const dir = inKingdom(kingdom, screensDirOf(runDir));
  const { files, others } = await entriesOf(dir);
  const problems = others.map((name) => `${name}: not a file`);
  const images: { name: string; role: Role; file: string }[] = [];
  for (const file of files) {
    const image = await imageOf(dir, file);
    if (typeof image === 'string') problems.push(image);
    else images.push({ ...image, file });
  }
  if (images.length > SCREEN_MAX_FILES) {
    problems.push(`${images.length} images, over the ceiling of ${SCREEN_MAX_FILES} a review`);
  }
  const paired = pairsOf(dir, images);
  const pairs = capped(paired.pairs);
  const shown = pairs.flatMap((pair) =>
    [pair.screen, pair.reference, pair.diff].filter((file) => file !== undefined),
  );
  return { pairs, files: shown, problems: [...problems, ...paired.problems] };
}

/** Empties the round's screens folder before its checks run, so no image of an earlier round reaches its judge. */
export async function clearScreens(kingdom: string, runDir: string): Promise<void> {
  const dir = inKingdom(kingdom, screensDirOf(runDir));
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  await mkdir(dir, { recursive: true });
}

/** The env a check gets beside its host's: the screens folder, made if missing (runCheck runs one check alone too). */
export async function screensEnvOf(kingdom: string, runDir: string): Promise<Record<string, string>> {
  const dir = inKingdom(kingdom, screensDirOf(runDir));
  await mkdir(dir, { recursive: true });
  return { [SCREENS_ENV]: dir };
}
