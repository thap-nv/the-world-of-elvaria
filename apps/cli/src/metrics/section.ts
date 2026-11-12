// The shape of the metrics view: sections of lines and tables, which `elvaria metrics` prints as plain columns and
// scripts/docs-metrics-report.mjs as Markdown. Apart from view.ts so the sections of PS-21 (view-sessions.ts) share
// it without an import cycle.

export interface MetricsTable {
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export interface MetricsSection {
  readonly title: string;
  readonly lines: readonly string[];
  readonly table?: MetricsTable;
}

export const count = (value: number): string => String(value);

/** A section whose table is left out when it has no row. */
export function tableSection(title: string, empty: string, table: MetricsTable): MetricsSection {
  return table.rows.length === 0 ? { title, lines: [empty] } : { title, lines: [], table };
}
