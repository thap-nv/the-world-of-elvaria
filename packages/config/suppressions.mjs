// The repo's eslint-suppressions.json lists the violations of the test-time rules (eslint-test-time.mjs) that are
// older than the rules (fix/test-guards, (196)), and the functions above `complexity` 15 from before that rule
// (AH-02, K9 of plans/architecture-health.md). ESLint itself fails a file with more violations than its count,
// and fails a count left higher than the violations until `eslint --prune-suppressions` lowers it, so a fixed test
// leaves the list. The checks here close the other ways in: running `eslint --suppress-rule` (or editing the file)
// to raise a count, add a file, or list another rule.

import { TEST_TIME_RULES } from './eslint-test-time.mjs';

/** @typedef {Record<string, Record<string, { count: number }>>} Suppressions */
/** Rule → the files it may be suppressed in. */
/** @typedef {Readonly<Record<string, (file: string) => boolean>>} SuppressibleRules */

export const SUPPRESSIONS_FILE = 'eslint-suppressions.json';

/** @param {string} file */
const isSpec = (file) => file.endsWith('.spec.ts');

/**
 * The rules the list may hold: the test-time rules in specs, `complexity` in any source file ESLint lints.
 * @type {SuppressibleRules}
 */
export const SUPPRESSIBLE_RULES = {
  ...Object.fromEntries(TEST_TIME_RULES.map((rule) => [rule, isSpec])),
  complexity: (file) => /.(?:ts|mjs|js)$/.test(file),
};

/**
 * @param {Suppressions} list
 * @param {string} rule
 */
const totalOf = (list, rule) =>
  Object.values(list).reduce((sum, rules) => sum + (rules[rule]?.count ?? 0), 0);

/**
 * How the list grew from `base` to `head`, one line per count that rose; empty when it only shrank. A file new to
 * the list counts only through its rule's total, so a renamed spec may take its old entry along. A rule no entry of
 * `base` holds is entering the list with its lint rule (`complexity` in AH-02): its old violations are the list.
 * @param {Suppressions} base
 * @param {Suppressions} head
 * @returns {string[]}
 */
export function suppressionGrowth(base, head) {
  const known = new Set(Object.values(base).flatMap((entry) => Object.keys(entry)));
  const rules = new Set(
    Object.values(head).flatMap((entry) => Object.keys(entry).filter((rule) => known.has(rule))),
  );
  const raised = Object.entries(head).flatMap(([file, entry]) =>
    Object.entries(entry).flatMap(([rule, { count }]) => {
      const before = base[file]?.[rule]?.count;
      return before !== undefined && count > before ? [`${file}: ${rule} ${before} → ${count}`] : [];
    }),
  );
  const totals = [...rules].flatMap((rule) => {
    const [before, after] = [totalOf(base, rule), totalOf(head, rule)];
    return after > before ? [`${rule}: ${before} → ${after} in all`] : [];
  });
  return [...raised, ...totals];
}

/**
 * Entries the list may not hold: a rule `rules` does not name, a file that kind of rule may not hold, or a file
 * that is gone (ESLint never lints a deleted file, so it cannot see that entry go stale).
 * @param {Suppressions} list
 * @param {SuppressibleRules} rules
 * @param {(file: string) => boolean} exists
 * @returns {string[]}
 */
export function strayEntries(list, rules, exists) {
  return Object.entries(list).flatMap(([file, entry]) => {
    const missing = exists(file) ? [] : [`${file}: not on disk`];
    const others = Object.keys(entry).flatMap((rule) => {
      const holds = rules[rule];
      if (holds === undefined) return [`${file}: ${rule} is not a rule the list may hold`];
      return holds(file) ? [] : [`${file}: ${rule} may not be suppressed in this file`];
    });
    return [...missing, ...others];
  });
}
