// Markdown shared by the docs:gen generators, so every generated doc has one table style, one banner, LF line
// ends and one final newline (implementation-plan §5.4).

/** @param {string} text */
export const code = (text) => `\`${text}\``;

/** A pipe inside a table cell would split the cell; escape every pipe not escaped yet. @param {string} text */
export const escapeCell = (text) => text.replace(/(?<!\\)\|/g, String.raw`\|`);

/**
 * A GitHub table. An empty cell prints as `| |`, the way the hand-written docs write it.
 * @param {readonly string[]} headers
 * @param {readonly (readonly string[])[]} rows
 */
export function table(headers, rows) {
  /** @param {readonly string[]} cells */
  const line = (cells) => `|${cells.map((cell) => (cell === '' ? ' ' : ` ${escapeCell(cell)} `)).join('|')}|`;
  return [line(headers), `|${headers.map(() => '---').join('|')}|`, ...rows.map(line)].join('\n');
}

/**
 * The line under the title of every generated doc: where it comes from and that it is not edited by hand.
 * @param {string} source Markdown naming the source
 */
export const generatedNote = (source) =>
  `> Sinh từ ${source} bằng \`pnpm docs:gen\`, CI kiểm drift: sửa nguồn rồi chạy lại lệnh, không sửa file này.`;

/** Blocks separated by one blank line, ending in one newline. @param {readonly string[]} blocks */
export const markdownDocument = (blocks) => `${blocks.join('\n\n')}\n`;
