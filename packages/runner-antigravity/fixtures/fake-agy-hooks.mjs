// The hooks fake-agy.mjs knows of: those of `<cwd>/.agents/hooks.json`, and the list `agy -p /hooks` prints (spike
// Antigravity §3). Apart from the fake so that it stays within the 300 lines of a file.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/** `.agents/hooks.json` of the workspace, listed as `agy -p /hooks` lists it (fixture hooks-json.jsonl). */
export function declaredHooks() {
  const file = path.join(process.cwd(), '.agents', 'hooks.json');
  if (!existsSync(file)) return [];
  return Object.entries(JSON.parse(readFileSync(file, 'utf8'))).map(([name, events]) => ({
    name,
    enabled: true,
    source: file,
    actions: Object.entries(events).flatMap(([event, handlers]) =>
      handlers.flatMap((handler) => (handler.hooks ?? [handler]).map(({ command }) => ({ event, command }))),
    ),
  }));
}

/** What `agy -p /hooks` answers; env ELVARIA_FAKE_AGY_GLOBAL_HOOK adds a hook of the owner's own. */
export function hookList(env) {
  const global = env.ELVARIA_FAKE_AGY_GLOBAL_HOOK;
  const extra = global === undefined ? [] : [{ name: 'mine', enabled: true, source: global, actions: [] }];
  const hooks = [...declaredHooks(), ...extra];
  return {
    conversation_id: '',
    status: 'SUCCESS',
    response: '',
    command: { name: 'hooks', data: { hooks } },
  };
}
