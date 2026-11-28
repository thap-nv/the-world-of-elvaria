import { describe, expect, it } from 'vitest';

import { poetCallOf } from './poet.ts';
import type { PoetSource } from './poet.ts';
import type { CharacterId, ClassId, TribeId } from '../core/ids.ts';
import type { ChronicleLedger } from '../schema/chronicle/ledger.ts';

const character = (id: string, klass: string, tribe = 'claude', status: 'idle' | 'suspended' = 'idle') => ({
  id: id as CharacterId,
  class: klass as ClassId,
  tribe: tribe as TribeId,
  status,
});

const ENTRY = { kind: 'quest_done' } as unknown as ChronicleLedger['entries'][number];

const source = (over: Partial<PoetSource> = {}): PoetSource => ({
  prose: true,
  ledger: { entries: [ENTRY] },
  roster: [character('brom', 'dwarf'), character('lyra', 'bard', 'codex'), character('vela', 'bard')],
  held: [],
  open: new Set(['lyra', 'vela'] as CharacterId[]),
  ...over,
});

describe('poetCallOf (P2-06b)', () => {
  it('calls the first Bard of the roster', () => {
    expect(poetCallOf(source())).toEqual({ status: 'call', bard: 'lyra' });
  });

  it('passes over a suspended Bard', () => {
    const roster = [character('lyra', 'bard', 'codex', 'suspended'), character('vela', 'bard')];
    expect(poetCallOf(source({ roster }))).toEqual({ status: 'call', bard: 'vela' });
  });

  it.each<[string, Partial<PoetSource>, string]>([
    ['prose off', { prose: false }, 'off'],
    ['a day with nothing in it', { ledger: { entries: [] } }, 'empty_day'],
    ['no Bard', { roster: [character('brom', 'dwarf')] }, 'no_bard'],
    ["the Bard's tribe held", { held: ['codex' as TribeId] }, 'held'],
    ["the Bard's pool closed", { open: new Set(['vela'] as CharacterId[]) }, 'pool_closed'],
  ])('calls nobody with %s', (_, over, reason) => {
    expect(poetCallOf(source(over))).toEqual({ status: 'skip', reason });
  });
});
