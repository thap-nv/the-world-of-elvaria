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
  const chars = Array.from(line);
  if (chars.length <= LINE_CHARS) return line;
  const prefix = chars.slice(0, LINE_CHARS).join('');
  const boundary = prefix.search(/\s+\S*$/u);
  return `${boundary > 0 ? prefix.slice(0, boundary) : prefix}…`;
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
