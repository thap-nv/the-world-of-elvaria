// Scan raw JSON before parsing can discard repeated properties. Each object owns its key set.
/**
 * @param {string} source
 * @param {string} file
 * @returns {string[]}
 */
export function duplicateKeys(source, file) {
  const problems = [];
  /** @type {Set<string>[]} */
  const objects = [];
  const tokens = /"(?:[^"\\]|\\[\s\S])*"|[{}]|[^\s"{}]+/g;
  let line = 1;
  let previous = 0;
  for (const match of source.matchAll(tokens)) {
    line += source.slice(previous, match.index).split('\n').length - 1;
    const token = match[0];
    previous = match.index;
    if (token === '{') objects.push(new Set());
    else if (token === '}') objects.pop();
    else if (token.startsWith('"') && /^\s*:/.test(source.slice(match.index + token.length))) {
      // Decode only the string token, so escaped spellings of the same key compare equal.
      const key = /** @type {string} */ (JSON.parse(token));
      const keys = objects.at(-1);
      if (keys?.has(key)) problems.push(`${file}:${line}: duplicate key ${JSON.stringify(key)}`);
      keys?.add(key);
    }
  }
  return problems;
}
