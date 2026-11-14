import { stripVTControlCharacters } from 'node:util';

export interface HookOutputHead {
  readonly lines: readonly string[];
  readonly errors: number;
  readonly total_lines: number;
}

export const HEAD_LINES = 5;
export const LINE_CHARS = 200;

/** Keep words whole where possible, and never leave half of a Unicode character. */
function shortLine(line: string): string {
  if (line.length <= LINE_CHARS) return line;
  const boundary = line.slice(0, LINE_CHARS).search(/\s+\S*$/u);
  // Reserve one UTF-16 code unit for the ellipsis, dropping a dangling high surrogate.
  const prefix = line.slice(0, LINE_CHARS - 1).replace(/[\uD800-\uDBFF]$/u, '');
  return `${boundary > 0 ? line.slice(0, boundary) : prefix}…`;
}

/** The first useful hook lines, with counts over the entire uncoloured output. */
export function hookOutputHead(output: string): HookOutputHead {
  const lines = stripVTControlCharacters(output).split(/\r\n|\n|\r/u);
  while (lines.at(-1) === '') lines.pop();
  return {
    lines: lines
      .filter((line) => line.trim() !== '')
      .slice(0, HEAD_LINES)
      .map(shortLine),
    errors: lines.filter((line) => /error/i.test(line)).length,
    total_lines: lines.length,
  };
}
