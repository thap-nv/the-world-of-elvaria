// A small kingdom for the specs, parsed by the domain's schemas: the default registry (read from
// packages/registry-default, which the Chancellor may not import), dc1-se-team and a handbook, two Chancellors
// and a knight, and the Chancellor's replies as a CLI hands them over (`structured_output`, one file each).
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  CouncilSchema,
  CharacterSchema,
  REGISTRY_FILES,
  TerritorySchema,
  TribeSchema,
  parseRegistry,
  poolsOf,
} from '@elvaria/domain';
import type { ChancellorChoice, Character, Registry } from '@elvaria/domain';
import type { ChancellorContext } from '@elvaria/runner-core';

const REGISTRY_DIR = path.join(import.meta.dirname, '..', '..', '..', 'registry-default');
const REPLIES_DIR = path.join(import.meta.dirname, 'structured-output');

const json = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));

function defaultRegistry(): Registry {
  const files = Object.fromEntries(
    REGISTRY_FILES.map((file) => [file, json(path.join(REGISTRY_DIR, `${file}.json`))]),
  ) as Record<(typeof REGISTRY_FILES)[number], unknown>;
  const parsed = parseRegistry(files);
  if (!parsed.ok) throw new Error(`default registry: ${JSON.stringify(parsed.error)}`);
  return parsed.value;
}

export const REGISTRY = defaultRegistry();

/** `structured_output` of one reply: `link-check`, `split`, `party`, `vague`, `screened`, `two-questions`. */
export const reply = (name: string): unknown => json(path.join(REPLIES_DIR, `${name}.json`));

const territory = (fields: Record<string, unknown>) =>
  TerritorySchema.parse({
    version: 1,
    vcs: { type: 'git', default_branch: 'main' },
    commands: {},
    checks: [],
    laws: { forbidden_paths: [], forbidden_commands: [] },
    ...fields,
  });

export const DC1 = territory({
  id: 'dc1-se-team',
  name: 'dc1-se-team',
  path: 'D:/Dummy/Tool - DC1/dc1-se-team',
  kind: 'code',
  secrets_allowed: ['database_url'],
});

export const HANDBOOK = territory({
  id: 'handbook',
  name: 'Sổ tay',
  path: 'D:/Dummy/handbook',
  kind: 'docs',
  vcs: { type: 'none' },
});

const character = (fields: Record<string, unknown>): Character =>
  CharacterSchema.parse({
    version: 1,
    level: 3,
    reputation: { window: [] },
    status: 'idle',
    status_since: '2026-11-07T08:00:00+07:00',
    vow_no_production: false,
    consecutive_fail: { count: 0 },
    stats: { quests_done: 0, tokens_today: 0, tokens_day: '2026-11-07' },
    created_at: '2026-11-05T08:00:00+07:00',
    ...fields,
  });

export const ALDRIC = character({
  id: 'aldric',
  name: 'Aldric',
  class: 'chancellor',
  tribe: 'claude',
  model: 'claude-sonnet-5-5',
});

export const VESNA = character({
  id: 'vesna',
  name: 'Vesna',
  class: 'chancellor',
  tribe: 'gemini',
  model: 'gemini-4-argon-medium',
});

export const THORN = character({
  id: 'thorn',
  name: 'Thorn',
  class: 'knight',
  tribe: 'claude',
  model: 'claude-sonnet-5-5',
});

const chancellorClass = REGISTRY.classes.find(({ id }) => id === 'chancellor');
if (chancellorClass === undefined) throw new Error('default registry: no chancellor class');
export const CHANCELLOR_CLASS_ENTRY = chancellorClass;

export const NATIVE: ChancellorChoice = { character: ALDRIC, structured_output: 'native' };
export const PARSED: ChancellorChoice = { character: VESNA, structured_output: 'prompt_and_parse' };

export const CONTEXT: ChancellorContext = {
  utterance: 'Kiểm tra link trong docs',
  locale: 'vi',
  decree: null,
  class_prompt: readFileSync(path.join(REGISTRY_DIR, chancellorClass.prompt_file), 'utf8'),
  territories: [DC1, HANDBOOK],
  registry: REGISTRY,
  roster: [ALDRIC, VESNA, THORN],
  mana: poolsOf([
    TribeSchema.parse({ id: 'claude', adapter: 'claude_code', enabled: true, max_concurrent: 1 }),
  ]),
  context_budget_tokens: 120_000,
  council: CouncilSchema.parse({}),
};
