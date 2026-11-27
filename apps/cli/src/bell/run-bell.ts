// The bell of `elvaria run` (P2-03): the console bell, and the desktop bell next to it unless kingdom.bell.desktop is
// off or nobody watches the terminal (CI, a sandbox, output sent to a file). A failing bell is one warning line, the
// way the Steward warns.
import type { Kingdom } from '@elvaria/domain';
import type { Bell } from '@elvaria/steward';

import { desktopBell, toastProcess } from './desktop.ts';
import { fanOut } from './fan-out.ts';
import type { KingdomContext } from '../kingdom-context.ts';

/** What the bell reads of the kingdom's context: its terminal, its language and kingdom.bell. */
type BellContext = Pick<KingdomContext, 'io' | 't'> & { readonly kingdom: Pick<Kingdom, 'bell'> };

export function runBell({ io, t, kingdom }: BellContext, console: Bell): Bell {
  const warn = (message: string): void => {
    io.err(t('cli.run.warning', { message }));
  };
  const desktop =
    kingdom.bell.desktop && io.interactive === true
      ? [desktopBell({ t, notify: toastProcess(io), platform: io.platform, warn })]
      : [];
  return fanOut([console, ...desktop], (error) => {
    warn(t('bell.failed', { message: error instanceof Error ? error.message : String(error) }));
  });
}
