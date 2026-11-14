// The longest user prompt a tribe's CLI takes on this machine's OS (`capabilities.prompt_max_chars`,
// fix/verifier-prompt-limit, ADR 0021), shown as the shell is (P1-46; fix/cli-lines, (97)): the Steward passes over a
// judge of the tribe whose review prompt is longer (ADR 0008 rule 6), and the owner who wonders why one of its
// judges never reviews reads the limit here. The tribe is data: the limit comes from what its adapter declares.
import { promptMaxOf } from '@elvaria/domain';
import type { AdapterCapabilities, Tribe } from '@elvaria/domain';
import type { Translate } from '@elvaria/i18n';

import { finding } from './finding.ts';
import type { Finding } from './finding.ts';

/** A ✓ line with the limit the adapter declares for `platform`; nothing when it declares none there. */
export function promptMaxFindings(
  tribe: Tribe,
  capabilities: AdapterCapabilities | undefined,
  platform: string,
  t: Translate,
): Finding[] {
  const max = promptMaxOf(capabilities, platform);
  return max === undefined ? [] : [finding('ok', t('cli.doctor.prompt_max', { tribe: tribe.id, max }))];
}
