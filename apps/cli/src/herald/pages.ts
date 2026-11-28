// The Herald's words in the owner's language: it holds no string of its own (wave-1 plan, row 44), so the composition
// root hands it every page text and turns its log entries into lines. A device's refusals share `device.refusal.*`
// with the Steward's (P2-01 (610)(3)); the rest are the Herald's alone.
import type { HeraldLogEntry, HeraldPages, HeraldRefusal } from '@elvaria/herald';
import type { MessageKey } from '@elvaria/i18n';

import { roleName } from './grant.ts';
import type { CliContext } from '../command-table/command.ts';

const REFUSAL_TEXT: Readonly<Record<HeraldRefusal, MessageKey>> = {
  host_refused: 'cli.herald.page.refusal.host_refused',
  origin_refused: 'cli.herald.page.refusal.origin_refused',
  no_session: 'cli.herald.page.refusal.no_session',
  unknown_device: 'device.refusal.unknown_device',
  device_revoked: 'device.refusal.device_revoked',
  code_refused: 'cli.herald.page.refusal.code_refused',
  pairing_closed: 'cli.herald.page.refusal.pairing_closed',
  bad_request: 'cli.herald.page.refusal.bad_request',
  not_found: 'cli.herald.page.refusal.not_found',
  body_too_large: 'cli.herald.page.refusal.body_too_large',
  too_many_streams: 'cli.herald.page.refusal.too_many_streams',
  failed: 'cli.herald.page.refusal.failed',
};

export function heraldPages({ t, locale }: CliContext): HeraldPages {
  return {
    lang: locale,
    title: t('cli.herald.page.title'),
    pairPrompt: t('cli.herald.page.pair_prompt'),
    pairButton: t('cli.herald.page.pair_button'),
    home: (device) => t('cli.herald.page.home', { label: device.label, role: roleName(t, device.role) }),
    refusals: Object.fromEntries(
      Object.entries(REFUSAL_TEXT).map(([refusal, key]) => [refusal, t(key)]),
    ) as Record<HeraldRefusal, string>,
  };
}

/** The line of one entry the Herald logs, and whether it is an error. */
function logLine(
  t: CliContext['t'],
  entry: HeraldLogEntry,
): { readonly text: string; readonly error?: true } {
  switch (entry.kind) {
    case 'paired':
      return { text: t('cli.herald.log.paired', { device: entry.device }) };
    case 'refused':
      return { text: t('cli.herald.log.refused', { method: entry.method, refusal: entry.refusal }) };
    case 'stream':
      return {
        text: t(entry.open ? 'cli.herald.log.stream_opened' : 'cli.herald.log.stream_closed', {
          device: entry.device,
        }),
      };
    case 'command':
      return entry.answer === 'accepted'
        ? { text: t('cli.herald.log.command_accepted', entry) }
        : { text: t('cli.herald.log.command_refused', entry) };
    case 'failed':
      return { text: t('cli.herald.log.failed', { message: entry.message }), error: true };
  }
}

/** One line per entry the Herald logs; it has already masked every code and session id in it (ADR 0031 item 7). */
export const heraldLogLine =
  ({ t, io }: CliContext) =>
  (entry: HeraldLogEntry): void => {
    const line = logLine(t, entry);
    if (line.error === true) io.err(line.text);
    else io.out(line.text);
  };
