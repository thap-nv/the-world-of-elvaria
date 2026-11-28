// What the desktop bell says (P2-03, W13): which notices reach the machine's notification centre, and the toast of
// one. A toast is seen by whoever passes the screen, so it is a heading and one line naming the quest, the pool or the
// territory, masked like the log (ADR 0013); never the question, a diff, a check's line or a path. The terminal keeps
// the whole sentence (run/bell.ts).
import { redact } from '@elvaria/eventlog';
import type { Translate } from '@elvaria/i18n';
import type { Notice } from '@elvaria/steward';

type NoticeKind = Notice['kind'];

/** What waits on the owner, and the alarms (W13). */
type DesktopKind =
  'awaiting_seal' | 'infirmary' | 'question' | 'mana_asleep' | 'base_red' | 'delegation_suspended';

type DesktopNotice = Extract<Notice, { readonly kind: DesktopKind }>;

/**
 * Which notices also ring on the desktop: data, one cell per kind, so a new kind of notice does not typecheck until
 * someone decides (W13). Every other notice is said on the terminal only.
 */
export const DESKTOP_RINGS = {
  awaiting_seal: true,
  infirmary: true,
  question: true,
  mana_asleep: true,
  base_red: true,
  delegation_suspended: true,
  unclaimable: false,
  unjudgeable: false,
  judge_mana: false,
  digest: false,
  chronicle: false,
  wrap_up: false,
  environment: false,
  subquests_refused: false,
  merge_stopped: false,
  tribe_held: false,
  delivery_pushed: false,
  delivery_failed: false,
  temple: false,
  suspended: false,
  mana_awake: false,
  mana_warning: false,
} as const satisfies { readonly [K in NoticeKind]: K extends DesktopKind ? true : false };

const ringsOnDesktop = (notice: Notice): notice is DesktopNotice => DESKTOP_RINGS[notice.kind];

/** One desktop notification: the program that shows it takes both as data, never through a shell. */
export interface Toast {
  readonly title: string;
  readonly message: string;
  readonly icon?: string;
  readonly appID?: string;
}

function lineOf(t: Translate, notice: DesktopNotice): string {
  switch (notice.kind) {
    case 'awaiting_seal':
    case 'infirmary':
    case 'question':
      return t('bell.toast.quest', { quest: notice.quest.id, title: notice.quest.title });
    case 'mana_asleep':
      return t('bell.toast.pool', { pool: notice.pool, tribe: notice.tribe });
    case 'base_red':
    case 'delegation_suspended':
      return t('bell.toast.territory', { territory: notice.territory });
  }
}

/** The toast of a notice, or undefined when it rings on the terminal only. */
export function toastOf(t: Translate, notice: Notice): Toast | undefined {
  if (!ringsOnDesktop(notice)) return undefined;
  // One model's cap ran dry: the pool still works on its other models, so only the terminal hears it (W13).
  if (notice.kind === 'mana_asleep' && notice.model !== undefined) return undefined;
  const title = t('bell.toast.heading', { what: t(`bell.toast.kind.${notice.kind}`) });
  // The quest's title is the owner's or a character's words: masked like everything written (ADR 0013).
  return { title: redact(title, []), message: redact(lineOf(t, notice), []) };
}
