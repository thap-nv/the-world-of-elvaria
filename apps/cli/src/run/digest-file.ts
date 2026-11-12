// The Steward's Digest port (implementation-plan §3.16.3, PS-03): the Steward decides when and what; this words it
// in the owner's language and writes digest/<day>.md in the kingdom. A day's file is written once, since the Steward
// runs the job once a day; written again (by hand, or a log lost), it is replaced, never doubled.
import { inKingdom, kingdomLayout, writeFileAtomic } from '@elvaria/store';
import type { Translate } from '@elvaria/i18n';
import type { Digest } from '@elvaria/steward';

import { digestMarkdown } from '../digest/markdown.ts';

/** `root`: the kingdom folder; `name`: the kingdom's name, the digest's heading. */
export function fileDigest(t: Translate, root: string, name: string): Digest {
  return {
    write: async ({ day, items }) => {
      const file = kingdomLayout.digest(day);
      await writeFileAtomic(inKingdom(root, file), digestMarkdown(t, { day, name, items }));
      return file;
    },
  };
}
