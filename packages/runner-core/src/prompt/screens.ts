// The judge's section on the screens of its review (screens.md, PS-11b): each screen the territory's checks captured,
// with its reference and difference image, by the native absolute path the judge's CLI opens; the policy opens exactly
// these (ToolPolicy.images). The images never go into the prompt (owner's (Q4)), so the length `review_prompts`
// measures does not grow with them.
import { fill } from './templates.ts';
import type { ScreenPair } from '../checks/screens.ts';
import type { PromptTemplates } from './templates.ts';

const lineOf = (label: string, file: string | undefined): string[] =>
  file === undefined ? [] : [`  - ${label}: \`${file}\``];

/** One list item a screen, its files below it; empty without screens. */
export function screensBlock(pairs: readonly ScreenPair[] | undefined, t: PromptTemplates): string {
  if (pairs === undefined || pairs.length === 0) return '';
  const listed = pairs.map((pair) =>
    [
      `- \`${pair.name}\``,
      ...lineOf('screen', pair.screen),
      ...lineOf('reference', pair.reference),
      ...lineOf('difference', pair.diff),
    ].join('\n'),
  );
  return fill(t.screens, { screens: listed.join('\n') });
}
