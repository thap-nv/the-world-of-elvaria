// A small world for the specs, parsed by the domain's schemas so every fixture is a valid file: the default
// registry (read from packages/registry-default, which runner-core may not import), one territory shaped like
// dc1-se-team, a knight and a judge, a quest in review and the verdict that returned it.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  CharacterSchema,
  CheckIdSchema,
  QuestSchema,
  REGISTRY_FILES,
  TerritorySchema,
  VerdictSchema,
  parseRegistry,
} from '@elvaria/domain';
import type { Registry } from '@elvaria/domain';

import type { PromptCheck } from '../prompt/checks.ts';

const REGISTRY_DIR = path.join(import.meta.dirname, '..', '..', '..', 'registry-default');

function defaultRegistry(): Registry {
  const files = Object.fromEntries(
    REGISTRY_FILES.map((file) => [
      file,
      JSON.parse(readFileSync(path.join(REGISTRY_DIR, `${file}.json`), 'utf8')) as unknown,
    ]),
  ) as Record<(typeof REGISTRY_FILES)[number], unknown>;
  const parsed = parseRegistry(files);
  if (!parsed.ok) throw new Error(`default registry: ${JSON.stringify(parsed.error)}`);
  return parsed.value;
}

export const REGISTRY = defaultRegistry();

export const QUEST_ID = 'q_20261106_7k3m2a';

export const TERRITORY = TerritorySchema.parse({
  version: 1,
  id: 'dc1-se-team',
  name: 'dc1-se-team',
  path: 'D:/Dummy/Tool - DC1/dc1-se-team',
  kind: 'code',
  vcs: { type: 'git', default_branch: 'main' },
  commands: {
    setup: 'pnpm install --prefer-offline',
    test: 'pnpm test',
    lint: 'pnpm lint',
    typecheck: 'pnpm typecheck',
    generate: ['pnpm api:openapi'],
  },
  checks: [
    { id: 'lint', run: 'pnpm lint', when: ['**/*.ts'], timeout_minutes: 10 },
    { id: 'unit', run: 'pnpm -r test', when: ['apps/**/*.ts'], timeout_minutes: 15 },
    { id: 'e2e', run: 'pnpm e2e', when: ['apps/web/src/routes/**'], exclusive: true, timeout_minutes: 60 },
  ],
  laws: {
    forbidden_paths: ['.env', 'infra/secrets/**'],
    read_only_paths: ['apps/api/openapi.json', 'packages/shared/src/api-types.ts'],
    forbidden_commands: [String.raw`drizzle-kit\s+(drop|push)`],
  },
});

const character = (fields: Record<string, unknown>) =>
  CharacterSchema.parse({
    version: 1,
    level: 3,
    reputation: { window: [] },
    status_since: '2026-11-06T09:12:03+07:00',
    consecutive_fail: { count: 0 },
    stats: { quests_done: 4, tokens_today: 0, tokens_day: '2026-11-06' },
    created_at: '2026-11-05T08:00:00+07:00',
    ...fields,
  });

export const THORN = character({
  id: 'thorn',
  name: 'Thorn',
  class: 'knight',
  tribe: 'claude',
  model: 'claude-sonnet-5-5',
  status: 'working',
  current: { quest: QUEST_ID, role: 'assignee' },
  vow_no_production: false,
});

export const SABLE = character({
  id: 'sable',
  name: 'Sable',
  class: 'judge',
  tribe: 'gemini',
  model: 'gemini-4-argon-high',
  status: 'reviewing',
  current: { quest: QUEST_ID, role: 'verifier' },
  vow_no_production: true,
});

const ASSIGNEE_ATTEMPT = {
  n: 1,
  character: 'thorn',
  role: 'assignee',
  started_at: '2026-11-06T09:12:03+07:00',
  ended_at: '2026-11-06T09:41:20+07:00',
  outcome: 'submitted',
  session_id: '6f1c2d9e-3b4a-4c8e-9f0a-1b2c3d4e5f60',
  tokens: 182340,
  run_dir: `.runs/${QUEST_ID}-1`,
};

export const QUEST = QuestSchema.parse({
  version: 1,
  id: QUEST_ID,
  title: 'Thêm script pnpm check',
  description: 'Thêm script `pnpm check` gom lint + typecheck + test + i18n:check; cập nhật README.',
  kind: 'build',
  rank: 'D',
  class_required: 'knight',
  tags: ['infra'],
  territory: 'dc1-se-team',
  status: 'review',
  tier: 'session',
  assignee: 'thorn',
  verifier: 'sable',
  depends_on: [],
  budget: { max_minutes: 45, max_tokens: 400000, max_attempts: 3 },
  estimate: { tokens: 200000, minutes: 30 },
  attempts: 1,
  attempt_log: [
    ASSIGNEE_ATTEMPT,
    {
      n: 1,
      character: 'sable',
      role: 'verifier',
      started_at: '2026-11-06T09:43:00+07:00',
      run_dir: `.runs/${QUEST_ID}-1/verify`,
    },
  ],
  plot: {
    type: 'worktree',
    path: `D:/Dummy/Tool - DC1/dc1-se-team/.elvaria/worktrees/${QUEST_ID}`,
    branch: `quest/${QUEST_ID}`,
  },
  deliverable: { type: 'branch', branch: `quest/${QUEST_ID}` },
  seal_required: true,
  secrets_required: [],
  checks_run: ['lint', 'unit'],
  created_by: 'chancellor',
  created_at: '2026-11-06T09:05:00+07:00',
  updated_at: '2026-11-06T09:43:00+07:00',
});

export const RETURNED = VerdictSchema.parse({
  version: 1,
  id: `${QUEST_ID}-1`,
  quest_id: QUEST_ID,
  attempt: 1,
  verifier_id: 'sable',
  ritual: 'build_review',
  checks: [{ id: 'unit', pass: true, duration_ms: 41000, log_path: `.runs/${QUEST_ID}-1/checks/unit.log` }],
  result: 'fail',
  fail_kind: 'incomplete',
  notes: 'Script `check` mới không có test; README chưa nói `pnpm check` chạy i18n:check.',
  by_human: false,
  session_id: '0a9b8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d',
  created_at: '2026-11-06T10:02:00+07:00',
});

/** The verdict a judge leaves when it stops before the end of its review (§3.2): the next judge reads on. */
export const PARTIAL = VerdictSchema.parse({
  version: 1,
  id: `${QUEST_ID}-1-p1`,
  quest_id: QUEST_ID,
  attempt: 1,
  verifier_id: 'vesper',
  ritual: 'build_review',
  checks: [],
  result: 'partial',
  notes: 'package.json và README đã đọc, khớp nhau; chưa đọc tới test.',
  progress: { checked_until: 'read_diff: package.json, README.md' },
  by_human: false,
  session_id: '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e',
  created_at: '2026-11-06T09:58:00+07:00',
});

/** The class prompts of the default registry, as a kingdom has them in registry/prompts/ (P1-15). */
export const classPromptOf = (id: string): string =>
  readFileSync(path.join(REGISTRY_DIR, 'prompts', `${id}.md`), 'utf8');

export const LETTER = `# Handover · ${QUEST_ID}

## Where I am

Script \`check\` đã thêm vào package.json, README đã cập nhật.

## Done

- \`pnpm check\` chạy lint, typecheck, test, i18n:check (commit 1a2b3c4).

## Not done

-

## Tried and failed

- \`pnpm -r check\`: mỗi package không có script \`check\`.

## Decisions taken

- Gọi \`pnpm i18n:check\` sau cùng vì nó chậm nhất.

## Next step

Nộp.

## Question
`;

export const JOURNAL = Array.from(
  { length: 25 },
  (_, index) =>
    `{"v":1,"type":"agent.tool","quest":"${QUEST_ID}","attempt":1,"data":{"tool":"read","path":"src/file-${index + 1}.ts"}}`,
);

export const DIFF = `diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -5,6 +5,7 @@
   "scripts": {
+    "check": "pnpm lint && pnpm typecheck && pnpm test && pnpm i18n:check",
     "lint": "eslint ."`;

export const DECREE = `- Commit messages follow Conventional Commits and say why.
- Never add author or attribution lines to a commit.`;

/** The machine checks a verifier reads: one passed, one failed with the end of its log, already masked (P1-25). */
export const CHECKS: readonly PromptCheck[] = [
  {
    id: CheckIdSchema.parse('lint'),
    pass: true,
    duration_ms: 8200,
    log_path: '.runs/q_20261106_7k3m2a-1/checks/lint.log',
  },
  {
    id: CheckIdSchema.parse('unit'),
    pass: false,
    duration_ms: 41000,
    log_path: '.runs/q_20261106_7k3m2a-1/checks/unit.log',
    log_tail: [
      ' FAIL  src/api/orders.spec.ts > total > applies the discount',
      'AssertionError: expected 120 to be 108',
      ' Test Files  1 failed | 12 passed (13)',
    ].join('\n'),
  },
];
