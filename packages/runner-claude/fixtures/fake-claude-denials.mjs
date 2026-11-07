// How fake-claude.mjs words a refused Bash call, as Claude Code 2.1.318 shows it to the model: a PreToolUse hook's
// JSON deny, or a `permissions.deny` rule of the run's settings. Moved out of fake-claude.mjs unchanged, to keep that
// file under 300 lines (ADR 0006).

/** The reason a deny answer of a PreToolUse hook gives, as the CLI shows it to the model. */
export function hookDenial(answers) {
  const decisions = answers.flatMap((answer) => {
    try {
      return [JSON.parse(answer).hookSpecificOutput];
    } catch {
      return [];
    }
  });
  const deny = decisions.find((decision) => decision?.permissionDecision === 'deny');
  return deny === undefined ? undefined : `PreToolUse:Bash hook error: ${deny.permissionDecisionReason}`;
}

export function ruleDenial(settings, command) {
  const prefixes = (settings.permissions?.deny ?? [])
    .map((rule) => /^Bash\((.+):\*\)$/.exec(rule)?.[1])
    .filter(Boolean);
  return prefixes.some((prefix) => command.startsWith(prefix))
    ? `Permission to use Bash with command ${command} has been denied.`
    : undefined;
}
