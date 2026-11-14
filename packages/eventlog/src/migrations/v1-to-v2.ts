/** Upgrade in memory only: preserve every field except v and a legacy infirmary reason (ADR 0003). */
export function v1ToV2(old: unknown): unknown {
  const line = old as Record<string, unknown>;
  const data = line.data;
  if (
    line.type === 'quest.infirmary' &&
    typeof data === 'object' &&
    data !== null &&
    'reason' in data &&
    typeof data.reason === 'string'
  ) {
    return { ...line, v: 2, data: { ...data, reason: { code: 'legacy', params: { text: data.reason } } } };
  }
  return { ...line, v: 2 };
}
