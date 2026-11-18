// What the owner reads of the breaker of the seal delegation (PS-08g, ADR 0023): why a territory's delegation is
// suspended. `territory delegation`, the digest and the bell word it the same way.
import type { SealSuspension } from '@elvaria/domain';
import type { Translate } from '@elvaria/i18n';

const NONE = '—';

/** Why the breaker suspended the delegation: the check that turned red, or the owner's report and its note. */
export const suspensionCause = (
  t: Translate,
  suspension: Pick<SealSuspension, 'cause' | 'check' | 'note'>,
): string =>
  t(`cli.delegation.cause.${suspension.cause}`, {
    check: suspension.check ?? NONE,
    note: suspension.note ?? NONE,
  });
