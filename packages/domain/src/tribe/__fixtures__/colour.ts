// Colour measures for the look pool's spec (PS-24): WCAG 2 contrast and CIEDE2000 distance, and the design system's
// tokens of one theme read from elvaria.css (vitest.config.mjs hands the text over, as for statusToneOf).

const channels = (hex: string): number[] =>
  [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255);
const linear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = channels(hex).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio of two colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [high = 0, low = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/** CIE L*a*b* under D65. */
function lab(hex: string): [number, number, number] {
  const [r = 0, g = 0, b = 0] = channels(hex).map(linear);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24_389 ? Math.cbrt(t) : ((24_389 / 27) * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

const RAD = Math.PI / 180;
const hueOf = (b: number, a: number): number =>
  a === 0 && b === 0 ? 0 : (Math.atan2(b, a) / RAD + 360) % 360;

/** CIEDE2000 colour difference (Sharma, Wu, Dalal 2005): about 2.3 is just noticeable. */
export function deltaE2000(one: string, two: string): number {
  const [l1, a1, b1] = lab(one);
  const [l2, a2, b2] = lab(two);
  const cMean = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const g = 0.5 * (1 - Math.sqrt(cMean ** 7 / (cMean ** 7 + 25 ** 7)));
  const [a1p, a2p] = [(1 + g) * a1, (1 + g) * a2];
  const [c1p, c2p] = [Math.hypot(a1p, b1), Math.hypot(a2p, b2)];
  const [h1p, h2p] = [hueOf(b1, a1p), hueOf(b2, a2p)];
  const chroma = c1p * c2p !== 0;
  let dh = chroma ? h2p - h1p : 0;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(c1p * c2p) * Math.sin((dh / 2) * RAD);
  const lMean = (l1 + l2) / 2;
  const cpMean = (c1p + c2p) / 2;
  let hMean = h1p + h2p;
  if (chroma) hMean = (Math.abs(h1p - h2p) > 180 ? hMean + (hMean < 360 ? 360 : -360) : hMean) / 2;
  const t =
    1 -
    0.17 * Math.cos((hMean - 30) * RAD) +
    0.24 * Math.cos(2 * hMean * RAD) +
    0.32 * Math.cos((3 * hMean + 6) * RAD) -
    0.2 * Math.cos((4 * hMean - 63) * RAD);
  const rc = 2 * Math.sqrt(cpMean ** 7 / (cpMean ** 7 + 25 ** 7));
  const sl = 1 + (0.015 * (lMean - 50) ** 2) / Math.sqrt(20 + (lMean - 50) ** 2);
  const sc = 1 + 0.045 * cpMean;
  const sh = 1 + 0.015 * cpMean * t;
  const rt = -Math.sin(2 * 30 * Math.exp(-(((hMean - 275) / 25) ** 2)) * RAD) * rc;
  const [dl, dc] = [(l2 - l1) / sl, (c2p - c1p) / sc];
  return Math.sqrt(dl ** 2 + dc ** 2 + (dH / sh) ** 2 + rt * dc * (dH / sh));
}

export const THEMES = ['night', 'day'] as const;
export type Theme = (typeof THEMES)[number];

/** The `--elv-*` colour tokens one theme sets: night is the default block, day the `[data-theme="day"]` one. */
export function tokensOf(css: string, theme: Theme): ReadonlyMap<string, string> {
  const day = css.indexOf('[data-theme="day"] {');
  const block = theme === 'day' ? css.slice(day, css.indexOf('}', day)) : css.slice(0, css.indexOf('}'));
  return new Map(
    [...block.matchAll(/--elv-([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)].map((m) => [m[1] ?? '', m[2] ?? '']),
  );
}
