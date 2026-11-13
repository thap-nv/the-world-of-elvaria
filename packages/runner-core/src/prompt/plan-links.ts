// The judge of a plan quest reads which sub-quests, free to run at once with scopes apart, the code graph links
// (planLinksOf, PS-21b): a warning in its review, never a fail. A plan without such a pair, or a territory without a
// graph, gets no block, and the review reads as before.
import { fill } from './templates.ts';
import type { PromptTemplates } from './templates.ts';
import type { PlanLink } from '@elvaria/domain';

const linkLine = ({ ref, other, from, to, count }: PlanLink): string => {
  const rest = count > 1 ? `, and ${count - 1} more ${count === 2 ? 'link' : 'links'} between them` : '';
  return `- \`${ref}\` and \`${other}\`: \`${from}\` (${ref}) uses \`${to}\` (${other})${rest}`;
};

/** The review's section on linked sub-quests (plan-links.md); empty when there are none. */
export function planLinksBlock(links: readonly PlanLink[] | undefined, t: PromptTemplates): string {
  if (links === undefined || links.length === 0) return '';
  return fill(t['plan-links'], { links: links.map(linkLine).join('\n') });
}
