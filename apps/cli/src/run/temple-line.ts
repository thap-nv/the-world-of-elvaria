// The bell of a temple report (PS-12c), in the owner's language: once per report, what the Monk's report did to the
// scriptures and how many letters it filed, with the commands to read them; or that it was refused whole, nothing
// written, because it would have replaced a scripture instead of editing lines (DB7). (PS-12g) Then the characters a
// new line freed from the Temple, when any.
import type { Translate } from '@elvaria/i18n';
import type { Notice } from '@elvaria/steward';

type TempleNotice = Extract<Notice, { kind: 'temple' }>;

export function templeLine(t: Translate, notice: TempleNotice): string {
  const { character, added, retired, refused, letters } = notice;
  if (notice.rejected !== undefined) return t('cli.run.notice.temple_rejected', { character, refused });
  const line = t('cli.run.notice.temple', { character, added, retired, refused, letters });
  const released = notice.released ?? [];
  if (released.length === 0) return line;
  return `${line} ${t('cli.run.notice.temple_released', { characters: released.join(', ') })}`;
}
