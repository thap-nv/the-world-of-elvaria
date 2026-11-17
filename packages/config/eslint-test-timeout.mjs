// A test that sets its own timeout says why beside it (fix/test-guards, (196)). A bare ceiling hides whether the
// test is slow by design (a live CLI, a real process tree) or because it waits on the clock, and the next flaky
// run then gets a larger number instead of a fix.

/** @typedef {import('eslint').Rule.RuleModule} RuleModule */
/** @typedef {import('eslint').SourceCode} SourceCode */
/** @typedef {import('eslint').Scope.Scope} Scope */
/** @typedef {Parameters<SourceCode['getAncestors']>[0]} EsNode */
/** @typedef {Extract<EsNode, { type: 'Identifier' }>} Identifier */
/** @typedef {Extract<EsNode, { type: 'CallExpression' }>} CallExpression */
/** @typedef {{ on: (line: number) => boolean; below: (line: number) => boolean }} CommentLines */

/** vitest calls that take a timeout, as an option or as the argument after the test function. */
const TEST_CALLS = new Set([
  'it',
  'test',
  'describe',
  'suite',
  'bench',
  'beforeAll',
  'beforeEach',
  'afterAll',
  'afterEach',
]);
const TIMEOUT_KEYS = new Set(['timeout']);
/** `vi.setConfig` keys that set the timeout of every test or hook in the file. */
const CONFIG_KEYS = new Set(['testTimeout', 'hookTimeout']);

/**
 * The identifier a callee chain starts from: `it` for `it.each(table)` or `describe.skipIf(x)`.
 * @param {EsNode} node
 * @returns {string | undefined}
 */
function rootName(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression') return rootName(node.object);
  if (node.type === 'CallExpression') return rootName(node.callee);
  return undefined;
}

/**
 * Whether `node` is `object.property`, as in `vi.useFakeTimers`.
 * @param {EsNode} node
 * @param {string} object
 * @param {string} property
 */
export function isMember(node, object, property) {
  return (
    node.type === 'MemberExpression' &&
    node.object.type === 'Identifier' &&
    node.object.name === object &&
    node.property.type === 'Identifier' &&
    node.property.name === property
  );
}

/** @param {EsNode} node */
const isFunction = (node) => node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression';

/**
 * @param {EsNode} node
 * @param {Set<string>} keys
 * @returns {EsNode[]} the properties of an object literal named one of `keys`
 */
function propertiesNamed(node, keys) {
  if (node.type !== 'ObjectExpression') return [];
  return node.properties.flatMap((property) =>
    property.type === 'Property' &&
    !property.computed &&
    property.key.type === 'Identifier' &&
    keys.has(property.key.name)
      ? [property]
      : [],
  );
}

/**
 * The timeouts a call sets: a `timeout` option, the argument after the test function (`it(name, fn, 10_000)`), or
 * a `vi.setConfig` key.
 * @param {CallExpression} call
 * @returns {EsNode[]}
 */
function timeoutsOf(call) {
  if (isMember(call.callee, 'vi', 'setConfig')) {
    return call.arguments.flatMap((argument) => propertiesNamed(argument, CONFIG_KEYS));
  }
  const name = rootName(call.callee);
  if (name === undefined || !TEST_CALLS.has(name)) return [];
  const afterFunction = call.arguments.findIndex(isFunction) + 1;
  return call.arguments.flatMap((argument, index) => {
    if (argument.type === 'ObjectExpression') return propertiesNamed(argument, TIMEOUT_KEYS);
    const trailing = afterFunction > 0 && index >= afterFunction;
    return trailing && !isFunction(argument) && argument.type !== 'SpreadElement' ? [argument] : [];
  });
}

/**
 * Where the comments of a file sit: `on(line)` when one starts on that line, `below(line)` when a comment on lines
 * of its own ends just above it.
 * @param {SourceCode} sourceCode
 * @returns {CommentLines}
 */
function commentLines(sourceCode) {
  const starts = new Set();
  const under = new Set();
  for (const { loc } of sourceCode.getAllComments()) {
    if (!loc) continue;
    starts.add(loc.start.line);
    const before = sourceCode.lines[loc.start.line - 1]?.slice(0, loc.start.column) ?? '';
    if (before.trim() === '') under.add(loc.end.line + 1);
  }
  return { on: (line) => starts.has(line), below: (line) => under.has(line) };
}

/** @param {EsNode} node */
const firstLine = (node) => node.loc?.start.line ?? 0;

/**
 * The identifiers an arithmetic expression is built from: `MINUTE` in `3 * MINUTE`.
 * @param {EsNode} node
 * @returns {Identifier[]}
 */
function identifiersIn(node) {
  if (node.type === 'Identifier') return [node];
  if (node.type === 'BinaryExpression') return [...identifiersIn(node.left), ...identifiersIn(node.right)];
  if (node.type === 'UnaryExpression') return identifiersIn(node.argument);
  return [];
}

/**
 * Whether `identifier` names a variable of this file declared beside a comment.
 * @param {Identifier} identifier
 * @param {SourceCode} sourceCode
 * @param {CommentLines} lines
 */
function declaredWithReason(identifier, sourceCode, lines) {
  /** @type {Scope | null} */
  let scope = sourceCode.getScope(identifier);
  while (scope && !scope.set.has(identifier.name)) scope = scope.upper;
  const definition = scope?.set.get(identifier.name)?.defs[0];
  if (definition?.type !== 'Variable') return false;
  const parent = sourceCode.getAncestors(definition.parent).at(-1);
  const statement = parent?.type === 'ExportNamedDeclaration' ? parent : definition.parent;
  return lines.below(firstLine(statement)) || lines.on(statement.loc?.end.line ?? 0);
}

/**
 * A reason is a comment on the timeout's line, a comment just above it or above the test call, or one beside
 * the declaration of a constant the timeout is built from.
 * @param {EsNode} timeout
 * @param {CallExpression} call
 * @param {SourceCode} sourceCode
 * @param {CommentLines} lines
 */
function hasReason(timeout, call, sourceCode, lines) {
  const line = firstLine(timeout);
  if (lines.on(line) || lines.below(line) || lines.below(firstLine(call))) return true;
  const value = timeout.type === 'Property' ? timeout.value : timeout;
  return identifiersIn(value).some((identifier) => declaredWithReason(identifier, sourceCode, lines));
}

/** @type {RuleModule} */
export const timeoutReason = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Require a comment saying why a test sets its own timeout' },
    schema: [],
    messages: {
      reason:
        "Say in a comment why this test needs more than vitest's default timeout (above it, beside it, or beside the constant it uses): a ceiling with no reason grows at the next flaky run instead of the test being fixed.",
    },
  },
  create(context) {
    const { sourceCode } = context;
    const lines = commentLines(sourceCode);
    return {
      CallExpression(call) {
        for (const timeout of timeoutsOf(call)) {
          if (!hasReason(timeout, call, sourceCode, lines))
            context.report({ node: timeout, messageId: 'reason' });
        }
      },
    };
  },
};
