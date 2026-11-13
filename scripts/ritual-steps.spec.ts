import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { main, stepsChange } from './ritual-steps.mjs';

const OLD = ['run_checks', 'read_plan', 'challenge_scope', 'judge', 'write_verdict'];
const NEW = ['run_checks', 'read_plan', 'check_plan_ready', 'challenge_scope', 'judge', 'write_verdict'];
const OTHER = {
  id: 'build_review',
  steps: ['run_checks', 'judge', 'write_verdict'],
  pass_rule: 'all_checks_and_agent',
};
const NOW = new Date('2026-11-13T08:30:05.123Z');

const file = (steps: readonly string[]) => ({
  version: 1,
  rituals: [OTHER, { id: 'council_review', steps, pass_rule: 'all_checks_and_agent', max_seconds: 1800 }],
});

let dir: string;
let kingdom: string;
let lines: string[];
const ritualsPath = () => path.join(kingdom, 'registry', 'rituals.json');
const write = (steps: readonly string[]) => {
  writeFileSync(ritualsPath(), `${JSON.stringify(file(steps), null, 2)}\n`);
};
const stepsNow = () =>
  (JSON.parse(readFileSync(ritualsPath(), 'utf8')) as ReturnType<typeof file>).rituals[1]?.steps;
const run = (...args: string[]) =>
  main(['--kingdom', kingdom, ...args], {
    out: (line: string) => lines.push(line),
    now: NOW,
    defaults: path.join(dir, 'defaults.json'),
  });

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'elvaria ritual steps '));
  kingdom = path.join(dir, 'my kingdom');
  mkdirSync(path.join(kingdom, 'registry'), { recursive: true });
  writeFileSync(path.join(dir, 'defaults.json'), JSON.stringify(file(NEW)));
  lines = [];
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('ritual-steps (PS-06: check_plan_ready reaches a running kingdom)', () => {
  it('adds the default steps after a backup, and leaves the other rituals and fields as they were', () => {
    write(OLD);
    expect(run()).toBe(0);
    expect(stepsNow()).toEqual(NEW);
    const after = JSON.parse(readFileSync(ritualsPath(), 'utf8')) as ReturnType<typeof file>;
    expect(after.rituals[0]).toEqual(OTHER);
    expect(after.rituals[1]).toMatchObject({ pass_rule: 'all_checks_and_agent', max_seconds: 1800 });
    const backup = path.join(kingdom, '.backup', '20261113-083005-ritual-steps', 'registry', 'rituals.json');
    expect(JSON.parse(readFileSync(backup, 'utf8'))).toEqual(file(OLD));
    expect(lines.at(-1)).toBe(`  backup: ${backup}`);
    expect(existsSync(`${ritualsPath()}.tmp-${String(process.pid)}`)).toBe(false);
    lines = [];
    expect(run()).toBe(0);
    expect(lines.at(-1)).toBe('  already the default steps; nothing to do');
  });

  it('writes nothing on --dry-run, and refuses steps the owner changed otherwise unless --force', () => {
    write(OLD);
    expect(run('--dry-run')).toBe(0);
    expect(stepsNow()).toEqual(OLD);
    const own = ['run_checks', 'judge', 'read_plan', 'write_verdict'];
    write(own);
    expect(run()).toBe(1);
    expect(stepsNow()).toEqual(own);
    expect(lines.at(-1)).toContain('nothing written (--force replaces them)');
    expect(run('--force')).toBe(0);
    expect(stepsNow()).toEqual(NEW);
  });

  it('says so for a ritual neither registry has, and asks for the kingdom', () => {
    write(OLD);
    expect(run('--ritual', 'no_such')).toBe(1);
    expect(lines).toEqual(["no_such: no such ritual in the kingdom's registry or in the default one"]);
    lines = [];
    expect(main([], { out: (line: string) => lines.push(line), now: NOW })).toBe(2);
    expect(lines[0]).toMatch(/^usage: /);
  });

  it('decides from the steps alone', () => {
    const change = stepsChange(file(['run_checks', 'judge']), file(NEW), 'council_review', false);
    expect(change).toEqual({ status: 'update', from: ['run_checks', 'judge'], to: NEW });
    expect(stepsChange(file(OLD), { rituals: [] }, 'council_review', false)).toEqual({
      status: 'missing',
    });
  });

  it('reads the default registry of the repo when no other is given', () => {
    write(OLD);
    expect(
      main(['--kingdom', kingdom, '--dry-run'], { out: (line: string) => lines.push(line), now: NOW }),
    ).toBe(0);
    expect(lines[1]).toBe(`  becomes: ${NEW.join(', ')}`);
  });
});
