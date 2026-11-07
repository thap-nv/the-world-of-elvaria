// The model family a slug belongs to (implementation-plan §3.2, ADR 0008): the "other tribe" of principle 4 means
// another family of models, because one CLI serves several (Antigravity runs Claude, Gemini and GPT models).
// Derived from the slug, never stored (character schema). The table is data, so a new family is one more row.

/** Each family and the first word of the slugs that belong to it. */
const MODEL_FAMILIES: readonly { readonly family: string; readonly heads: readonly string[] }[] = [
  { family: 'claude', heads: ['claude'] },
  { family: 'gemini', heads: ['gemini'] },
  { family: 'gpt', heads: ['gpt', 'codex', 'o1', 'o3', 'o4'] },
];

/**
 * `claude-opus-5-5` → `claude`, `gemini-4-argon-medium` → `gemini`, `gpt-oss-120b-medium` → `gpt`. A slug of no
 * known family is its own first word, so two models of an unknown maker still count as one family.
 */
export function familyOf(model: string): string {
  const [head = model] = model.split('-');
  return MODEL_FAMILIES.find(({ heads }) => heads.includes(head))?.family ?? head;
}
