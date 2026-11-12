// The gazetteer's freshness (PS-21): a gazetteer may say on its first line the commit it was written at, as
// `<!-- elvaria:commit <sha> -->`. The Steward counts the commits since then that touched each top-level folder
// (plot/drift.ts), and the prompt says so after the gazetteer, so a character reads an old description of a folder
// that moved since as the hint it is, not as the truth. The stamp is for the machine and leaves the quoted text; a
// gazetteer without one reaches the prompt exactly as before.
import type { Drift } from '../plot/drift.ts';

const STAMP = /^<!--\s*elvaria:commit\s+([0-9a-f]{7,64})\s*-->\s*$/i;
/** Enough of a commit id to find it, as git prints it short. */
const COMMIT_SHOWN = 12;

/** The commit a gazetteer was written at, from its first line; undefined without a stamp. */
export function gazetteerStampOf(text: string): string | undefined {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  return STAMP.exec(first.trim())?.[1]?.toLowerCase();
}

const touched = (count: number, folder: string, first: boolean): string =>
  `${count}${first ? (count === 1 ? ' commit' : ' commits') : ''} touched \`${folder}/\``;

/** The sentence after the gazetteer; empty when no folder moved. The most touched folder first. */
export function driftNote(stamp: string, drift: Drift): string {
  const moved = Object.entries(drift)
    .filter(([, count]) => count > 0)
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
  if (moved.length === 0) return '';
  const parts = moved.map(([folder, count], index) => touched(count, folder, index === 0));
  return `Since this gazetteer was written at \`${stamp.slice(0, COMMIT_SHOWN)}\`, ${parts.join(', ')}: check what it says of them against the code.`;
}

/**
 * The gazetteer as the prompt quotes it: unchanged without a stamp; else without its stamp line, and with the note
 * when `drift` names a folder that moved (null: git could not say, no note).
 */
export function gazetteerWithDrift(text: string, drift: Drift | null): string {
  const stamp = gazetteerStampOf(text);
  if (stamp === undefined) return text;
  const body = text.replace(/^[^\n]*(?:\r?\n|$)/, '');
  const note = drift === null ? '' : driftNote(stamp, drift);
  return note === '' ? body : `${body.trimEnd()}\n\n${note}\n`;
}
