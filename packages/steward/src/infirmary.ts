// Structured infirmary causes; only historical patch refusals are read from English text.
import { PATCH_FILE } from '@elvaria/runner-core';
import { infirmaryReasonOf } from '@elvaria/domain';
import type { EventData, InfirmaryDetail, InfirmaryReason, InfirmaryTrip } from '@elvaria/domain';

const PATHS_SAID = 10;

export function pathsSaid(paths: readonly string[]): string {
  const more = paths.length - PATHS_SAID;
  return `${paths.slice(0, PATHS_SAID).join(', ')}${more > 0 ? ` and ${more} more` : ''}`;
}

export interface InfirmaryCause {
  readonly reason: InfirmaryReason;
  readonly trip: InfirmaryTrip;
  readonly detail?: InfirmaryDetail;
}

type InfirmaryWhy = Pick<EventData<'quest.infirmary'>, 'reason' | 'trip' | 'detail'>;

export const OUT_OF_ATTEMPTS: InfirmaryCause = {
  trip: 'max_attempts',
  reason: infirmaryReasonOf('quest:max_attempts'),
};

/** Historical suffix, removed when reading a pre-P1-32 patch refusal. */
export const APPRENTICE_LEFT =
  '; an apprentice of this session ran past its minutes or was cut at its turns: open a child quest for the work it left (see handover.md)';

/** Empty external output is absent: the detail schema refuses empty strings. */
export function infirmaryData(cause: InfirmaryCause): InfirmaryCause {
  const detail = Object.fromEntries(Object.entries(cause.detail ?? {}).filter(([, value]) => value !== ''));
  return {
    reason: cause.reason,
    trip: cause.trip,
    ...(Object.keys(detail).length === 0 ? {} : { detail }),
  };
}

const REFUSED = `breaker:commit: ${PATCH_FILE} was not applied: `;

/** Detail is authoritative; prefix matching is only for old lines without a trip. */
export function refusedPatchOf(line: InfirmaryWhy): string | undefined {
  if (line.trip !== undefined || line.detail?.patch !== undefined) return line.detail?.patch;
  const text = line.reason.code === 'legacy' ? line.reason.params.text : undefined;
  if (typeof text !== 'string' || !text.startsWith(REFUSED)) return undefined;
  const why = text.slice(REFUSED.length);
  return why.endsWith(APPRENTICE_LEFT) ? why.slice(0, -APPRENTICE_LEFT.length) : why;
}
