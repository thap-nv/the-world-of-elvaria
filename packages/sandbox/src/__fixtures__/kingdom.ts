// The kingdom the sandbox specs play days in: what `elvaria init` writes (two tribes, the default registry).
// The sandbox may not depend on @elvaria/registry-default (implementation-plan §1.3), so the spec reads the
// default registry's files the way a kingdom's registry/ folder is read: the scenarios are written against it.
import { readFileSync } from 'node:fs';

import { KingdomSchema, REGISTRY_FILES, parseRegistry } from '@elvaria/domain';
import type { Kingdom, Registry, RegistryFile } from '@elvaria/domain';

const DEFAULT_REGISTRY = new URL('../../../registry-default/', import.meta.url);

const readJson = (file: RegistryFile): unknown =>
  JSON.parse(readFileSync(new URL(`${file}.json`, DEFAULT_REGISTRY), 'utf8'));

function defaultRegistry(): Registry {
  const files = Object.fromEntries(REGISTRY_FILES.map((file) => [file, readJson(file)]));
  const parsed = parseRegistry(files as Record<RegistryFile, unknown>);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.error));
  return parsed.value;
}

export const REGISTRY = defaultRegistry();

export function kingdomOf(overrides: Partial<Record<keyof Kingdom, unknown>> = {}): Kingdom {
  return KingdomSchema.parse({
    version: 1,
    name: 'Bình Minh',
    created_at: '2026-11-01T08:00:00+07:00',
    tz: 'Asia/Ho_Chi_Minh',
    owner: { profession: 'developer', locale: 'vi' },
    paths: { treasury: 'C:/Users/owner/.elvaria/treasury.json' },
    tribes: [
      { id: 'claude', adapter: 'claude_code', enabled: true, max_concurrent: 2 },
      {
        id: 'gemini',
        adapter: 'antigravity',
        enabled: true,
        max_concurrent: 1,
        pools: { gemini_models: { enabled: true }, claude_gpt_models: { enabled: false } },
      },
    ],
    mana: {},
    breakers: {},
    schedule: {},
    dispatch: {},
    bell: {},
    tunnel: {},
    theme: 'fantasy',
    ui: {},
    ...overrides,
  });
}

export const KINGDOM = kingdomOf();
export const DATE = '2026-11-06';
