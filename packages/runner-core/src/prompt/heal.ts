// A healer's session and what its judge reads of it (ADR 0034, plans/healer.md 4.4): the healer reads why the
// territory's hooks refused the doer's finished work, which files that work staged and how much the Steward lets it
// change; the judge of the run reads heal.patch, the healer's change as the Steward measured it, beside the diff.
import { fenced, fill } from './templates.ts';
import type { PromptTemplates } from './templates.ts';

/** The most of heal.patch the judge's prompt copies (plans/healer.md 4.4); the diff holds the rest. */
export const HEAL_PATCH_MAX_LINES = 60;

/** What a healer's session is told of the heal it opens on. */
export interface HealBrief {
  /** The character whose finished work it mends: the quest's assignee, who stays its assignee. */
  readonly assignee: string;
  /** The infirmary reason code of the refused commit (`breaker:commit`, `breaker:commit_errors`). */
  readonly reason: string;
  /** The files the doer's work staged, relative to the plot with `/`: the only files the heal may change (K8). */
  readonly staged: readonly string[];
  /** kingdom.heal.max_files and max_lines; lines count added plus removed, as the Steward measures them. */
  readonly max_files: number;
  readonly max_lines: number;
}

/** What the judge reads of a heal: who mended the run's work and the change, from `.runs/<quest>-<n>/heal/`. */
export interface HealPatch {
  readonly healer: string;
  readonly patch: string;
}

const listed = (files: readonly string[]): string =>
  files.length === 0 ? '- (none)' : files.map((file) => `- \`${file}\``).join('\n');

/** The intro of a healer's continuation (heal.md), in place of revive.md; refused-commit.md follows with the log. */
export const healBlock = (heal: HealBrief, t: PromptTemplates): string =>
  fill(t.heal, {
    assignee: heal.assignee,
    reason: heal.reason,
    staged: listed(heal.staged),
    max_files: String(heal.max_files),
    max_lines: String(heal.max_lines),
  });

/** heal.patch within HEAL_PATCH_MAX_LINES lines, the cut said. */
function cutPatch(patch: string): string {
  const lines = patch.trimEnd().split(/\r?\n/u);
  if (lines.length <= HEAL_PATCH_MAX_LINES) return lines.join('\n');
  const left = lines.length - HEAL_PATCH_MAX_LINES;
  return [
    ...lines.slice(0, HEAL_PATCH_MAX_LINES),
    `… ${String(left)} more lines: the diff below has them`,
  ].join('\n');
}

/** The judge's section on the healer's change (heal-patch.md); empty for a run no healer mended. */
export function healPatchBlock(
  heal: HealPatch | null | undefined,
  assignee: string,
  t: PromptTemplates,
): string {
  if (heal === null || heal === undefined || heal.patch.trim() === '') return '';
  return fill(t['heal-patch'], {
    healer: heal.healer,
    assignee,
    patch: fenced(cutPatch(heal.patch), 'diff'),
  });
}
