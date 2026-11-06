// The shape every `… list` command prints: a table, or one line when there is nothing, then one problem per file
// the store could not read (a bad file never hides the good ones).
import type { MessageKey } from '@elvaria/i18n';
import type { StoreIssue } from '@elvaria/store';

import { EXIT } from './command.ts';
import { storeIssueLines } from './issues.ts';
import { renderTable } from './table.ts';
import type { CliContext, ExitCode } from './command.ts';

/** Shown in a cell that has no value. */
export const NONE = '—';

export interface ListingView {
  readonly header: readonly MessageKey[];
  readonly rows: readonly (readonly string[])[];
  readonly issues: readonly StoreIssue[];
  /** Printed instead of an empty table. */
  readonly empty: MessageKey;
}

export function printListing(ctx: CliContext, view: ListingView): ExitCode {
  const { t, io } = ctx;
  if (view.rows.length === 0) io.out(t(view.empty));
  else renderTable([view.header.map((key) => t(key)), ...view.rows]).forEach(io.out);
  view.issues.flatMap((issue) => storeIssueLines(t, issue)).forEach(io.err);
  return view.issues.length > 0 ? EXIT.failed : EXIT.ok;
}
