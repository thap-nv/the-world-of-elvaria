// What the owner reads of a quest's seal under the kingdom's delegation (PS-08b, ADR 0023): spared by it, or why the
// machine raised it since. `quest show` and the digest word the reasons the same way.
import type { Quest, SealRaise } from '@elvaria/domain';
import type { Translate } from '@elvaria/i18n';

/** The reasons the machine raised a seal, in the owner's language, in their order. */
export const raisesText = (t: Translate, raises: readonly SealRaise[]): string =>
  raises.map((raise) => t(`cli.seal_raise.${raise}`)).join('; ');

/** The quest's seal: yes, no, spared by the delegation, or raised and why. */
export function sealText(
  t: Translate,
  quest: Pick<Quest, 'seal_required' | 'seal_delegated' | 'seal_raised'>,
): string {
  if (quest.seal_raised !== undefined)
    return t('cli.quest.seal.raised', { reasons: raisesText(t, quest.seal_raised) });
  if (quest.seal_delegated === true && !quest.seal_required) return t('cli.quest.seal.delegated');
  return t(quest.seal_required ? 'cli.yes' : 'cli.no');
}
