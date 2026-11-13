// `pnpm docs:check` (implementation-plan §5.4, §4.1, ADR 0014, 0015): the rules that keep docs and names true.
// Each check is a pure function of the repo's file list and contents, so tests run it on an in-memory repo.
import process from 'node:process';

import { CHARACTER_STATUSES, EVENT_TYPES, QUEST_STATUSES, RITUAL_STEPS } from '@elvaria/domain';
import { GLOSSARY, bannedWords, glossaryTable, idsOf } from '@elvaria/i18n';

import { bannedIdentifierProblems, dataIdProblems } from './docs-identifiers.mjs';
import { linkProblems } from './docs-links.mjs';
import { gitRepo } from './docs-repo.mjs';

/** @typedef {import('./docs-repo.mjs').Repo} Repo */
/** @typedef {import('@elvaria/i18n').Glossary} Glossary */

/** The four sections every package README has, in this order (implementation-plan §4.2). */
export const README_SECTIONS = ['Does', 'Does not', 'Depends on', 'How to test'];
/** Shell scripts break on one of the two OSes; every script is Node (ADR 0015). */
const SHELL_SCRIPT = /\.(?:sh|ps1|cmd|bat)$/i;
const WORKSPACE_MANIFEST = /^(?:packages|apps)\/[^/]+\/package\.json$/;
const ADR_FILE = /^docs\/adr\/\d{4}-[^/]+\.md$/;
const ADR_STATUS = /^- Status: (?:proposed|accepted|rejected|deprecated|superseded by .+)/m;

/** @typedef {(file: string) => string | undefined} Read */

const EXPECTED_SECTIONS = README_SECTIONS.join(' / ');

/** @param {readonly (string | undefined)[]} headings */
const hasTheFourSections = (headings) =>
  headings.length === README_SECTIONS.length &&
  headings.every((heading, i) => heading === README_SECTIONS[i]);

/**
 * Workspaces without a README, or whose README lacks the four sections.
 * @param {readonly string[]} files
 * @param {Read} read
 */
export function readmeProblems(files, read) {
  return files
    .filter((file) => WORKSPACE_MANIFEST.test(file))
    .flatMap((manifest) => {
      const readme = manifest.replace(/package\.json$/, 'README.md');
      const text = read(readme);
      if (text === undefined) return [`${readme}: missing (${EXPECTED_SECTIONS})`];
      const headings = [...text.matchAll(/^## (.+?)\s*$/gm)].map((match) => match[1]);
      if (hasTheFourSections(headings)) return [];
      return [`${readme}: sections are ${headings.join(' / ') || 'none'}, expected ${EXPECTED_SECTIONS}`];
    });
}

/**
 * ADRs without a `- Status:` line (implementation-plan §5.2).
 * @param {readonly string[]} files
 * @param {Read} read
 */
export function adrProblems(files, read) {
  return files
    .filter((file) => ADR_FILE.test(file))
    .filter((file) => !ADR_STATUS.test(read(file) ?? ''))
    .map(
      (file) => `${file}: no "- Status: proposed | accepted | rejected | deprecated | superseded by …" line`,
    );
}

/** The most a Markdown file in docs/ may weigh: what a session reads without paging through it (P1-52). */
export const DOC_MAX_KB = 150;
/**
 * The most CLAUDE.md may weigh: every session on the repo loads all of it before its first step. It grew from 14.6 KB
 * to 32 KB in a week, mostly by repeating docs/cli.md and the plan; 29 KB is its size once cut, plus a few lines.
 */
export const CLAUDE_MD_MAX_KB = 29;
const DOC_MARKDOWN = /^docs\/.+\.md$/;

/** Which files have a ceiling, and what to do when one passes it. */
const CEILINGS = [
  {
    weighs: (/** @type {string} */ file) => DOC_MARKDOWN.test(file),
    maxKb: DOC_MAX_KB,
    advice: 'split it (the implementation plan: a new part file, or pnpm plan:split)',
  },
  {
    weighs: (/** @type {string} */ file) => file === 'CLAUDE.md',
    maxKb: CLAUDE_MD_MAX_KB,
    advice: 'point to docs/cli.md, the plan or .claude/rules instead of repeating them',
  },
];

/**
 * Markdown files in docs/ over DOC_MAX_KB, generated ones too, since sessions read them alike: the one-file plan
 * grew to 1 MB, and a scout without a search tool read it 25 times (Q10 of P1-50). CLAUDE.md over CLAUDE_MD_MAX_KB.
 * @param {readonly string[]} files
 * @param {Read} read
 */
export function sizeProblems(files, read) {
  const encoder = new TextEncoder();
  return files.flatMap((file) => {
    const ceiling = CEILINGS.find(({ weighs }) => weighs(file));
    if (ceiling === undefined) return [];
    const kb = encoder.encode(read(file) ?? '').length / 1024;
    if (kb <= ceiling.maxKb) return [];
    return [`${file}: ${Math.ceil(kb)} KB, over ${ceiling.maxKb} KB; ${ceiling.advice}`];
  });
}

/** @param {readonly string[]} files */
export const shellScriptProblems = (files) =>
  files
    .filter((file) => SHELL_SCRIPT.test(file))
    .map((file) => `${file}: shell script; write it in Node (ADR 0015)`);

/** Glossary tables that must name every value the domain uses; `exact` ones also nothing more. */
const TERMS = [
  { table: 'quest_statuses', column: 'id', values: QUEST_STATUSES, source: 'QUEST_STATUSES', exact: true },
  {
    table: 'character_statuses',
    column: 'id',
    values: CHARACTER_STATUSES,
    source: 'CHARACTER_STATUSES',
    exact: true,
  },
  // The glossary also lists steps and event prefixes planned for later tasks.
  { table: 'ritual_steps', column: 'id', values: RITUAL_STEPS, source: 'RITUAL_STEPS', exact: false },
  { table: 'events', column: 'types', values: EVENT_TYPES, source: 'EVENT_TYPES', exact: false },
];

/** Where the glossary and the domain disagree on a closed list of ids. @param {Glossary} glossary */
export function termProblems(glossary) {
  return TERMS.flatMap(({ table, column, values, source, exact }) => {
    const found = glossaryTable(glossary, table);
    if (found === undefined) return [`glossary: no table "${table}" to hold ${source}`];
    const ids = idsOf(found, column);
    const missing = values.filter((value) => !ids.includes(value));
    const extra = exact ? ids.filter((id) => !(/** @type {readonly string[]} */ (values).includes(id))) : [];
    return [
      ...missing.map((value) => `glossary table "${table}" lacks ${value}, which domain ${source} has`),
      ...extra.map((id) => `glossary table "${table}" has ${id}, which domain ${source} does not`),
    ];
  });
}

/**
 * Every docs:check problem of a repo.
 * @param {readonly string[]} files every repo file, repo-relative with `/`
 * @param {Read} read
 * @param {Glossary} glossary
 */
export function checkRepo(files, read, glossary = GLOSSARY) {
  const banned = bannedWords(glossary);
  const text = (/** @type {string} */ file) => read(file) ?? '';
  return [
    ...readmeProblems(files, read),
    ...adrProblems(files, read),
    ...shellScriptProblems(files),
    ...sizeProblems(files, read),
    ...linkProblems(files, read),
    ...termProblems(glossary),
    ...files.flatMap((file) => bannedIdentifierProblems(file, text(file), banned)),
    ...files.flatMap((file) => dataIdProblems(file, text(file))),
  ];
}

/** @param {Pick<Repo, 'list' | 'read'>} repo @returns {{ code: number; text: string }} */
export function run(repo) {
  const files = repo.list();
  const problems = checkRepo(files, repo.read);
  if (problems.length > 0) {
    return { code: 1, text: [`docs:check: ${problems.length} problems`, ...problems].join('\n') };
  }
  return { code: 0, text: `docs:check: ${files.length} files, no problems` };
}

if (import.meta.main) {
  const { code, text } = run(gitRepo());
  (code === 0 ? console.log : console.error)(text);
  process.exitCode = code;
}
