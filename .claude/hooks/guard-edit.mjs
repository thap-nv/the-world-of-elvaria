// PreToolUse hook for Edit, Write and MultiEdit (implementation-plan §5.1, decided after P0-11): refuses the edits
// CLAUDE.md forbids that no check would catch before CI does, or at all: a generated file or generated region
// changed by hand, the v0.2 design handoff, the product plan. The generators write through node, not through these
// tools, so they are not affected. A shell command that writes such a file is not caught: guard-bash matches
// command lines, not the files they write. Exit 2 blocks the call and shows stderr to the agent, as guard-bash does.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

import { REPO, readPayload, repoPath, toolInput } from './hook-io.mjs';

/** The whole files `pnpm docs:gen` writes: GENERATORS of scripts/docs-gen.mjs, which the spec keeps in step. */
export const GENERATED_FILES = [
  'docs/glossary.md',
  'docs/events.md',
  'docs/dependency-graph.md',
  'docs/cli.md',
];

const REGENERATE = 'edit its source and run `pnpm docs:gen`';

/** @type {readonly (readonly [RegExp, string])[]} */
const PROTECTED = [
  [
    /^docs\/schemas\//,
    'docs/schemas/ is generated from the zod sources in packages/domain/src/schema: edit those and run ' +
      '`pnpm schemas` (ADR 0003).',
  ],
  [
    /^design\//,
    'design/ is the v0.2 design handoff, kept as history: design changes go to packages/ui-kit and ' +
      'packages/ui, a new handoff to a new folder.',
  ],
  [
    /^docs\/ke-hoach-dung-elvaria-[^/]*\.md$/,
    'the product plan is edited by the owner only: write the proposed change into a ' +
      'docs/implementation-plan.md §11 row instead.',
  ],
];

/** A generated part of a hand-written file (spliceRegion of scripts/docs-gen.mjs writes the same markers). */
const REGION = /<!-- docs:gen ([\w-]+) -->\n([\s\S]*?)<!-- \/docs:gen \1 -->/g;

/** Texts compare with LF: the repo stores LF (.gitattributes), a Windows checkout may still hold CRLF. */
const lf = (/** @type {string} */ text) => text.replaceAll('\r\n', '\n');

/**
 * The body of each generated region of a text, by region name.
 * @param {string} text
 * @returns {Map<string, string>}
 */
export function regionsOf(text) {
  return new Map([...lf(text).matchAll(REGION)].map((match) => [match[1] ?? '', match[2] ?? '']));
}

/**
 * One Edit (or one entry of MultiEdit's `edits`) applied to a text. An old_string the text does not hold makes
 * Claude Code fail the call, so here it changes nothing.
 * @param {string} text
 * @param {unknown} edit
 */
function applyEdit(text, edit) {
  if (typeof edit !== 'object' || edit === null) return text;
  const {
    old_string: from,
    new_string: to,
    replace_all: all,
  } = /** @type {Record<string, unknown>} */ (edit);
  if (typeof from !== 'string' || typeof to !== 'string' || from === '') return text;
  return all === true ? text.split(lf(from)).join(lf(to)) : text.replace(lf(from), () => lf(to));
}

/**
 * The file's text after the call, from its text before.
 * @param {string} tool Edit, Write or MultiEdit
 * @param {Record<string, unknown>} input the call's tool_input
 * @param {string} before
 */
export function textAfter(tool, input, before) {
  if (tool === 'Write') return typeof input.content === 'string' ? lf(input.content) : lf(before);
  const edits = tool === 'MultiEdit' && Array.isArray(input.edits) ? input.edits : [input];
  return edits.reduce((/** @type {string} */ text, edit) => applyEdit(text, edit), lf(before));
}

/**
 * The first generated region of `before` that `after` changes or drops. A region the call adds is not refused:
 * a new region arrives together with its generator.
 * @param {string} before
 * @param {string} after
 */
export function changedRegion(before, after) {
  const now = regionsOf(after);
  return [...regionsOf(before)].find(([name, body]) => now.get(name) !== body)?.[0];
}

/**
 * Why the call is refused, or undefined when it may run.
 * @param {string} rel repo-relative path with `/`
 * @param {string} tool Edit, Write or MultiEdit
 * @param {Record<string, unknown>} input the call's tool_input
 * @param {(rel: string) => string} read the file's text now, '' when there is none
 */
export function refusalOf(rel, tool, input, read) {
  // Windows and macOS file systems ignore case, so `Docs/CLI.md` is the generated file too.
  const key = rel.toLowerCase();
  if (GENERATED_FILES.includes(key))
    return `${rel} is generated: ${REGENERATE} (the note at its top names it).`;
  const rule = PROTECTED.find(([pattern]) => pattern.test(key));
  if (rule !== undefined) return rule[1];
  if (!key.endsWith('.md')) return undefined;
  const before = read(rel);
  const region = changedRegion(before, textAfter(tool, input, before));
  return region === undefined
    ? undefined
    : `the <!-- docs:gen ${region} --> region of ${rel} is generated: ${REGENERATE}.`;
}

/** @param {string} rel */
function readRepoFile(rel) {
  try {
    return readFileSync(join(REPO, rel), 'utf8');
  } catch {
    return '';
  }
}

if (import.meta.main) {
  const payload = readPayload();
  const input =
    typeof payload.tool_input === 'object' && payload.tool_input !== null ? payload.tool_input : {};
  const tool = typeof payload.tool_name === 'string' ? payload.tool_name : '';
  const rel = repoPath(toolInput(payload, 'file_path'));
  const reason =
    rel === undefined
      ? undefined
      : refusalOf(rel, tool, /** @type {Record<string, unknown>} */ (input), readRepoFile);
  if (reason !== undefined) {
    process.stderr.write(`Blocked by .claude/hooks/guard-edit.mjs: ${reason}\n`);
    process.exitCode = 2;
  }
}
