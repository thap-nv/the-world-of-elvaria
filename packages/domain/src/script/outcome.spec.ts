import { describe, expect, it } from 'vitest';

import { SCRIPT_DETAIL_MAX, UNITS_LISTED_MAX } from './constants.ts';
import { scriptOutcomeOf } from './outcome.ts';
import type { ScriptRun } from './outcome.ts';

const run = (fields: Partial<ScriptRun>): ScriptRun => ({
  exit_code: 0,
  timed_out: false,
  stdout: '',
  stderr: '',
  ...fields,
});
const said = (output: unknown, fields: Partial<ScriptRun> = {}): ScriptRun =>
  run({ stdout: `${JSON.stringify(output)}\n`, ...fields });

const unit = (id: string, outcome: string) => ({ id, label: `docs/${id}.md`, outcome });

describe('scriptOutcomeOf: a result in the shape of produces', () => {
  it('reads a check, pass or fail, its details as the summary', () => {
    const details = { check_id: 'lint', exit_code: 1 };
    expect(scriptOutcomeOf('check', said({ pass: false, details }))).toEqual({
      kind: 'result',
      pass: false,
      summary: JSON.stringify(details),
    });
    expect(scriptOutcomeOf('check', said({ pass: true, details: null }))).toEqual({
      kind: 'result',
      pass: true,
      summary: 'null',
    });
  });

  it('clips long details', () => {
    const outcome = scriptOutcomeOf(
      'check',
      said({ pass: true, details: 'x'.repeat(SCRIPT_DETAIL_MAX * 2) }),
    );
    expect(outcome).toMatchObject({ kind: 'result' });
    expect(outcome.kind === 'result' && outcome.summary.length).toBe(SCRIPT_DETAIL_MAX + 1);
  });

  it('reads a report, which always passes', () => {
    const report = { summary: '12 files, 340 lines in 3 folders', data: { files: 12 } };
    expect(scriptOutcomeOf('report', said(report))).toEqual({
      kind: 'result',
      pass: true,
      summary: report.summary,
    });
  });

  it('reads units: a batch passes only when every unit is done, and the summary names the others', () => {
    const units = [unit('a', 'done'), unit('b', 'not_done'), unit('c', 'done'), unit('d', 'needs_user')];
    expect(scriptOutcomeOf('units', said({ units }))).toEqual({
      kind: 'result',
      pass: false,
      units,
      summary:
        '4 units: 2 done, 1 not_done, 1 needs_user\n- b (not_done): docs/b.md\n- d (needs_user): docs/d.md',
    });
    const done = [unit('a', 'done')];
    expect(scriptOutcomeOf('units', said({ units: done }))).toMatchObject({
      pass: true,
      summary: '1 units: 1 done',
    });
    expect(scriptOutcomeOf('units', said({ units: [] }))).toMatchObject({ pass: true, summary: '0 units' });
  });

  it('lists at most UNITS_LISTED_MAX open units and counts the rest', () => {
    const units = Array.from({ length: UNITS_LISTED_MAX + 3 }, (_, index) => unit(`u${index}`, 'not_done'));
    const outcome = scriptOutcomeOf('units', said({ units }));
    const lines = outcome.kind === 'result' ? outcome.summary.split('\n') : [];
    expect(lines).toHaveLength(UNITS_LISTED_MAX + 2);
    expect(lines.at(-1)).toBe('… and 3 more');
  });

  it('ignores blank lines around the one JSON line, and CRLF', () => {
    expect(scriptOutcomeOf('report', run({ stdout: '\r\n{"summary":"ok","data":1}\r\n\r\n' }))).toMatchObject(
      {
        kind: 'result',
        pass: true,
      },
    );
  });
});

describe('scriptOutcomeOf: anything else', () => {
  it('a run past its timeout, whatever its code', () => {
    expect(scriptOutcomeOf('check', run({ timed_out: true, exit_code: null }))).toEqual({ kind: 'timeout' });
  });

  it('exit 2: params or context the script cannot use, with what stderr said', () => {
    const stopped = run({ exit_code: 2, stderr: 'params.globs must be a non-empty list of strings\n' });
    expect(scriptOutcomeOf('units', stopped)).toEqual({
      kind: 'usage',
      detail: 'params.globs must be a non-empty list of strings',
    });
  });

  it.each([
    [run({ exit_code: 1, stderr: 'boom' }), 'boom'],
    [run({ exit_code: 1, stderr: 'y'.repeat(SCRIPT_DETAIL_MAX + 5) }), `${'y'.repeat(SCRIPT_DETAIL_MAX)}…`],
    [run({ exit_code: 3 }), 'exit code 3'],
    [run({ exit_code: null }), 'exit code none (killed)'],
    [run({ stdout: '' }), 'stdout has 0 lines, the contract is one JSON line'],
    [run({ stdout: '{}\n{}\n' }), 'stdout has 2 lines, the contract is one JSON line'],
    [run({ stdout: 'done\n' }), 'stdout is not JSON'],
    [said({ pass: 'yes', details: {} }), 'stdout is not the output of produces = check'],
    [said({ pass: true }), 'stdout is not the output of produces = check'],
  ])('a broken script: %j', (broken, detail) => {
    expect(scriptOutcomeOf('check', broken)).toEqual({ kind: 'broken', detail });
  });

  it('units outside the quest contract are output outside the script contract', () => {
    const units = [unit('a', 'done'), unit('a', 'done')];
    expect(scriptOutcomeOf('units', said({ units }))).toMatchObject({ kind: 'broken' });
    expect(scriptOutcomeOf('report', said({ summary: '' }))).toMatchObject({ kind: 'broken' });
  });
});
