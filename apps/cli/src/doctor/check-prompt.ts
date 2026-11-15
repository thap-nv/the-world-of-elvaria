// The longest user prompt a tribe's CLI takes on this machine's OS (`capabilities.prompt_max_chars`,
// fix/verifier-prompt-limit, ADR 0021), shown as the shell is (P1-46; fix/cli-lines, (97)): the Steward passes over a
// judge of the tribe whose review prompt is longer (ADR 0008 rule 6), and the owner who wonders why one of its
// judges never reviews reads the limit here. The tribe is data: the limit comes from what its adapter declares. So is
// whether its CLI reads images (`capabilities.vision`, PS-11): only its judges take a quest whose ritual asks for eyes.
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

/** A ✓ line when the adapter declares that its CLI reads images; nothing when it does not, the usual case. */
export const visionFindings = (
  tribe: Tribe,
  capabilities: AdapterCapabilities | undefined,
  t: Translate,
): Finding[] =>
  capabilities?.vision === true ? [finding('ok', t('cli.doctor.vision', { tribe: tribe.id }))] : [];
