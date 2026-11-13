// The look pools of the themes Elvaria ships, by kingdom.theme (PS-24). The pool is theme data the CLI, and from
// stage 2 the UI, both read, and both depend on the domain, so it lives here, beside its schema; a theme that
// ships as its own folder (themes/<name>/, stage 4) brings its pool the same way.
import { err, ok } from '../core/result.ts';
import { TribeLookPoolSchema } from '../schema/tribe-look.ts';
import fantasy from './fantasy-looks.json' with { type: 'json' };
import type { Result } from '../core/result.ts';
import type { TribeLookPool } from '../schema/tribe-look.ts';

const THEME_POOLS: Readonly<Record<string, unknown>> = { fantasy };

/** Why a theme has no pool to draw looks from. */
export type LookPoolProblem =
  | { readonly code: 'no_pool'; readonly theme: string }
  | { readonly code: 'invalid_pool'; readonly theme: string; readonly issues: readonly string[] };

/** A pool as read from its file, checked by its schema. */
export function parseLookPool(theme: string, raw: unknown): Result<TribeLookPool, LookPoolProblem> {
  const parsed = TribeLookPoolSchema.safeParse(raw);
  if (parsed.success) return ok(parsed.data);
  const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  return err({ code: 'invalid_pool', theme, issues });
}

/** The look pool of `theme` (kingdom.theme). The domain's spec parses every shipped pool, so it is never invalid. */
export function lookPoolOf(theme: string): Result<TribeLookPool, LookPoolProblem> {
  const raw = THEME_POOLS[theme];
  return raw === undefined ? err({ code: 'no_pool', theme }) : parseLookPool(theme, raw);
}
