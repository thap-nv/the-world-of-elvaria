// The repo's eslint-suppressions.json lists the violations of the test-time rules (eslint-test-time.mjs) that are
// older than the rules (fix/test-guards, (196)). ESLint itself fails a file with more violations than its count,
// and fails a count left higher than the violations until `eslint --prune-suppressions` lowers it, so a fixed test
// leaves the list. The checks here close the other ways in: running `eslint --suppress-rule` (or editing the file)
// to raise a count, add a file, or list another rule.

/** @typedef {Record<string, Record<string, { count: number }>>} Suppressions */

export const SUPPRESSIONS_FILE = 'eslint-suppressions.json';

/**
 * @param {Suppressions} list
 * @param {string} rule
 */
const totalOf = (list, rule) =>
  Object.values(list).reduce((sum, rules) => sum + (rules[rule]?.count ?? 0), 0);

/**
 * How the list grew from `base` to `head`, one line per count that rose; empty when it only shrank. A file new to
 * the list counts only through its rule's total, so a renamed spec may take its old entry along.
 * @param {Suppressions} base
 * @param {Suppressions} head
 * @returns {string[]}
 */
export function suppressionGrowth(base, head) {
  const rules = new Set(Object.values(head).flatMap((entry) => Object.keys(entry)));
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
 * Entries the list may not hold: a rule other than `rules`, or a file that is not a spec on disk (ESLint never
 * lints a deleted file, so it cannot see that entry go stale).
 * @param {Suppressions} list
 * @param {readonly string[]} rules
 * @param {(file: string) => boolean} exists
 * @returns {string[]}
 */
export function strayEntries(list, rules, exists) {
  return Object.entries(list).flatMap(([file, entry]) => {
    const missing = file.endsWith('.spec.ts') && exists(file) ? [] : [`${file}: not a spec file on disk`];
    const others = Object.keys(entry).filter((rule) => !rules.includes(rule));
    return [...missing, ...others.map((rule) => `${file}: ${rule} is not a test-time rule`)];
  });
}
