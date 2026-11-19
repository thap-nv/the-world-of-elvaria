import { describe, expect, it } from 'vitest';

import { VerdictIdSchema } from '../core/ids.ts';
import { scriptureEditOf } from './edit.ts';
import {
  AT,
  COMMAND,
  FAIL,
  NEW_ID,
  addOf,
  entryOfMonk,
  factsOf,
  fileOf,
  ledgerOf,
  mergeOf,
  monkFileOf,
  monkId,
  retireOf,
  scopeOf,
  stateOf,
} from './__fixtures__/report.ts';
import type { Ulid } from '../core/ids.ts';
import type { AddOperation, ScriptureOperation } from '../schema/temple/operation.ts';
import type { LessonIssueCode } from './issues.ts';
import type { ScriptureEdit } from './edit.ts';
import type { ScriptureFile } from './ledger.ts';
import type { EditFacts, TempleState } from './refusal.ts';

const edited = (state: TempleState, operation: ScriptureOperation, facts = factsOf()): ScriptureEdit => {
  const result = scriptureEditOf(state, operation, facts);
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.error)}`);
  return result.value;
};

const refusalOf = (state: TempleState, operation: ScriptureOperation, facts = factsOf()) => {
  const result = scriptureEditOf(state, operation, facts);
  return result.ok ? undefined : result.error;
};

/** The state with the edit's files written over it. */
const after = (state: TempleState, edit: ScriptureEdit): TempleState => ({
  ...state,
  files: state.files.map((file) => edit.files.find(({ owner }) => owner === file.owner) ?? file),
});

const fileIn = (state: TempleState, owner: string): ScriptureFile =>
  state.files.find((file) => file.owner === owner) ?? fileOf(owner, []);

const OWNER_TEXT = '# Temple\r\n\r\n- Hand-written rule.\r\n';

describe('scriptureEditOf: retire', () => {
  const temple: ScriptureFile = {
    owner: 'temple',
    text: `${OWNER_TEXT}- [${monkId(1)}] {tribe=codex fail_kind=wrong_facts} Monk rule.\r\n- Last rule.`,
    ledger: ledgerOf(entryOfMonk(monkId(1))),
  };
  const state = stateOf([temple, fileOf('thorn', []), fileOf('vale', [])]);

  it("takes the Monk's line out, every other byte kept, and the ledger keeps what it said", () => {
    const edit = edited(state, retireOf(monkId(1)));
    expect(edit.files).toEqual([
      {
        owner: 'temple',
        text: `${OWNER_TEXT}- Last rule.`,
        ledger: ledgerOf(
          entryOfMonk(monkId(1), {
            retired: { at: AT, by: 'monk', text: 'Monk rule.', why: 'never helped', command: COMMAND },
          }),
        ),
      },
    ]);
    expect(edit.events).toEqual([
      {
        type: 'lesson.retired',
        data: { lesson: monkId(1), owner: 'temple', by: 'monk', why: 'never helped' },
      },
    ]);
  });

  it("refuses the owner's line and a line no scripture has", () => {
    const copied = fileOf('vale', [`- [${monkId(9)}] The owner put a Monk id here.`]);
    const mixed = stateOf([temple, copied]);
    expect(refusalOf(mixed, retireOf(monkId(9)))).toEqual({ code: 'not_monk_lesson', lesson: monkId(9) });
    expect(refusalOf(mixed, retireOf(monkId(8)))).toEqual({ code: 'unknown_lesson', lesson: monkId(8) });
  });

  it('writes nothing when applied again, and completes a retire the Steward stopped in', () => {
    const once = after(state, edited(state, retireOf(monkId(1))));
    expect(edited(once, retireOf(monkId(1)))).toEqual({ files: [], events: [] });
    // Stopped after the ledger: the Markdown still has the line.
    const halfway = after(state, {
      files: [{ ...temple, ledger: fileIn(once, 'temple').ledger }],
      events: [],
    });
    const completed = edited(halfway, retireOf(monkId(1)));
    expect(completed.files.map(({ text }) => text)).toEqual([`${OWNER_TEXT}- Last rule.`]);
    expect(completed.events).toHaveLength(1);
    // Another report finds it retired already: no line of the Monk any more.
    const other = factsOf({ command: '01JF0000000000000000000001' as Ulid });
    expect(refusalOf(once, retireOf(monkId(1)), other)).toEqual({
      code: 'unknown_lesson',
      lesson: monkId(1),
    });
  });

  it('keeps the id as the sentence of a line the owner emptied', () => {
    const emptied = stateOf([fileOf('temple', [`- [${monkId(1)}]`], ledgerOf(entryOfMonk(monkId(1))))]);
    const [file] = edited(emptied, retireOf(monkId(1))).files;
    expect(file?.ledger.lessons[0]?.retired?.text).toBe(monkId(1));
  });

  it('leaves alone an entry of the same id the owner deleted, or another report retired, elsewhere', () => {
    const otherReport = { ...entryOfMonk(monkId(1)), retired: { at: AT, by: 'monk', text: 'Old.' } } as const;
    const files = [
      fileOf('temple', [`- [${monkId(1)}] Monk rule.`], ledgerOf(entryOfMonk(monkId(1)))),
      fileOf('thorn', [], ledgerOf(entryOfMonk(monkId(1)))),
      fileOf('vale', [], ledgerOf(otherReport)),
    ];
    const edit = edited(stateOf(files), retireOf(monkId(1)));
    expect(edit.files.map(({ owner, text }) => [owner, text])).toEqual([['temple', '']]);
  });
});

describe('scriptureEditOf: add', () => {
  const state = stateOf([
    fileOf('temple', ['# Temple', '- Hand-written rule.']),
    fileOf('thorn', []),
    fileOf('vale', []),
  ]);

  it('appends one line at the end and its entry, with the version of the one tribe in scope', () => {
    const operation = addOf({
      scope: scopeOf({ tribe: ['claude'] }),
      text: '  Run the checks before you hand in.  ',
    });
    const edit = edited(state, operation);
    expect(edit.files).toEqual([
      {
        owner: 'temple',
        text: `# Temple\n- Hand-written rule.\n- [${NEW_ID}] {tribe=claude fail_kind=tests_fail} Run the checks before you hand in.\n`,
        ledger: ledgerOf({
          id: NEW_ID,
          source: 'monk',
          source_verdict: FAIL,
          cli_version: '2.1.327',
          added_at: AT,
        }),
      },
    ]);
    expect(edit.events).toEqual([
      {
        type: 'lesson.added',
        data: {
          lesson: NEW_ID,
          owner: 'temple',
          scope: { tribe: ['claude'] },
          fail_kind: 'tests_fail',
          source: 'monk',
          source_verdict: FAIL,
        },
      },
    ]);
  });

  it('records no version for no tribe, two tribes, or a tribe never checked', () => {
    const versionOf = (scope: Record<string, string[]>, facts = factsOf()) =>
      edited(state, addOf({ scope: scopeOf(scope) }), facts).files[0]?.ledger.lessons[0]?.cli_version;
    expect(versionOf({})).toBeUndefined();
    expect(versionOf({ tribe: ['claude', 'codex'] })).toBeUndefined();
    expect(versionOf({ tribe: ['gemini'] })).toBeUndefined();
  });

  it('refuses a line without a source verdict, or whose verdict is no fail', () => {
    expect(refusalOf(state, addOf({ source_verdict: undefined }))).toEqual({ code: 'no_source_verdict' });
    expect(refusalOf(state, addOf({ source_verdict: VerdictIdSchema.parse('q_20261118_bbbbbb-1') }))).toEqual(
      {
        code: 'unknown_verdict',
      },
    );
    expect(refusalOf(state, addOf({ source_verdict: VerdictIdSchema.parse('q_20261118_cccccc-1') }))).toEqual(
      {
        code: 'unknown_verdict',
      },
    );
  });

  it('refuses a scripture of nobody', () => {
    expect(refusalOf(state, addOf({ owner: 'ghost' }))).toEqual({ code: 'unknown_owner' });
  });

  it.each<[string, Partial<AddOperation>, LessonIssueCode[]]>([
    ['a URL', { text: 'See https://example.com first.' }, ['url']],
    ['a hidden character', { text: 'Run​ the checks.' }, ['hidden_char']],
    ['a line break', { text: 'Run the checks.\nThen hand in.' }, ['hidden_char']],
    ['a secret', { text: 'Use the key sk-12345 to sign.' }, ['secret']],
    ['no fail kind', { fail_kind: undefined }, ['missing_fail_kind']],
    ['a scope the kingdom does not know', { scope: scopeOf({ tribe: ['nobody'] }) }, ['unknown_value']],
    [
      'a long sentence with a URL',
      { text: `${'Run the checks. '.repeat(20)}https://x.io` },
      ['too_long', 'url'],
    ],
  ])('refuses %s as lint', (_, change, issues) => {
    expect(refusalOf(state, addOf(change))).toEqual({ code: 'lint', issues });
  });

  it('refuses a sentence a scripture it loads with has already, in any case and spacing', () => {
    const own = stateOf([
      fileOf('temple', []),
      fileOf('thorn', ['- RUN the   checks before you hand in.']),
      fileOf('vale', []),
    ]);
    expect(refusalOf(own, addOf({ owner: 'thorn' }))).toEqual({ code: 'duplicate' });
    expect(refusalOf(own, addOf())).toEqual({ code: 'duplicate' });
    expect(refusalOf(own, addOf({ owner: 'vale' }))).toBeUndefined();
  });

  it('completes an add the Steward stopped in, and writes nothing the second time', () => {
    const done = after(state, edited(state, addOf()));
    expect(edited(done, addOf())).toEqual({ files: [], events: [] });
    const ledgerOnly = after(state, {
      files: [{ ...fileIn(state, 'temple'), ledger: fileIn(done, 'temple').ledger }],
      events: [],
    });
    const completed = edited(ledgerOnly, addOf());
    expect(completed.files.map(({ text }) => text)).toEqual([fileIn(done, 'temple').text]);
    expect(completed.events.map(({ type }) => type)).toEqual(['lesson.added']);
    const textOnly = after(state, {
      files: [{ ...fileIn(done, 'temple'), ledger: fileIn(state, 'temple').ledger }],
      events: [],
    });
    expect(edited(textOnly, addOf()).files).toEqual([fileIn(done, 'temple')]);
  });
});

describe('scriptureEditOf: merge', () => {
  const temple = monkFileOf('temple', 2, 1, '{fail_kind=tests_fail} ');
  const thorn = monkFileOf('thorn', 1, 3);
  const state = stateOf([temple, thorn, fileOf('vale', ['- Owner rule.'])]);
  const operation = mergeOf([monkId(1), monkId(3)], { text: 'Monk rule temple 1.' });

  it('takes the lines out of every scripture and appends the one that replaces them', () => {
    const edit = edited(state, operation);
    expect(edit.events.map(({ type, data }) => [type, data.owner, data.lesson])).toEqual([
      ['lesson.retired', 'temple', monkId(1)],
      ['lesson.retired', 'thorn', monkId(3)],
      ['lesson.added', 'temple', NEW_ID],
    ]);
    const done = after(state, edit);
    expect(fileIn(done, 'temple').text).toBe(
      `- [${monkId(2)}] {fail_kind=tests_fail} Monk rule temple 2.\n- [${NEW_ID}] {fail_kind=tests_fail} Monk rule temple 1.\n`,
    );
    expect(fileIn(done, 'thorn').text).toBe('');
    expect(fileIn(done, 'thorn').ledger.lessons[0]?.retired?.merged_into).toBe(NEW_ID);
    expect(fileIn(done, 'temple').ledger.lessons[2]?.merged_from).toEqual([monkId(1), monkId(3)]);
    expect(edited(done, operation)).toEqual({ files: [], events: [] });
  });

  it("refuses a merge of the owner's line, naming it", () => {
    const owners = stateOf([temple, thorn, fileOf('vale', [`- [${monkId(7)}] Owner line.`])]);
    expect(refusalOf(owners, mergeOf([monkId(1), monkId(7)]))).toEqual({
      code: 'not_monk_lesson',
      lesson: monkId(7),
    });
  });

  it('completes a merge stopped after the ledgers: no check stands in its way', () => {
    const edit = edited(state, operation);
    const ledgersOnly: TempleState = {
      ...state,
      files: state.files.map((file) => ({ ...file, ledger: fileIn(after(state, edit), file.owner).ledger })),
    };
    const facts: EditFacts = factsOf();
    expect(edited(ledgersOnly, operation, facts).files.map(({ owner }) => owner)).toEqual([
      'temple',
      'thorn',
    ]);
    // Stopped after one ledger of an old line only: the new line is not anywhere yet.
    const oneLedger: TempleState = {
      ...state,
      files: state.files.map((file) =>
        file.owner === 'thorn' ? { ...file, ledger: fileIn(after(state, edit), 'thorn').ledger } : file,
      ),
    };
    expect(edited(oneLedger, operation).events.map(({ type }) => type)).toEqual([
      'lesson.retired',
      'lesson.retired',
      'lesson.added',
    ]);
  });
});
