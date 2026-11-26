import { readFile } from 'node:fs/promises';

import { disruptionsOf, parseDisruptionKinds } from '@elvaria/domain';
import type { Disruption, DisruptionKind, DisruptionsIssue, Event, MetricsWindow } from '@elvaria/domain';
import { inKingdom, kingdomLayout } from '@elvaria/store';

export type DisruptionReading =
  | { readonly ok: true; readonly kinds: readonly DisruptionKind[]; readonly disruptions: Disruption[] }
  | {
      readonly ok: false;
      readonly file: string;
      readonly issues: readonly {
        readonly code: DisruptionsIssue['code'] | 'read' | 'json';
        readonly path: readonly (string | number)[];
        readonly message: string;
      }[];
    };

/** A broken registry only removes this reading, never the rest of the ledger (LL-02). */
export async function readDisruptions(
  root: string,
  events: readonly Event[],
  window: MetricsWindow = {},
): Promise<DisruptionReading> {
  const file = kingdomLayout.registryEntry('disruptions.json');
  let text: string;
  try {
    text = await readFile(inKingdom(root, file), 'utf8');
  } catch (error) {
    return {
      ok: false,
      file,
      issues: [{ code: 'read', path: [], message: error instanceof Error ? error.message : String(error) }],
    };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, file, issues: [{ code: 'json', path: [], message: '' }] };
  }
  const parsed = parseDisruptionKinds(json);
  return parsed.ok
    ? { ok: true, kinds: parsed.value, disruptions: disruptionsOf(events, parsed.value, window) }
    : { ok: false, file, issues: parsed.error };
}
