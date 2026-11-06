// `pnpm schemas` writes docs/schemas/<name>.schema.json from the zod sources (ADR 0003, implementation-plan §2.1).
// `pnpm schemas --check` compares instead of writing and exits 1 on drift: `pnpm check` runs it, and CI also
// runs `pnpm schemas && git diff --exit-code docs/schemas`.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

import { CONTRACTS, contractOf } from '@elvaria/domain';

const ROOT = new URL('../', import.meta.url);
const SUFFIX = '.schema.json';

/** @typedef {{ read(file: string): string | undefined; write(file: string, text: string): void; list(): string[] }} Files */

/** The repo's docs/schemas/ folder and the domain's examples, as the generator sees them. @returns {Files} */
export function repoFiles() {
  const out = new URL('docs/schemas/', ROOT);
  return {
    read: (file) => (existsSync(new URL(file, out)) ? readFileSync(new URL(file, out), 'utf8') : undefined),
    write: (file, text) => writeFileSync(new URL(file, out), text),
    list: () => readdirSync(out),
  };
}

/** The examples of one contract: also the valid fixtures of the domain's tests. @param {string} name */
const examplesOf = (name) =>
  /** @type {unknown} */ (
    JSON.parse(readFileSync(new URL(`packages/domain/examples/${name}.json`, ROOT), 'utf8'))
  );

/** The text of docs/schemas/<name>.schema.json, LF and a final newline like every repo file. @param {string} name */
export function render(name) {
  const contract = contractOf(name, CONTRACTS[/** @type {keyof typeof CONTRACTS} */ (name)]);
  return `${JSON.stringify({ ...contract, examples: examplesOf(name) }, null, 2)}\n`;
}

/**
 * @param {readonly string[]} args
 * @param {Files} files
 * @returns {{ code: number; text: string }}
 */
export function run(args, files) {
  const check = args.includes('--check');
  const names = Object.keys(CONTRACTS);
  const problems = [];
  let written = 0;
  for (const name of names) {
    const file = `${name}${SUFFIX}`;
    const text = render(name);
    if (files.read(file) === text) continue;
    if (check) problems.push(`docs/schemas/${file} differs from its zod source: run pnpm schemas`);
    else {
      files.write(file, text);
      written += 1;
    }
  }
  // A contract file nobody generates would silently go stale.
  for (const file of files.list().filter((entry) => entry.endsWith(SUFFIX))) {
    if (!names.includes(file.slice(0, -SUFFIX.length))) {
      problems.push(`docs/schemas/${file} has no zod source in CONTRACTS`);
    }
  }
  if (problems.length > 0) return { code: 1, text: problems.join('\n') };
  const verb = check ? 'up to date' : `${written} written`;
  return { code: 0, text: `docs/schemas: ${names.length} contracts, ${verb}` };
}

if (import.meta.main) {
  const { code, text } = run(process.argv.slice(2), repoFiles());
  (code === 0 ? console.log : console.error)(text);
  process.exitCode = code;
}
