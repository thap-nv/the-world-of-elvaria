// Plain columns for list commands: readable in any terminal, easy to grep, no colour codes in pipes.

const GAP = '  ';

/** `rows` (header first) with every column but the last padded to its widest cell. */
export function renderTable(rows: readonly (readonly string[])[]): string[] {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, column) => {
      widths[column] = Math.max(widths[column] ?? 0, cell.length);
    });
  }
  return rows.map((row) =>
    row
      .map((cell, column) => (column === row.length - 1 ? cell : cell.padEnd(widths[column] ?? 0)))
      .join(GAP)
      .trimEnd(),
  );
}
