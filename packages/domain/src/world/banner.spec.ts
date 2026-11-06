import { describe, expect, it } from 'vitest';

import { bannerOf } from './banner.ts';
import type { CampaignId, TribeId } from '../core/ids.ts';
import type { BannerSource } from './banner.ts';

const CLAUDE = 'claude' as TribeId;
const GEMINI = 'gemini' as TribeId;
const CODEX = 'codex' as TribeId;
const WAR = 'c_20261106_2k4m6p' as CampaignId;

/** Two tribes as `elvaria init` writes them, both ready and awake; Codex added but switched off. */
const calm: BannerSource = {
  sandbox: false,
  tribes: [
    { id: CLAUDE, enabled: true, tool: 'ready' },
    { id: GEMINI, enabled: true, tool: 'ready' },
    { id: CODEX, enabled: false, tool: 'missing' },
  ],
  pools: [
    { tribe: CLAUDE, pool: 'claude', asleep: false },
    { tribe: GEMINI, pool: 'gemini_models', asleep: false },
    { tribe: CODEX, pool: 'codex', asleep: true },
  ],
  campaigns: [{ id: WAR, mode: 'offense', status: 'active' }],
};

const withTool = (tribe: TribeId, tool: 'missing' | 'logged_out'): BannerSource['tribes'] =>
  calm.tribes.map((entry) => (entry.id === tribe ? { ...entry, tool } : entry));
const asleep = (tribe: TribeId): BannerSource['pools'] =>
  calm.pools.map((pool) => (pool.tribe === tribe ? { ...pool, asleep: true } : pool));
const defense = (status: 'declared' | 'active' | 'won' | 'closed'): BannerSource['campaigns'] => [
  { id: WAR, mode: 'defense', status },
];

describe('bannerOf', () => {
  it('shows nothing on a calm day, whatever a disabled tribe or an offense campaign does', () => {
    expect(bannerOf(calm)).toBeNull();
  });

  it('names the pools that ran out of mana', () => {
    expect(bannerOf({ ...calm, pools: asleep(GEMINI) })).toEqual({
      kind: 'asleep',
      pools: [{ tribe: GEMINI, pool: 'gemini_models' }],
    });
  });

  it('names the tribes whose CLI cannot work, before any sleeping pool', () => {
    expect(bannerOf({ ...calm, tribes: withTool(CLAUDE, 'logged_out'), pools: asleep(GEMINI) })).toEqual({
      kind: 'tool_unavailable',
      tribes: [{ tribe: CLAUDE, tool: 'logged_out' }],
    });
    expect(bannerOf({ ...calm, tribes: withTool(GEMINI, 'missing') })).toEqual({
      kind: 'tool_unavailable',
      tribes: [{ tribe: GEMINI, tool: 'missing' }],
    });
  });

  it('raises the defense band while a defense campaign is declared or active, over tools and mana', () => {
    const trouble = { ...calm, tribes: withTool(CLAUDE, 'logged_out'), pools: asleep(GEMINI) };
    for (const status of ['declared', 'active'] as const) {
      expect(bannerOf({ ...trouble, campaigns: defense(status) })).toEqual({
        kind: 'defense',
        campaigns: [WAR],
      });
    }
    for (const status of ['won', 'closed'] as const) {
      expect(bannerOf({ ...calm, campaigns: defense(status) })).toBeNull();
    }
  });

  it('marks a sandbox replay above everything, so fake data never passes for real', () => {
    const everything = {
      ...calm,
      sandbox: true,
      tribes: withTool(CLAUDE, 'logged_out'),
      pools: asleep(GEMINI),
      campaigns: defense('active'),
    };
    expect(bannerOf(everything)).toEqual({ kind: 'sandbox' });
  });
});
