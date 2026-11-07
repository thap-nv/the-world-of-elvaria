// The fake-only scenario `leak` of fake-claude.mjs (not a conformance scenario): it prints each line of env
// FAKE_CLAUDE_LEAK (a JSON list of secrets) everywhere a CLI can, in its text, a Bash command its hooks see, a
// notification, stderr and the result, for the specs of implementation-plan §3.9. `cli` holds fake-claude's own
// helpers: speak, runHooks, writeLetter, finish.
import process from 'node:process';

export function leak(play, cli) {
  const lines = JSON.parse(process.env.FAKE_CLAUDE_LEAK ?? '[]');
  const command = `echo ${lines.join(' ')}`;
  const tool = { tool_name: 'Bash', tool_input: { command }, cwd: process.cwd() };
  cli.speak(play, [
    { type: 'text', text: lines.join('\n') },
    { type: 'tool_use', id: 'toolu_fake_leak', name: 'Bash', input: { command } },
  ]);
  cli.runHooks(play.settings, 'PreToolUse', { session_id: play.id, ...tool });
  const response = { stdout: lines.join('\n'), stderr: '', interrupted: false };
  cli.runHooks(play.settings, 'PostToolUse', { session_id: play.id, ...tool, tool_response: response });
  cli.runHooks(play.settings, 'Notification', { session_id: play.id, message: lines.join(' ') });
  process.stderr.write(`${lines.join('\n')}\n`);
  cli.writeLetter(play);
  return cli.finish(play, { result: lines.join('\n') });
}
