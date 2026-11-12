// Banned words in identifiers (glossary §14, ADR 0014): one word per concept, so code says `steward`, never
// `dispatcher`. Prose is free: comments, strings with spaces and Markdown are not scanned; identifiers, JSON keys
// and id-shaped strings are. Tests, fixtures and tool config are skipped, as for the boundary rules (§1.4):
// tests name banned words on purpose to show they are refused, and tool config speaks third-party APIs.
import ts from 'typescript';

/** @typedef {import('@elvaria/i18n').BannedWord} BannedWord */
/** @typedef {{ text: string; line: number }} Token */

const CODE_FILE = /\.(?:[cm]?[jt]s|tsx)$/;
const SKIPPED = [
  /(?:^|\/)(?:node_modules|dist|coverage|__fixtures__)\//,
  /^(?:docs|design)\//,
  /\.spec\.ts$/,
  /\.config\.(?:[cm]?[jt]s)$/,
  // The glossary is where the banned words are listed.
  /^packages\/i18n\/src\/glossary\.json$/,
];
/** Display strings are prose in two languages; only their keys are identifiers. */
const LOCALE_FILE = /^packages\/i18n\/src\/locales\/[^/]+\.json$/;
/** A string that could be an id or a key: no whitespace, lowercase start, not a URL. */
const ID_SHAPED = /^[a-z0-9_@$./-][^\s]*$/;

/** Names that a third-party API or a real repository fixes, each with the reason it may contain a banned word. */
export const ALLOWED = new Map([
  ['projectService', 'typescript-eslint parser option'],
  ['dc1-se-team', 'the first territory: a real repository, named by its owner'],
  ['CLAUDE_PROJECT_DIR', 'Claude Code hook variable, used in .claude/settings.json'],
  ['project,local', 'Claude Code `--setting-sources` value (spike P1-02, runner-claude)'],
  ['task_id', 'Claude Code stream-json field of a sub-agent run (spike P1-02, runner-claude)'],
  ['task_started', 'Claude Code stream-json subtype: an apprentice starts (§3.12)'],
  ['task_progress', 'Claude Code stream-json subtype: an apprentice runs'],
  ['task_updated', 'Claude Code stream-json subtype: an apprentice changes status'],
  ['task_notification', 'Claude Code stream-json subtype: an apprentice ends (§3.12)'],
  ['approval_policy', 'Codex CLI config key, set with -c (spike Codex 2026-11-12, runner-codex)'],
  [
    'dangerously-bypass-approvals-and-sandbox',
    'Codex CLI flag Elvaria never passes; the fake CLI refuses it (runner-codex)',
  ],
]);

/** @param {string} path */
export const scansIdentifiers = (path) =>
  (CODE_FILE.test(path) || path.endsWith('.json')) && !SKIPPED.some((pattern) => pattern.test(path));

/** @param {string} text */
const idShaped = (text) => ID_SHAPED.test(text) && !text.includes('://');

/** Lowercase words of an identifier: `dispatcherQueue`, `dispatcher_queue`, `dispatcher-queue` → dispatcher, queue. */
export function wordsOf(/** @type {string} */ text) {
  let rest = text;
  for (const allowed of ALLOWED.keys()) rest = rest.replaceAll(allowed, ' ');
  return rest
    .split(/[^A-Za-z0-9]+/)
    .flatMap((part) => part.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/))
    .filter((word) => word !== '')
    .map((word) => word.toLowerCase());
}

/** Identifiers and id-shaped string literals of a TS or JS source; comments and prose strings drop out. */
export function codeTokens(/** @type {string} */ path, /** @type {string} */ text) {
  const kind = /\.[cm]?js$/.test(path) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
  /** @type {Token[]} */
  const tokens = [];
  /** @param {ts.Node} node */
  const visit = (node) => {
    const named = ts.isIdentifier(node) || ts.isPrivateIdentifier(node);
    const literal =
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && idShaped(node.text);
    if (named || literal) {
      tokens.push({
        text: node.text,
        line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return tokens;
}

/** Keys and, unless `keysOnly`, id-shaped string values of a JSON document, with the line each first appears on. */
export function jsonTokens(/** @type {string} */ text, keysOnly = false) {
  /** @type {string[]} */
  const found = [];
  /** @param {unknown} value */
  const walk = (value) => {
    if (typeof value === 'string' && !keysOnly && idShaped(value)) found.push(value);
    if (Array.isArray(value)) value.forEach(walk);
    else if (typeof value === 'object' && value !== null) {
      for (const [key, inner] of Object.entries(value)) {
        found.push(key);
        walk(inner);
      }
    }
  };
  walk(JSON.parse(text));
  const lines = text.split('\n');
  return [...new Set(found)].map((token) => ({
    text: token,
    line: lines.findIndex((line) => line.includes(JSON.stringify(token))) + 1,
  }));
}

/** Where data ids live (implementation-plan §4.1): the registry, themes and the UI kit; not their tool config. */
const DATA_DIRS = /^(?:packages\/registry-default|packages\/ui-kit|themes)\//;
const TOOL_JSON = /(?:^|\/)(?:package|tsconfig[^/]*)\.json$/;
const DATA_ID = /^[a-z0-9_-]+$/;

/**
 * Data ids outside `[a-z0-9_-]` (a Vietnamese slug, a capital, a dot): the value of every `id` or `*_id` key.
 * @param {string} path
 * @param {string} text
 */
export function dataIdProblems(path, text) {
  if (!DATA_DIRS.test(path) || !path.endsWith('.json') || TOOL_JSON.test(path) || !scansIdentifiers(path))
    return [];
  /** @type {string[]} */
  const bad = [];
  /** @param {unknown} value */
  const walk = (value) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (typeof value === 'object' && value !== null) {
      for (const [key, inner] of Object.entries(value)) {
        const isId = key === 'id' || key.endsWith('_id');
        if (isId && typeof inner === 'string' && !DATA_ID.test(inner)) bad.push(inner);
        walk(inner);
      }
    }
  };
  walk(JSON.parse(text));
  const lines = text.split('\n');
  return bad.map((id) => {
    const line = lines.findIndex((entry) => entry.includes(JSON.stringify(id))) + 1;
    return `${path}:${line}: id "${id}" has characters outside [a-z0-9_-] (ADR 0014)`;
  });
}

/**
 * `<file>:<line>: "<identifier>" uses the banned word "<word>"; use <replacement>` for each hit.
 * @param {string} path repo-relative, `/`
 * @param {string} text
 * @param {readonly BannedWord[]} banned
 */
export function bannedIdentifierProblems(path, text, banned) {
  if (!scansIdentifiers(path)) return [];
  const scanned = banned.filter((entry) => entry.scan);
  const tokens = path.endsWith('.json') ? jsonTokens(text, LOCALE_FILE.test(path)) : codeTokens(path, text);
  return tokens.flatMap(({ text: token, line }) => {
    const words = wordsOf(token);
    return scanned
      .filter(({ word }) => words.some((part) => part === word || part === `${word}s`))
      .map(({ word, use }) => `${path}:${line}: "${token}" uses the banned word "${word}"; use ${use}`);
  });
}
