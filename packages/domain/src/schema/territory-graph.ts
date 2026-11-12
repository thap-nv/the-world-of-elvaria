// The territory's switch for its code graph (PS-21, ADR 0029), apart from territory.ts so the territory schema stays
// one file. Optional and added after v1 (version stays 1): absent reads as off, and a prompt with it off is the same
// to the character as before PS-21.
import { z } from 'zod';

export const CodeGraphFlagSchema = z.boolean().optional().meta({
  description:
    "On: the Steward builds a code graph of the territory with graphify (no model, kingdom.programs.graphify) at the commit each quest's branch forked from, outside every plot, and a class that searches code (Glob or Grep, no bare Bash deny) asks it with `graphify query`, `path`, `explain` and `affected`. A git territory only. Off or absent: no graph, no command, no prompt block.",
});
