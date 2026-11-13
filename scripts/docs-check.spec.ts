import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { CHARACTER_STATUSES, QUEST_STATUSES, RITUAL_STEPS } from '@elvaria/domain';
import { GLOSSARY } from '@elvaria/i18n';
import type { Glossary, GlossaryTable } from '@elvaria/i18n';
import { describe, expect, it } from 'vitest';

import {
  CLAUDE_MD_MAX_KB,
  DOC_MAX_KB,
  README_SECTIONS,
  adrProblems,
  checkRepo,
  readmeProblems,
  run,
  shellScriptProblems,
  sizeProblems,
  termProblems,
} from './docs-check.mjs';
import { gitRepo } from './docs-repo.mjs';

const README = `# @elvaria/x\n\n${README_SECTIONS.map((section) => `## ${section}\n\n- text\n`).join('\n')}`;

/** A tiny repo that passes every check; tests add one problem to it. */
function memoryRepo(extra: Record<string, string> = {}) {
  const files: Record<string, string> = {
    'packages/x/package.json': '{"name": "@elvaria/x"}',
    'packages/x/README.md': README,
    'packages/x/src/index.ts': 'export const steward = 1;\n',
    'docs/adr/0001-a.md': '# ADR 0001\n\n- Status: accepted · 2026-11-06\n',
    'CLAUDE.md': 'See [ADR 0001](docs/adr/0001-a.md).\n',
    ...extra,
  };
  return { list: () => Object.keys(files), read: (file: string) => files[file] };
}

const check = (extra: Record<string, string> = {}) => {
  const repo = memoryRepo(extra);
  return checkRepo(repo.list(), repo.read);
};

describe('checkRepo', () => {
  it('finds nothing in a repo that keeps every rule', () => {
    expect(check()).toEqual([]);
  });

  it('fails when someone adds a `dispatcher` identifier (implementation-plan §8, P0-07)', () => {
    const problems = check({ 'packages/x/src/tick.ts': 'export function dispatcher() {}\n' });
    expect(problems).toEqual([
      'packages/x/src/tick.ts:1: "dispatcher" uses the banned word "dispatcher"; use steward',
    ]);
  });

  it('runs every check: README, ADR, shell scripts, size, links, ids', () => {
    const problems = check({
      'apps/y/package.json': '{}',
      'docs/adr/0002-b.md': '# ADR 0002\n',
      'scripts/setup.sh': 'echo',
      'docs/big.md': 'x'.repeat(DOC_MAX_KB * 1024 + 1),
      'docs/guide.md': '[gone](missing.md)',
      'packages/registry-default/tags.json': '{"tags": [{"id": "Đa-ngôn-ngữ"}]}',
    });
    expect(problems).toEqual([
      'apps/y/README.md: missing (Does / Does not / Depends on / How to test)',
      'docs/adr/0002-b.md: no "- Status: proposed | accepted | rejected | deprecated | superseded by …" line',
      'scripts/setup.sh: shell script; write it in Node (ADR 0015)',
      'docs/big.md: 151 KB, over 150 KB; split it (the implementation plan: a new part file, or pnpm plan:split)',
      'docs/guide.md:1: broken link missing.md',
      'packages/registry-default/tags.json:1: id "Đa-ngôn-ngữ" has characters outside [a-z0-9_-] (ADR 0014)',
    ]);
  });
});

describe('readmeProblems', () => {
  it('wants the four sections, in order, and nothing else at that level', () => {
    const files = ['packages/a/package.json', 'packages/b/package.json'];
    const texts: Record<string, string> = {
      'packages/a/README.md': '# a\n\n## Does\n## Depends on\n## Does not\n## How to test\n',
      'packages/b/README.md': '# b\n\nNo sections.\n',
    };
    expect(readmeProblems(files, (file) => texts[file])).toEqual([
      'packages/a/README.md: sections are Does / Depends on / Does not / How to test, expected Does / Does not / Depends on / How to test',
      'packages/b/README.md: sections are none, expected Does / Does not / Depends on / How to test',
    ]);
  });

  it('looks only at workspaces, one level under packages/ or apps/', () => {
    expect(
      readmeProblems(['package.json', 'packages/a/node_modules/z/package.json'], () => undefined),
    ).toEqual([]);
  });
});

describe('adrProblems', () => {
  it('accepts every status the ADR template uses', () => {
    const statuses = ['proposed', 'accepted', 'rejected', 'deprecated', 'superseded by 0023'];
    const files = statuses.map((_, index) => `docs/adr/000${index}-x.md`);
    const read = (file: string) => `# ADR\n\n- Status: ${statuses[files.indexOf(file)] ?? ''}\n`;
    expect(adrProblems(files, read)).toEqual([]);
    expect(adrProblems(['docs/adr/0009-x.md'], () => '- Status: maybe')).toHaveLength(1);
    expect(adrProblems(['docs/adr/README.md'], () => '')).toEqual([]);
  });
});

describe('sizeProblems', () => {
  const read = (files: Record<string, string>) => (file: string) => files[file];

  it('lets a Markdown file in docs/ weigh up to 150 KB, counting UTF-8 bytes', () => {
    const limit = DOC_MAX_KB * 1024;
    const files = {
      'docs/at-limit.md': 'x'.repeat(limit),
      // "ạ" is 3 bytes: fewer characters than the limit, more bytes.
      'docs/plans/accented.md': 'ạ'.repeat(limit / 3 + 1),
    };
    expect(sizeProblems(Object.keys(files), read(files)).map((problem) => problem.split(':')[0])).toEqual([
      'docs/plans/accented.md',
    ]);
  });

  it('looks only at Markdown under docs/ and at CLAUDE.md', () => {
    const big = 'x'.repeat(DOC_MAX_KB * 1024 + 1);
    const files = {
      'docs/schemas/quest.schema.json': big,
      'design/notes.md': big,
      'packages/x/CLAUDE.md': big,
      'README.md': big,
    };
    expect(sizeProblems(Object.keys(files), read(files))).toEqual([]);
  });

  it('lets CLAUDE.md, which every session loads whole, weigh up to its own ceiling', () => {
    const limit = CLAUDE_MD_MAX_KB * 1024;
    expect(sizeProblems(['CLAUDE.md'], () => 'x'.repeat(limit))).toEqual([]);
    expect(sizeProblems(['CLAUDE.md'], () => `${'x'.repeat(limit)}ạ`)).toEqual([
      `CLAUDE.md: ${CLAUDE_MD_MAX_KB + 1} KB, over ${CLAUDE_MD_MAX_KB} KB; point to docs/cli.md, the plan or .claude/rules instead of repeating them`,
    ]);
    expect(CLAUDE_MD_MAX_KB).toBeLessThan(DOC_MAX_KB);
  });
});

describe('shellScriptProblems', () => {
  it('refuses .sh, .ps1, .cmd and .bat in any folder (ADR 0015)', () => {
    const files = ['a.sh', 'b/c.ps1', 'd.CMD', 'e.bat', 'f.mjs', 'g.shell'];
    expect(shellScriptProblems(files).map((problem) => problem.split(':')[0])).toEqual([
      'a.sh',
      'b/c.ps1',
      'd.CMD',
      'e.bat',
    ]);
  });
});

describe('termProblems', () => {
  it('finds the glossary in step with the domain', () => {
    expect(termProblems(GLOSSARY)).toEqual([]);
  });

  it('reports a status the domain has and the glossary lacks, or the other way round', () => {
    const idTable = (table: string, ids: readonly string[]): GlossaryTable => ({
      table,
      columns: [{ key: 'id', header: 'id', ids: ' / ' }],
      rows: ids.map((id) => ({ id: [id] })),
    });
    const quest = [...QUEST_STATUSES.filter((status) => status !== 'draft'), 'frozen'];
    const glossary: Glossary = {
      version: 1,
      title: 'Glossary',
      blocks: [],
      sections: [
        {
          heading: 'Statuses',
          blocks: [
            idTable('quest_statuses', quest),
            idTable('character_statuses', CHARACTER_STATUSES),
            idTable('ritual_steps', [...RITUAL_STEPS, 'flake_check']),
          ],
        },
      ],
    };
    expect(termProblems(glossary)).toEqual([
      'glossary table "quest_statuses" lacks draft, which domain QUEST_STATUSES has',
      'glossary table "quest_statuses" has frozen, which domain QUEST_STATUSES does not',
      'glossary: no table "events" to hold EVENT_TYPES',
    ]);
  });
});

describe('docs:check on this repo', () => {
  it('passes', () => {
    expect(run(gitRepo())).toMatchObject({ code: 0 });
  });

  it('prints every problem and exits 1', () => {
    const repo = memoryRepo({ 'packages/x/src/tick.ts': 'const dispatcher = 1;' });
    expect(run(repo)).toEqual({
      code: 1,
      text: 'docs:check: 1 problems\npackages/x/src/tick.ts:1: "dispatcher" uses the banned word "dispatcher"; use steward',
    });
  });

  it('runs as `pnpm docs:check`', () => {
    const script = fileURLToPath(new URL('docs-check.mjs', import.meta.url));
    // Only what git needs goes to the child, never process.env wholesale (CLAUDE.md).
    const keys = ['PATH', 'SystemRoot', 'HOME', 'USERPROFILE'];
    const env = Object.fromEntries(keys.map((key) => [key, process.env[key] ?? '']));
    const result = spawnSync(process.execPath, [script], { env, encoding: 'utf8' });
    expect(result.stdout).toMatch(/^docs:check: \d+ files, no problems/);
    expect(result.status).toBe(0);
  });
});
