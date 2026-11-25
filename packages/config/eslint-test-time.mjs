// Rules for the specs that keep out the patterns behind flaky tests (fix/test-guards, (196)): a test that waits on
// the wall clock, reads it, or polls passes or fails with the load on the machine. fix/timing-flakes (#199) fixed
// each such test; these rules keep the patterns from coming back. The violations older than the rules are listed
// in the repo's eslint-suppressions.json, which may only shrink (suppressions.mjs).
import { isMember, timeoutReason } from './eslint-test-timeout.mjs';

/** @typedef {import('eslint').Rule.RuleModule} RuleModule */
/** @typedef {import('eslint').SourceCode} SourceCode */
/** @typedef {import('eslint').Scope.Scope} Scope */
/** @typedef {Parameters<SourceCode['getAncestors']>[0]} EsNode */
/** @typedef {Extract<EsNode, { type: 'Identifier' }>} Identifier */
/** @typedef {Extract<EsNode, { type: 'ImportDeclaration' }>} ImportDeclaration */

/** The globals vi.useFakeTimers() replaces; the same functions imported from node:timers stay real. */
const GLOBAL_TIMERS = ['setTimeout', 'setInterval'];
const TIMER_MODULES = new Set(['timers', 'node:timers', 'timers/promises', 'node:timers/promises']);
/** What node:timers and node:timers/promises export that waits. */
const TIMER_WAITS = new Set(['setTimeout', 'setInterval', 'scheduler']);
/** vitest helpers that re-check a condition until a deadline. */
const POLL_HELPERS = [
  { object: 'expect', property: 'poll' },
  { object: 'vi', property: 'waitFor' },
  { object: 'vi', property: 'waitUntil' },
];
/** Clock reads as `object.property`; `new Date()` and `Date()` are matched apart. */
const CLOCK_MEMBERS = [
  { object: 'Date', property: 'now' },
  { object: 'performance', property: 'now' },
  { object: 'process', property: 'hrtime' },
];
const LOOPS = new Set(['WhileStatement', 'DoWhileStatement']);
const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

/** @param {{ object: string; property: string }} member */
const memberName = ({ object, property }) => `${object}.${property}`;

/** Rule ids, as configured and as eslint-suppressions.json lists them. */
export const TEST_TIME_RULES = ['elvaria/no-real-wait', 'elvaria/no-real-clock', 'elvaria/timeout-reason'];

/**
 * Every use of a global by one of `names` (not a local or an import of the same name).
 * @param {Scope} global
 * @param {readonly string[]} names
 * @returns {Identifier[]}
 */
function globalUses(global, names) {
  const references = names.flatMap((name) => [
    ...(global.set.get(name)?.references ?? []),
    ...global.through.filter((reference) => reference.identifier.name === name),
  ]);
  return references.flatMap(({ identifier }) => (identifier.type === 'Identifier' ? [identifier] : []));
}

/**
 * Every use of what an import from node:timers or node:timers/promises binds, when it waits.
 * @param {ImportDeclaration} declaration
 * @param {SourceCode} sourceCode
 * @returns {Identifier[]}
 */
function importedWaits(declaration, sourceCode) {
  if (!TIMER_MODULES.has(String(declaration.source.value))) return [];
  return declaration.specifiers.flatMap((specifier) => {
    if (specifier.type === 'ImportSpecifier') {
      const { imported } = specifier;
      if (!TIMER_WAITS.has(imported.type === 'Identifier' ? imported.name : String(imported.value)))
        return [];
    }
    return sourceCode
      .getDeclaredVariables(specifier)
      .flatMap((variable) => variable.references)
      .flatMap(({ identifier }) => (identifier.type === 'Identifier' ? [identifier] : []));
  });
}

/**
 * The `while` or `do … while` loop an `await` repeats, if no function lies between them.
 * @param {readonly EsNode[]} ancestors
 */
function loopAround(ancestors) {
  for (const node of ancestors.toReversed()) {
    if (FUNCTIONS.has(node.type)) return undefined;
    if (LOOPS.has(node.type)) return node;
  }
  return undefined;
}

/** @type {RuleModule} */
const noRealWait = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow waiting on real time or polling in tests' },
    schema: [],
    messages: {
      timer:
        "{{name}} waits on real time, which a busy machine stretches: await the event itself (a promise, the child's exit, a line of its output), or drive a fake clock with vi.useFakeTimers().",
      helper: '{{name}} re-checks until a deadline on real time: await the event that ends the wait instead.',
      poll: 'This loop awaits until a condition holds, polling on real time: await the event that makes it hold instead.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    const polled = new Set();
    let fake = false;
    return {
      CallExpression(call) {
        if (isMember(call.callee, 'vi', 'useFakeTimers')) fake = true;
        const helper = POLL_HELPERS.find(({ object, property }) => isMember(call.callee, object, property));
        if (helper) context.report({ node: call, messageId: 'helper', data: { name: memberName(helper) } });
      },
      ImportDeclaration(declaration) {
        for (const node of importedWaits(declaration, sourceCode)) {
          context.report({ node, messageId: 'timer', data: { name: node.name } });
        }
      },
      AwaitExpression(node) {
        const loop = loopAround(sourceCode.getAncestors(node));
        if (!loop || polled.has(loop)) return;
        polled.add(loop);
        context.report({ node: loop, messageId: 'poll' });
      },
      'Program:exit'(program) {
        if (fake) return;
        for (const node of globalUses(sourceCode.getScope(program), GLOBAL_TIMERS)) {
          context.report({ node, messageId: 'timer', data: { name: node.name } });
        }
      },
    };
  },
};

/** @type {RuleModule} */
const noRealClock = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow reading the real clock in tests' },
    schema: [],
    messages: {
      clock:
        '{{name}} reads the real clock, so the result depends on when and how fast the test runs: use a fixed time (a literal date, a Clock the code takes), or vi.useFakeTimers().',
    },
  },
  create(context) {
    /** @type {{ node: EsNode; name: string; date: boolean }[]} */
    const reads = [];
    const fake = { timers: false, date: false };
    return {
      CallExpression(call) {
        fake.timers ||= isMember(call.callee, 'vi', 'useFakeTimers');
        fake.date ||= isMember(call.callee, 'vi', 'setSystemTime');
        if (call.callee.type === 'Identifier' && call.callee.name === 'Date') {
          reads.push({ node: call, name: 'Date()', date: true });
        }
      },
      NewExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'Date' && node.arguments.length === 0) {
          reads.push({ node, name: 'new Date()', date: true });
        }
      },
      MemberExpression(node) {
        const member = CLOCK_MEMBERS.find(({ object, property }) => isMember(node, object, property));
        if (member) reads.push({ node, name: memberName(member), date: member.object === 'Date' });
      },
      'Program:exit'() {
        // vi.useFakeTimers() fakes every clock read below; vi.setSystemTime() alone fakes Date only.
        for (const { node, name, date } of reads) {
          if (!fake.timers && !(date && fake.date))
            context.report({ node, messageId: 'clock', data: { name } });
        }
      },
    };
  },
};

const TEMP_MODULES = new Set(['fs', 'node:fs', 'fs/promises', 'node:fs/promises']);
const TEMP_METHODS = new Set(['mkdtemp', 'mkdtempSync']);

/**
 * @param {EsNode} node
 * @param {SourceCode} sourceCode
 */
function isTempCall(node, sourceCode) {
  if (node.type !== 'MemberExpression') return false;
  const name =
    !node.computed && node.property.type === 'Identifier'
      ? node.property.name
      : node.property.type === 'Literal'
        ? String(node.property.value)
        : '';
  const parent = sourceCode.getAncestors(node).at(-1);
  return TEMP_METHODS.has(name) && parent?.type === 'CallExpression' && parent.callee === node;
}

/**
 * Match references to the import binding, so a local variable shadowing fs is left alone.
 * @param {ImportDeclaration} declaration
 * @param {SourceCode} sourceCode
 * @returns {EsNode[]}
 */
function importedTempUses(declaration, sourceCode) {
  if (!TEMP_MODULES.has(String(declaration.source.value))) return [];
  return declaration.specifiers.flatMap(
    /** @returns {EsNode[]} */
    (specifier) => {
      if (specifier.type === 'ImportSpecifier') {
        const { imported } = specifier;
        const name = imported.type === 'Identifier' ? imported.name : String(imported.value);
        return TEMP_METHODS.has(name) ? [specifier] : [];
      }
      return sourceCode
        .getDeclaredVariables(specifier)
        .flatMap((variable) => variable.references)
        .flatMap(({ identifier }) => {
          if (identifier.type !== 'Identifier') return [];
          const member = sourceCode.getAncestors(identifier).at(-1);
          return member?.type === 'MemberExpression' &&
            member.object === identifier &&
            isTempCall(member, sourceCode)
            ? [member]
            : [];
        });
    },
  );
}

/** @type {RuleModule} */
const noMkdtemp = {
  meta: {
    type: 'problem',
    docs: { description: 'Keep temporary test folders in testkit' },
    schema: [],
    messages: { temp: 'Use tempDir from @elvaria/testkit instead of creating temporary folders directly.' },
  },
  create(context) {
    return {
      ImportDeclaration(declaration) {
        for (const node of importedTempUses(declaration, context.sourceCode)) {
          context.report({ node, messageId: 'temp' });
        }
      },
    };
  },
};

/**
 * The test-time rules on `files` (the repo's *.spec.ts).
 * @param {string[]} files
 * @returns {import('eslint').Linter.Config}
 */
export function testTimeConfig(files) {
  return {
    name: 'elvaria/tests/time',
    files,
    // Character sessions cannot read .claude/**; hook-io.spec.ts keeps its synchronous setup.
    ignores: ['.claude/**'],
    plugins: {
      elvaria: {
        meta: { name: 'elvaria' },
        rules: {
          'no-real-wait': noRealWait,
          'no-real-clock': noRealClock,
          'timeout-reason': timeoutReason,
          'no-mkdtemp': noMkdtemp,
        },
      },
    },
    rules: {
      ...Object.fromEntries(TEST_TIME_RULES.map((rule) => [rule, 'error'])),
      'elvaria/no-mkdtemp': 'error',
    },
  };
}
