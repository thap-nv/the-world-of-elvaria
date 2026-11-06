// Stands in for a root script whose tool a later task builds (implementation-plan §8, P0-01), so that
// `pnpm check` runs end to end from the first commit. It exits 0 but says plainly that nothing was checked:
// read the output, it is not a green check.
import { readFileSync } from 'node:fs';
import process from 'node:process';

const PLAN_PATH = 'docs/implementation-plan.md';
const PLAN_URL = new URL(`../${PLAN_PATH}`, import.meta.url);
const MAX_TITLE = 160;

/**
 * Title of a task row in the plan's §8 tables, as plain text.
 * @param {string} planText
 * @param {string} planItemId e.g. `P0-03`
 * @returns {string | undefined}
 */
export function findPlanItemTitle(planText, planItemId) {
  const row = planText.split(/\r?\n/).find((line) => line.startsWith(`| ${planItemId} |`));
  const cell = row?.split('|')[2]?.trim();
  if (cell === undefined || cell === '') return undefined;
  const plain = cell.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replaceAll('`', '');
  return plain.length > MAX_TITLE ? `${plain.slice(0, MAX_TITLE - 1)}…` : plain;
}

/**
 * @param {string | undefined} script the pnpm script that ran, from npm_lifecycle_event
 * @param {string} planItemId
 * @param {string} title
 */
export function notYetMessage(script, planItemId, title) {
  const name = script === undefined ? 'This script' : `pnpm ${script}`;
  return [
    `NOT YET: ${name} has no tool yet; nothing was checked.`,
    `  ${planItemId} builds it (${PLAN_PATH} §8): ${title}`,
  ].join('\n');
}

/**
 * @param {readonly string[]} args command-line arguments after the script path
 * @param {string | undefined} script
 * @returns {{ code: number; text: string }}
 */
export function run(args, script) {
  const planItemId = args[0];
  if (planItemId === undefined) return { code: 1, text: 'Usage: node scripts/not-yet.mjs <plan-item-id>' };
  const title = findPlanItemTitle(readFileSync(PLAN_URL, 'utf8'), planItemId);
  // A placeholder pointing at a task the plan does not have would hide the gap forever.
  if (title === undefined) return { code: 1, text: `not-yet: no task ${planItemId} in ${PLAN_PATH} §8` };
  return { code: 0, text: notYetMessage(script, planItemId, title) };
}

if (import.meta.main) {
  const { code, text } = run(process.argv.slice(2), process.env.npm_lifecycle_event);
  (code === 0 ? console.log : console.error)(text);
  process.exitCode = code;
}
