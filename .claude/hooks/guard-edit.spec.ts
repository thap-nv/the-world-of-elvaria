import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GENERATORS, kingdomGenerators } from '../../scripts/docs-gen.mjs';
import { GENERATED_FILES, changedRegion, refusalOf, regionsOf, textAfter } from './guard-edit.mjs';
import { REPO } from './hook-io.mjs';

// Markers are assembled so that this file holds no region of its own.
const open = (name: string): string => `<!-- docs:gen ${name} -->\n`;
const close = (name: string): string => `<!-- /docs:gen ${name} -->`;
const PLAN = `# Plan\n\nintro\n\n${open('table')}| a | b |\n${close('table')}\n\noutro\n`;
const read = (): string => PLAN;
const edit = (from: string, to: string, all = false) => ({
  old_string: from,
  new_string: to,
  replace_all: all,
});

describe('refusalOf: files no one edits by hand', () => {
  it.each([
    'docs/glossary.md',
    'docs/events.md',
    'docs/dependency-graph.md',
    'docs/cli.md',
    'docs/tier-report.md',
    'docs/metrics-report.md',
    'Docs/CLI.md',
    'docs/schemas/quest.schema.json',
    'design/DESIGN-HANDOFF.md',
    'design/project/Character.dc.html',
    'docs/ke-hoach-dung-elvaria-0.7.md',
    'docs/ke-hoach-dung-elvaria-0.8.md',
  ])('refuses %s', (rel) => {
    expect(refusalOf(rel, 'Write', { content: 'x' }, () => '')).toEqual(expect.any(String));
  });

  it.each([
    'CLAUDE.md',
    'docs/implementation-plan.md',
    'docs/adr/0001-architecture.md',
    'docs/spikes/claude-2026-11.md',
    'packages/domain/src/index.ts',
    'packages/ui-kit/src/design.ts',
    'apps/cli/src/commands.ts',
  ])('allows %s', (rel) => {
    expect(refusalOf(rel, 'Edit', edit('intro', 'start'), read)).toBeUndefined();
  });

  it('says what to do instead', () => {
    expect(refusalOf('docs/cli.md', 'Edit', edit('a', 'b'), read)).toMatch(/pnpm docs:gen/);
    expect(refusalOf('docs/schemas/kingdom.schema.json', 'Write', {}, read)).toMatch(/pnpm schemas/);
    expect(refusalOf('design/x.html', 'Write', {}, read)).toMatch(/packages\/ui-kit/);
    expect(refusalOf('docs/ke-hoach-dung-elvaria-0.7.md', 'Edit', {}, read)).toMatch(/§11/);
  });
});

describe('refusalOf: generated regions of a hand-written file', () => {
  const plan = (tool: string, input: Record<string, unknown>) =>
    refusalOf('docs/implementation-plan.md', tool, input, read);

  it('allows edits around the region, and a Write that keeps it', () => {
    expect(plan('Edit', edit('outro', 'the end'))).toBeUndefined();
    expect(plan('Edit', edit('intro\n\n', 'intro, longer\n\n'))).toBeUndefined();
    expect(plan('Write', { content: PLAN.replace('outro', 'the end') })).toBeUndefined();
    expect(plan('Write', { content: `${PLAN}${open('new')}x\n${close('new')}\n` })).toBeUndefined();
  });

  it('refuses an edit inside the region, or one that moves or drops its markers', () => {
    expect(plan('Edit', edit('| a |', '| c |'))).toMatch(
      /docs:gen table --> region of docs\/implementation-plan/,
    );
    expect(plan('Edit', edit(close('table'), ''))).toEqual(expect.any(String));
    expect(plan('Edit', edit('b |\n', 'b |\nextra\n'))).toEqual(expect.any(String));
    expect(plan('Write', { content: '# Plan\n' })).toEqual(expect.any(String));
  });

  it('applies replace_all and every MultiEdit entry, in order', () => {
    expect(plan('Edit', edit('a', 'A', true))).toEqual(expect.any(String));
    expect(plan('MultiEdit', { edits: [edit('outro', 'end'), edit('| b |', '| B |')] })).toEqual(
      expect.any(String),
    );
    expect(plan('MultiEdit', { edits: [edit('intro', 'start'), 'junk', edit('', 'x')] })).toBeUndefined();
  });

  it('compares with LF, whatever the checkout or the old_string holds', () => {
    const crlf = (): string => PLAN.replaceAll('\n', '\r\n');
    expect(refusalOf('docs/implementation-plan.md', 'Edit', edit('| a |', '| c |'), crlf)).toEqual(
      expect.any(String),
    );
    expect(textAfter('Edit', edit('b |\r\n', 'z |\r\n'), crlf())).toContain('| a | z |\n');
  });

  it('lets an Edit whose old_string is absent through: Claude Code fails it anyway', () => {
    expect(plan('Edit', edit('not in the file', 'x'))).toBeUndefined();
    expect(textAfter('Edit', {}, PLAN)).toBe(PLAN);
    expect(textAfter('Write', {}, PLAN)).toBe(PLAN);
  });

  it('finds the first region that changed', () => {
    const two = `${open('one')}1\n${close('one')}\n${open('two')}2\n${close('two')}\n`;
    expect(changedRegion(two, two.replace('2\n', '3\n'))).toBe('two');
    expect(changedRegion(two, two)).toBeUndefined();
    expect(changedRegion('no regions', '')).toBeUndefined();
  });
});

describe('the generators of the repo', () => {
  it('lists every whole file docs:gen writes, the tier report of `--kingdom` too', () => {
    const whole = GENERATORS.filter((generator) => generator.region === undefined).map((g) => g.file);
    const ofKingdom = kingdomGenerators(['--kingdom', 'any']).map((generator) => generator.file);
    expect([...GENERATED_FILES].sort()).toEqual([...whole, ...ofKingdom].sort());
  });

  it('finds every generated region in its Markdown file', () => {
    for (const { file, region } of GENERATORS.filter((generator) => generator.region !== undefined)) {
      expect(file).toMatch(/\.md$/);
      expect(regionsOf(readFileSync(join(REPO, file), 'utf8')).has(region ?? '')).toBe(true);
    }
  });
});

describe('guard-edit.mjs as Claude Code runs it', () => {
  const hook = (input: string) =>
    spawnSync(process.execPath, [join(REPO, '.claude/hooks/guard-edit.mjs')], { input, encoding: 'utf8' });
  const call = (tool: string, file: string, toolInput: Record<string, unknown>) =>
    hook(JSON.stringify({ cwd: REPO, tool_name: tool, tool_input: { file_path: file, ...toolInput } }));

  it('exits 2 with the reason on stderr for a generated file', () => {
    const result = call('Write', join(REPO, 'docs', 'cli.md'), { content: 'x' });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/^Blocked by \.claude\/hooks\/guard-edit\.mjs: docs\/cli\.md is generated/);
  });

  it('reads the file on disk to guard its regions', () => {
    const plan = readFileSync(join(REPO, 'docs/implementation-plan.md'), 'utf8');
    const [line] = (regionsOf(plan).get('quest-transitions') ?? '').split('\n');
    const result = call('Edit', join(REPO, 'docs/implementation-plan.md'), edit(line ?? '', 'hand-made'));
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/quest-transitions --> region/);
  });

  it('exits 0 in silence for any other file, a file outside the checkout, and a payload that is not JSON', () => {
    expect(call('Edit', join(REPO, 'CLAUDE.md'), edit('Elvaria', 'Elvaria'))).toMatchObject({
      status: 0,
      stderr: '',
    });
    expect(call('Write', join(REPO, '..', 'design', 'x.md'), { content: 'x' }).status).toBe(0);
    expect(hook('not json').status).toBe(0);
  });
});
