// The v1 contracts state their conditionals as JSON Schema `if/then`; zod checks the same rule as a predicate.
// One entry holds both halves, so the generated contract and the runtime check cannot drift apart (ADR 0003).
import type { z } from 'zod';

export interface RuleIssue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

export interface Rule<T> {
  /** The v1 `if/then` (with its `$comment`), copied into the contract's `allOf`; absent when JSON Schema cannot say it. */
  readonly contract?: Readonly<Record<string, unknown>>;
  /** What zod checks: the issues of `value`, none when the rule holds. */
  readonly check: (value: T) => readonly RuleIssue[];
}

/** One issue when `broken`, none otherwise. */
export const issueIf = (
  broken: boolean,
  path: readonly PropertyKey[],
  message: string,
): readonly RuleIssue[] => (broken ? [{ path, message }] : []);

/** A superRefine callback that adds the issues of every rule; refinements add issues, they never throw. */
export const checkRules =
  <T>(rules: readonly Rule<T>[]) =>
  (value: T, ctx: z.RefinementCtx): void => {
    for (const issue of rules.flatMap((rule) => rule.check(value))) {
      ctx.addIssue({ code: 'custom', path: [...issue.path], message: issue.message });
    }
  };

/** The contract's `allOf`: the JSON half of every rule that has one, in rule order. */
export const allOfRules = <T>(rules: readonly Rule<T>[]): Readonly<Record<string, unknown>>[] =>
  rules.flatMap((rule) => (rule.contract === undefined ? [] : [rule.contract]));
