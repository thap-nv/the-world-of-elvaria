// `pnpm docs:gen` writes the docs that are generated, never edited by hand (implementation-plan §5.4).
// `pnpm docs:gen --check` compares instead of writing and exits 1 on drift: `pnpm check` runs it, and CI also
// runs `pnpm docs:gen && git diff --exit-code docs/`. A new generated doc is one entry in GENERATORS.
import process from 'node:process';

import { renderEvents } from './docs-events.mjs';
import { renderGlossary } from './docs-glossary.mjs';
import { renderDependencyGraph } from './docs-graph.mjs';
import { gitRepo } from './docs-repo.mjs';

/** @typedef {import('./docs-repo.mjs').Repo} Repo */
/**
 * A whole generated file, or with `region` one generated part of a hand-written file (the §2.5 table of
 * implementation-plan.md, from P0-04), kept between `<!-- docs:gen <region> -->` and `<!-- /docs:gen <region> -->`.
 * @typedef {{ file: string; region?: string; render: () => string | Promise<string> }} Generator
 */

/** @type {readonly Generator[]} */
export const GENERATORS = [
  { file: 'docs/glossary.md', render: () => renderGlossary() },
  { file: 'docs/events.md', render: () => renderEvents() },
  { file: 'docs/dependency-graph.md', render: renderDependencyGraph },
];

/** @param {unknown} error */
const messageOf = (error) => (error instanceof Error ? error.message : String(error));

/**
 * The file with the region's body replaced, or an Error when the markers are missing or out of order.
 * @param {string | undefined} current
 * @param {string} region
 * @param {string} body ends with a newline
 */
export function spliceRegion(current, region, body) {
  const start = `<!-- docs:gen ${region} -->\n`;
  const end = `<!-- /docs:gen ${region} -->`;
  const from = current?.indexOf(start) ?? -1;
  const to = current?.indexOf(end, from) ?? -1;
  if (current === undefined || from < 0 || to < 0)
    return new Error(`no "${start.trim()}" … "${end}" markers`);
  return `${current.slice(0, from + start.length)}${body}${current.slice(to)}`;
}

/**
 * What the file should hold after this generator, or an Error saying why it cannot be produced.
 * @param {Generator} generator
 * @param {string | undefined} current
 * @returns {Promise<string | Error>}
 */
async function expected({ region, render }, current) {
  try {
    const text = await render();
    return region === undefined ? text : spliceRegion(current, region, text);
  } catch (error) {
    return new Error(messageOf(error));
  }
}

/**
 * @param {readonly string[]} args
 * @param {Pick<Repo, 'read' | 'write'>} repo
 * @param {readonly Generator[]} generators
 * @returns {Promise<{ code: number; text: string }>}
 */
export async function run(args, repo, generators = GENERATORS) {
  const check = args.includes('--check');
  const problems = [];
  let written = 0;
  for (const generator of generators) {
    const current = repo.read(generator.file);
    const text = await expected(generator, current);
    const name = generator.region === undefined ? generator.file : `${generator.file} (${generator.region})`;
    if (text instanceof Error) problems.push(`${name}: cannot render: ${text.message}`);
    else if (current === text) continue;
    else if (check) problems.push(`${name} differs from its source: run pnpm docs:gen`);
    else {
      repo.write(generator.file, text);
      written += 1;
    }
  }
  if (problems.length > 0) return { code: 1, text: problems.join('\n') };
  const verb = check ? 'up to date' : `${written} written`;
  return { code: 0, text: `docs:gen: ${generators.length} generated docs, ${verb}` };
}

if (import.meta.main) {
  const { code, text } = await run(process.argv.slice(2), gitRepo());
  (code === 0 ? console.log : console.error)(text);
  process.exitCode = code;
}
