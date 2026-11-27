// The doctor's line for kingdom.herald (P2-01b): the port and how many origins it accepts besides loopback, and a
// warning for an origin that is plain http yet not loopback: session cookies and commands through it would cross the
// network in the clear (ADR 0031 item 4: a tunnel's origin is https). Nothing is opened: `elvaria herald` does that.
import type { Kingdom } from '@elvaria/domain';
import { LOOPBACK_HOST } from '@elvaria/herald';
import type { Translate } from '@elvaria/i18n';

import { finding } from './finding.ts';
import type { Finding } from './finding.ts';

/** The hosts a plain-http origin may name: this machine only. */
const LOOPBACK_HOSTS: readonly string[] = [LOOPBACK_HOST, 'localhost'];

const inTheClear = (origin: string): boolean => {
  const url = new URL(origin);
  return url.protocol !== 'https:' && !LOOPBACK_HOSTS.includes(url.hostname);
};

export function checkHerald(t: Translate, herald: Kingdom['herald']): Finding[] {
  return [
    finding('ok', t('cli.herald.doctor.ok', { port: herald.port, count: herald.origins.length })),
    ...herald.origins
      .filter(inTheClear)
      .map((origin) => finding('warn', t('cli.herald.doctor.plain_origin', { origin }))),
  ];
}
