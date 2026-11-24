// How Codex takes a character's model. Codex reads the prompt on stdin (spike Codex 2026-11-12 §1.4), so no command
// line grows with the prompt; how the CLI and its hook start is runner-core's `CommandLaunch`.

/** The levels of `model_reasoning_effort` the account's models take (spike §2). */
export const REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'] as const;

/**
 * A character's model as Codex takes it: `gpt-6-luna-low` → `gpt-6-luna` at effort `low`, as agy's slugs carry the
 * effort (spike §2); a slug without one of the levels at its end runs at the model's own default.
 */
export function modelOf(slug: string): { readonly model: string; readonly effort?: string } {
  const effort = REASONING_EFFORTS.find((level) => slug.endsWith(`-${level}`));
  if (effort === undefined) return { model: slug };
  const model = slug.slice(0, -(effort.length + 1));
  return model === '' ? { model: slug } : { model, effort };
}
