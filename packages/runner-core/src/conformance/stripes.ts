// The test image of the vision spike (docs/spikes/vision-2026-11-17.md §7, kept for PS-11b by the owner): a PNG of
// four vertical stripes in random order, with Node alone. A model that guesses names the right order once in 840, so
// the conformance suite's `image` check tells a session that read the image from one that only says it did. The
// generator is the spike's, types added; its command-line part is left out. stripesOf is the fake CLIs' "eyes".
import { randomBytes, randomInt } from 'node:crypto';
import { crc32, deflateSync, inflateSync } from 'node:zlib';

export const COLORS = {
  red: [224, 0, 0],
  green: [0, 160, 0],
  blue: [0, 64, 255],
  yellow: [255, 224, 0],
  black: [0, 0, 0],
  orange: [255, 128, 0],
  purple: [128, 0, 192],
} as const satisfies Readonly<Record<string, readonly [number, number, number]>>;
export type StripeColor = keyof typeof COLORS;

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const CHUNK_HEAD = 8;
const CHUNK_TAIL = 4;

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

/** RGB, 8 bits a channel: the stripes on `stripeRows` rows, then `noiseRows` of random bytes (they do not compress). */
export function stripesPng(
  colors: readonly StripeColor[],
  width: number,
  stripeRows: number,
  noiseRows = 0,
): Buffer {
  const rowLength = 1 + width * 3; // filter byte 0, then RGB
  const raw = Buffer.alloc(rowLength * (stripeRows + noiseRows));
  const stripe = Buffer.alloc(rowLength);
  for (let x = 0; x < width; x++)
    stripe.set(COLORS[colors[Math.floor((x * colors.length) / width)] ?? 'black'], 1 + x * 3);
  for (let y = 0; y < stripeRows; y++) stripe.copy(raw, y * rowLength);
  for (let y = stripeRows; y < stripeRows + noiseRows; y++)
    randomBytes(rowLength - 1).copy(raw, y * rowLength + 1);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(stripeRows + noiseRows, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  return Buffer.concat([
    Buffer.from(PNG_SIGNATURE),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Four of the seven colours in random order: 840 orders, so a guess is right once in 840. */
export function randomColors(count = 4): StripeColor[] {
  const pool = Object.keys(COLORS) as StripeColor[];
  return Array.from({ length: count }, () => pool.splice(randomInt(pool.length), 1)[0] ?? 'black');
}

/** The chunks of a PNG by type, IDAT joined; undefined when `png` does not start as one. */
function chunksOf(png: Buffer): { header?: Buffer; data: Buffer } | undefined {
  if (!png.subarray(0, PNG_SIGNATURE.length).equals(Buffer.from(PNG_SIGNATURE))) return undefined;
  let header: Buffer | undefined;
  const data: Buffer[] = [];
  for (let at = PNG_SIGNATURE.length; at + CHUNK_HEAD <= png.length;) {
    const length = png.readUInt32BE(at);
    const type = png.toString('ascii', at + 4, at + CHUNK_HEAD);
    const body = png.subarray(at + CHUNK_HEAD, at + CHUNK_HEAD + length);
    if (type === 'IHDR') header = body;
    if (type === 'IDAT') data.push(body);
    at += CHUNK_HEAD + length + CHUNK_TAIL;
  }
  return { ...(header === undefined ? {} : { header }), data: Buffer.concat(data) };
}

/**
 * The colours of the stripes of a PNG stripesPng made, left to right, read from its first row; undefined for any
 * other image. What a fake CLI "sees" when its gates let it open the conformance suite's image.
 */
export function stripesOf(png: Buffer, count = 4): StripeColor[] | undefined {
  const chunks = chunksOf(png);
  const header = chunks?.header;
  if (chunks === undefined || header?.[9] !== 2) return undefined;
  const width = header.readUInt32BE(0);
  const row = inflateSync(chunks.data).subarray(1, 1 + width * 3);
  const names = Object.keys(COLORS) as StripeColor[];
  const colors = Array.from({ length: count }, (_, index) => {
    const x = Math.floor(((index + 0.5) * width) / count);
    const pixel = [...row.subarray(x * 3, x * 3 + 3)];
    return names.find((name) => COLORS[name].every((value, channel) => value === pixel[channel]));
  });
  return colors.every((color) => color !== undefined) ? colors : undefined;
}
