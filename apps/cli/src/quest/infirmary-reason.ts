// Why a quest went to the infirmary, in the owner's language (contract infirmary-reason-codes §2): the domain writes
// a code and its params, never a sentence (ADR 0014); `quest show`, the bell and the sandbox timeline say it here.
import type { InfirmaryReason, InfirmaryReasonCode } from '@elvaria/domain';
import type { MessageKey, Translate } from '@elvaria/i18n';

/** Under the sentence, each line a refusing hook printed stands on its own, as it printed it (contract §1.3). */
const HOOK_INDENT = '  ';

/** `group:name` → `cli.quest.infirmary.reason.group.name`; `legacy` → `cli.quest.infirmary.reason.legacy`. */
export const reasonKeyOf = (code: InfirmaryReasonCode): MessageKey =>
  `cli.quest.infirmary.reason.${code.replace(':', '.')}` as MessageKey;

/**
 * The reason as the owner reads it. Params are outside words or values and go in verbatim; the hook's `lines` of
 * `breaker:commit*` follow the sentence, one indented line each, and nothing follows when the hook printed nothing.
 */
export function reasonText(t: Translate, reason: InfirmaryReason): string {
  const { lines } = reason.params;
  const params =
    typeof lines === 'string' && lines !== ''
      ? {
          ...reason.params,
          lines: lines
            .split('\n')
            .map((line) => `${HOOK_INDENT}${line}`)
            .join('\n'),
        }
      : reason.params;
  return t(reasonKeyOf(reason.code), params).trimEnd();
}
