// The places of the owner's secrets as policy.json carries them (SEC-01b): one spelling per place, so the hook of every
// tribe matches them by text. Moved out of tool-policy.ts with P2-01d, which needed the room.
import path from 'node:path';
import { homedir } from 'node:os';

/** Resolve home and dot segments before the policy crosses into a CLI; Windows paths use one spelling. */
export function secretPathOf(raw: string): string {
  const expanded = raw.replace(/^~(?=[\\/]|$)/, homedir());
  const windows = path.sep === '\\' || /^[a-z]:[\\/]/i.test(expanded);
  const api = windows ? path.win32 : path.posix;
  const directory = /[\\/]\*\*$/.test(expanded);
  const resolved = api.resolve(directory ? expanded.slice(0, -3) : expanded).replaceAll('\\', '/');
  const normalized = windows ? resolved.toLowerCase() : resolved;
  const literal = normalized.replace(/[[*?{}]/g, (char) => `[${char}]`);
  return directory ? `${literal}/**` : literal;
}
