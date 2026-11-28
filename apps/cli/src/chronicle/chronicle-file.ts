// The Steward's Chronicle port (P2-06): the Steward decides when and what (the day's ledger); this words it in the
// owner's language and writes chronicle/<day>.json and chronicle/<day>.md in the kingdom. Both pass the event log's
// redaction first (ADR 0013): a quest's title is the owner's text and may carry a token. A pair already there is kept,
// never written again: the Steward runs the job once a day, and P2-06b appends the Bard's prose to the .md.
import { createRedactor, redactDeep } from '@elvaria/eventlog';
import { inKingdom, kingdomLayout, pathExists, writeFileAtomic } from '@elvaria/store';
import type { Translate } from '@elvaria/i18n';
import type { Chronicle } from '@elvaria/steward';

import { chronicleMarkdown } from './markdown.ts';

/** `root`: the kingdom folder; `name`: the kingdom's name, the chronicle's heading. */
export function fileChronicle(t: Translate, root: string, name: string): Chronicle {
  return {
    write: async ({ day, ledger }) => {
      const file = kingdomLayout.chronicle(day);
      if (await pathExists(inKingdom(root, file))) return file;
      // The log's patterns, as the Temple's evidence redacts a verdict's notes: the ledger comes from lines and files
      // the treasury's values were redacted from when written.
      const redactor = createRedactor([]);
      const saved = redactDeep(ledger, redactor);
      await writeFileAtomic(
        inKingdom(root, kingdomLayout.chronicleLedger(day)),
        `${JSON.stringify(saved, null, 2)}\n`,
      );
      await writeFileAtomic(inKingdom(root, file), redactor(chronicleMarkdown(t, { name, ledger: saved })));
      return file;
    },
  };
}
