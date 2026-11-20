/** Claude Code's supported effort levels; a missing suffix keeps the CLI default. */
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

export function modelOf(slug: string): { readonly model: string; readonly effort?: string } {
  const effort = EFFORTS.find((level) => slug.endsWith(`-${level}`));
  if (effort === undefined) return { model: slug };
  const model = slug.slice(0, -(effort.length + 1));
  return model === '' ? { model: slug } : { model, effort };
}

export function modelArgs(slug: string): string[] {
  const { model, effort } = modelOf(slug);
  return ['--model', model, ...(effort === undefined ? [] : ['--effort', effort])];
}
