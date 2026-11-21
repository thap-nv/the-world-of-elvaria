// The shape-clone detector behind `pnpm dup` (AH-13; plans/architecture-health.md V13, K8, K13; the gate and its
// list are shape-clones.mjs).
//
// A shape clone is a window of WINDOW tokens that is equal in two files once identifiers, strings and numbers are
// made alike: it finds code copied and then renamed, and verbatim copies too, so no jscpd (K8). Imports and
// interfaces are left out, as the walker of shape-clones.mjs leaves out index.ts, specs and test helpers: they
// repeat by nature. A pair's size is the number of tokens of the smaller side that sit in a shared window.
import ts from 'typescript';

export const WINDOW = 50;
/** A window shared by more files than this is an idiom of the codebase, not a copy. */
const IDIOM = 12;
/** A window of fewer distinct tokens is a data table (a list of strings, a record of labels), not logic. */
const DIVERSITY = 10;

const K = ts.SyntaxKind;
const STRINGS = new Set([
  K.StringLiteral,
  K.NoSubstitutionTemplateLiteral,
  K.TemplateHead,
  K.TemplateMiddle,
  K.TemplateTail,
  K.RegularExpressionLiteral,
]);
const NUMBERS = new Set([K.NumericLiteral, K.BigIntLiteral]);
/** Keywords after which `/` opens a regular expression rather than divides. */
const BEFORE_REGEX = new Set([
  K.ReturnKeyword,
  K.TypeOfKeyword,
  K.InstanceOfKeyword,
  K.InKeyword,
  K.OfKeyword,
  K.NewKeyword,
  K.DeleteKeyword,
  K.VoidKeyword,
  K.ThrowKeyword,
  K.CaseKeyword,
  K.DoKeyword,
  K.ElseKeyword,
  K.YieldKeyword,
  K.AwaitKeyword,
]);
const CLOSERS = new Set([K.CloseParenToken, K.CloseBracketToken, K.CloseBraceToken]);

/** @typedef {{ path: string; text: string }} SourceFile */
/** @typedef {{ a: string; b: string; tokens: number; linesA: string; linesB: string }} ClonePair */
/** @typedef {{ depth: number; templates: number[]; skip: 'statement' | number | undefined; prev: ts.SyntaxKind | undefined }} ScanState */

/** @param {ts.SyntaxKind | undefined} prev */
function slashOpensRegex(prev) {
  if (prev === undefined) return true;
  if (prev >= K.FirstKeyword && prev <= K.LastKeyword) return BEFORE_REGEX.has(prev);
  return prev >= K.FirstPunctuation && prev <= K.LastPunctuation && !CLOSERS.has(prev);
}

/**
 * The token as the parser would see it: the `}` that closes a template's `${`, and a regular expression, need
 * the context a bare scanner lacks; without it the rest of a template reads as code.
 * @param {ts.Scanner} scanner
 * @param {ts.SyntaxKind} scanned
 * @param {ScanState} state
 */
function rescanned(scanner, scanned, state) {
  let kind = scanned;
  if (kind === K.CloseBraceToken && state.templates.at(-1) === state.depth) {
    state.templates.pop();
    kind = scanner.reScanTemplateToken(false);
  } else if ((kind === K.SlashToken || kind === K.SlashEqualsToken) && slashOpensRegex(state.prev)) {
    kind = scanner.reScanSlashToken();
  }
  if (kind === K.TemplateHead || kind === K.TemplateMiddle) state.templates.push(state.depth);
  else if (kind === K.OpenBraceToken) state.depth += 1;
  else if (kind === K.CloseBraceToken) state.depth -= 1;
  state.prev = kind;
  return kind;
}

/**
 * Whether the token is part of an import statement or an interface, which repeat by nature.
 * @param {ts.Scanner} scanner
 * @param {ts.SyntaxKind} kind
 * @param {ScanState} state
 */
function skipped(scanner, kind, state) {
  if (state.skip === 'statement') {
    if (kind === K.SemicolonToken) state.skip = undefined;
    return true;
  }
  if (typeof state.skip === 'number') {
    if (kind === K.CloseBraceToken && state.depth === state.skip) state.skip = undefined;
    return true;
  }
  if (kind === K.ImportKeyword && state.depth === 0) {
    // `import(…)` and `import.meta` are expressions, not an import statement
    const next = scanner.lookAhead(() => scanner.scan());
    if (next !== K.OpenParenToken && next !== K.DotToken) state.skip = 'statement';
    return state.skip !== undefined;
  }
  if (kind === K.InterfaceKeyword) state.skip = state.depth;
  return state.skip !== undefined;
}

/**
 * The normalised tokens of a source text, and the 1-based line of each.
 * @param {string} text
 * @returns {{ kinds: string[]; lines: number[] }}
 */
export function tokensOf(text) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, text);
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) if (text[i] === '\n') starts.push(i + 1);
  /** @type {ScanState} */
  const state = { depth: 0, templates: [], skip: undefined, prev: undefined };
  /** @type {string[]} */
  const kinds = [];
  /** @type {number[]} */
  const lines = [];
  let line = 0;
  for (let next = scanner.scan(); next !== K.EndOfFileToken; next = scanner.scan()) {
    const kind = rescanned(scanner, next, state);
    if (skipped(scanner, kind, state)) continue;
    while (line + 1 < starts.length && (starts[line + 1] ?? 0) <= scanner.getTokenStart()) line += 1;
    kinds.push(
      kind === K.Identifier ? 'I' : STRINGS.has(kind) ? 'S' : NUMBERS.has(kind) ? 'N' : String(kind),
    );
    lines.push(line + 1);
  }
  return { kinds, lines };
}

/**
 * Each token as one character, so a window is a substring: a Map key without a hash to compute.
 * @param {readonly string[]} kinds
 * @param {Map<string, string>} codes  token → character, shared by every file
 */
function encoded(kinds, codes) {
  return kinds
    .map((kind) => {
      if (!codes.has(kind)) codes.set(kind, String.fromCodePoint(0x4e00 + codes.size));
      return codes.get(kind);
    })
    .join('');
}

/**
 * Every window of `size` tokens, as its text, with the places it starts at: [file index, token index]. The distinct
 * tokens of a window are counted as it slides, not per window.
 * @param {readonly { kinds: string[] }[]} files
 * @param {number} size
 */
function windowsOf(files, size) {
  /** @type {Map<string, [number, number][]>} */
  const windows = new Map();
  /** @type {Map<string, string>} */
  const codes = new Map();
  files.forEach((file, index) => {
    const text = encoded(file.kinds, codes);
    /** @type {Map<string, number>} */
    const counts = new Map();
    /** @param {string} char @param {number} by */
    const count = (char, by) => {
      const n = (counts.get(char) ?? 0) + by;
      if (n === 0) counts.delete(char);
      else counts.set(char, n);
    };
    for (let at = 0; at < text.length; at += 1) {
      count(text[at] ?? '', 1);
      if (at >= size) count(text[at - size] ?? '', -1);
      if (at + 1 < size || counts.size < DIVERSITY) continue;
      const key = text.slice(at + 1 - size, at + 1);
      const places = windows.get(key) ?? [];
      places.push([index, at + 1 - size]);
      windows.set(key, places);
    }
  });
  return windows;
}

/**
 * The token indexes of each side of each file pair that share a window: "a|b" (a < b) → [in a, in b].
 * @param {Map<string, [number, number][]>} windows
 * @param {number} size  of a window
 * @param {Set<number>[]} marked  filled with every token index in a shared window, per file
 */
function sharedTokens(windows, size, marked) {
  /** @type {Map<string, [Set<number>, Set<number>]>} */
  const pairs = new Map();
  /** @param {Set<number>[]} sets @param {number} at */
  const mark = (sets, at) => {
    for (const set of sets) for (let i = 0; i < size; i += 1) set.add(at + i);
  };
  for (const places of windows.values()) {
    const distinct = new Set(places.map(([index]) => index)).size;
    if (distinct < 2 || distinct > IDIOM) continue;
    for (const [a, atA] of places)
      for (const [b, atB] of places.filter(([index]) => index > a)) {
        const key = `${a}|${b}`;
        const sides = pairs.get(key) ?? [new Set(), new Set()];
        pairs.set(key, sides);
        mark([sides[0], marked[a] ?? new Set()], atA);
        mark([sides[1], marked[b] ?? new Set()], atB);
      }
  }
  return pairs;
}

/**
 * The lines of `tokens` as ranges, `3-9,14-20`, near lines merged.
 * @param {readonly number[]} lineOf
 * @param {Set<number>} tokens
 */
function rangesOf(lineOf, tokens) {
  const lines = [...new Set([...tokens].map((i) => lineOf[i] ?? 0))].sort((x, y) => x - y);
  /** @type {[number, number][]} */
  const out = [];
  for (const line of lines) {
    const last = out.at(-1);
    if (last !== undefined && line <= last[1] + 2) last[1] = line;
    else out.push([line, line]);
  }
  return out.map(([from, to]) => `${from}-${to}`).join(',');
}

/**
 * Every file pair sharing a shape, largest first, and how many tokens sit in a clone at all.
 * @param {readonly SourceFile[]} sources  in any order; paths repo-relative, `/` separated
 * @param {number} [size]  tokens in a window
 */
export function shapeClones(sources, size = WINDOW) {
  const sorted = [...sources].sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0));
  const files = sorted.map((source) => ({ path: source.path, ...tokensOf(source.text) }));
  /** @type {Set<number>[]} */
  const marked = files.map(() => new Set());
  const shared = sharedTokens(windowsOf(files, size), size, marked);
  /** @type {ClonePair[]} */
  const pairs = [];
  for (const [key, [inA, inB]] of shared) {
    const [a, b] = key.split('|').map((index) => files[Number(index)]);
    if (a === undefined || b === undefined) continue;
    const tokens = Math.min(inA.size, inB.size);
    pairs.push({
      a: a.path,
      b: b.path,
      tokens,
      linesA: rangesOf(a.lines, inA),
      linesB: rangesOf(b.lines, inB),
    });
  }
  pairs.sort((x, y) => y.tokens - x.tokens || (x.a + x.b < y.a + y.b ? -1 : 1));
  const tokens = files.reduce((sum, file) => sum + file.kinds.length, 0);
  const cloned = marked.reduce((sum, set) => sum + set.size, 0);
  return { files: files.length, tokens, cloned, pairs };
}
