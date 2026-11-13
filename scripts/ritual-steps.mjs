// Brings the steps of one ritual of a kingdom's registry in line with the default registry, after a backup (PS-06,
// implementation-plan §3.16.6). `elvaria migrate` adds the registry entries a kingdom lacks but never changes one it
// has (phase 1.5 plan, "Điều code cho thấy" row 14), so a step added to a default ritual (check_plan_ready of
// council_review) does not reach a running kingdom by itself. Run it after `elvaria upgrade` to a build that knows
// the step: a build pinned before it refuses a registry whose ritual names a step it does not know.
//
//   node scripts/ritual-steps.mjs --kingdom <dir> --ritual council_review [--dry-run] [--force]
//
// It changes the steps only when the kingdom's are the default's with steps missing (the owner kept them in order);
// steps the owner changed otherwise are refused unless --force. The file is copied to
// `<kingdom>/.backup/<stamp>-ritual-steps/registry/rituals.json` first, then written whole through a file beside it.
import { copyFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

const DEFAULT_RITUALS = new URL('../packages/registry-default/rituals.json', import.meta.url);
const RITUALS_FILE = 'registry/rituals.json';

/**
 * @typedef {{ readonly id: string, readonly steps: readonly string[] }} Ritual
 * @typedef {{ readonly rituals: readonly Ritual[] }} RitualsFile
 * @typedef {{ status: 'missing' } | { status: 'same' | 'update' | 'refused', from: readonly string[], to: readonly string[] }} Change
 */

/** Whether `part` is `whole` with items left out, in the same order. */
function inOrderWithin(/** @type {readonly string[]} */ part, /** @type {readonly string[]} */ whole) {
  let at = 0;
  for (const item of whole) if (item === part[at]) at += 1;
  return at === part.length;
}

/**
 * What to do with ritual `id`: nothing, update its steps, or refuse because the owner changed them.
 * @param {RitualsFile} kingdom
 * @param {RitualsFile} defaults
 * @param {string} id
 * @param {boolean} force
 * @returns {Change}
 */
export function stepsChange(kingdom, defaults, id, force) {
  const own = kingdom.rituals.find((ritual) => ritual.id === id);
  const fresh = defaults.rituals.find((ritual) => ritual.id === id);
  if (own === undefined || fresh === undefined) return { status: 'missing' };
  const [from, to] = [own.steps, fresh.steps];
  if (from.join() === to.join()) return { status: 'same', from, to };
  return { status: force || inOrderWithin(from, to) ? 'update' : 'refused', from, to };
}

/** `YYYYMMDD-HHMMSS` of `now`, in UTC: a folder name that sorts by time. */
const stampOf = (/** @type {Date} */ now) =>
  now
    .toISOString()
    .replace(/\.\d+Z$/, '')
    .replaceAll(/[-:]/g, '')
    .replace('T', '-');

/**
 * Copies the kingdom's rituals.json into `.backup/`, then writes it with the new steps of `id` through a file beside it.
 * @param {string} kingdom
 * @param {RitualsFile} file
 * @param {string} id
 * @param {readonly string[]} steps
 * @param {Date} now
 * @returns {string} the backup's path
 */
function rewrite(kingdom, file, id, steps, now) {
  const target = path.join(kingdom, RITUALS_FILE);
  const backup = path.join(kingdom, '.backup', `${stampOf(now)}-ritual-steps`, RITUALS_FILE);
  mkdirSync(path.dirname(backup), { recursive: true });
  copyFileSync(target, backup);
  const rituals = file.rituals.map((ritual) =>
    ritual.id === id ? { ...ritual, steps: [...steps] } : ritual,
  );
  const temp = `${target}.tmp-${String(process.pid)}`;
  writeFileSync(temp, `${JSON.stringify({ ...file, rituals }, null, 2)}\n`);
  renameSync(temp, target);
  return backup;
}

/**
 * @param {readonly string[]} argv
 * @param {{ readonly out: (line: string) => void, readonly now: Date, readonly defaults?: URL | string }} io
 * @returns {number} the exit code
 */
export function main(argv, io) {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      kingdom: { type: 'string' },
      ritual: { type: 'string', default: 'council_review' },
      'dry-run': { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
    },
  });
  if (values.kingdom === undefined) {
    io.out('usage: node scripts/ritual-steps.mjs --kingdom <dir> [--ritual <id>] [--dry-run] [--force]');
    return 2;
  }
  const kingdom = path.resolve(values.kingdom);
  const id = values.ritual;
  /** @type {RitualsFile} */
  const file = JSON.parse(readFileSync(path.join(kingdom, RITUALS_FILE), 'utf8'));
  /** @type {RitualsFile} */
  const defaults = JSON.parse(readFileSync(io.defaults ?? DEFAULT_RITUALS, 'utf8'));
  const change = stepsChange(file, defaults, id, values.force);
  if (change.status === 'missing') {
    io.out(`${id}: no such ritual in the kingdom's registry or in the default one`);
    return 1;
  }
  io.out(`${id}: ${change.from.join(', ')}`);
  if (change.status === 'same') {
    io.out('  already the default steps; nothing to do');
    return 0;
  }
  io.out(`${change.status === 'refused' ? '  default:' : '  becomes:'} ${change.to.join(', ')}`);
  if (change.status === 'refused') {
    io.out('  the owner changed these steps otherwise; nothing written (--force replaces them)');
    return 1;
  }
  if (values['dry-run']) {
    io.out('  --dry-run: nothing written');
    return 0;
  }
  io.out(`  backup: ${rewrite(kingdom, file, id, change.to, io.now)}`);
  return 0;
}

if (import.meta.main) {
  process.exitCode = main(process.argv.slice(2), { out: (line) => console.log(line), now: new Date() });
}
