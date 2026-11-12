// `elvaria territory graph <id> [--commit <ref>] [--query "<words>"]` (PS-21, ADR 0029): builds the territory's code
// graph at a commit (the default branch's tip by default) with the pinned graphify, or finds it built, and asks it
// one question; 0 mana, no model. For the owner and for trying a territory before its `code_graph` goes on, so it
// runs whatever that switch says. The Steward writes the `graph.*` lines of its own builds; this command writes none:
// what it built is on disk, and the Steward finds it there.
import { textOption } from '../args.ts';
import { EXIT } from '../command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { graphsOf } from '../run/graphs.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { Territory, TerritoryId } from '@elvaria/domain';
import type { CodeGraphs, GraphBuild } from '@elvaria/runner-core';

/** The commit `ref` names in the territory's repo, the default branch's tip without one; undefined: none. */
async function commitOf(
  graphs: CodeGraphs,
  territory: Territory,
  ref: string | undefined,
): Promise<string | null> {
  return graphs.head(
    ref === undefined ? territory : { ...territory, vcs: { ...territory.vcs, default_branch: ref } },
  );
}

function printBuild(
  ctx: KingdomContext,
  territory: TerritoryId,
  build: Extract<GraphBuild, { ok: true }>,
): void {
  const { t, io } = ctx;
  if (build.reused) {
    io.out(t('cli.territory.graph.reused', { territory, commit: build.commit, dir: build.dir }));
    return;
  }
  const nodes = build.nodes === null ? '?' : String(build.nodes);
  const edges = build.edges === null ? '?' : String(build.edges);
  const seconds = (build.duration_ms / 1000).toFixed(1);
  io.out(
    t('cli.territory.graph.built', {
      territory,
      commit: build.commit,
      nodes,
      edges,
      seconds,
      dir: build.dir,
    }),
  );
}

async function runTerritoryGraph(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const { t, io } = ctx;
  const id = input.positionals[0] ?? '';
  const territory = (await ctx.store.territories.list()).items.find((item) => item.id === id);
  if (territory === undefined) {
    io.err(t('cli.territory.graph.unknown', { id }));
    return EXIT.failed;
  }
  if (territory.vcs.type !== 'git') {
    io.err(t('cli.territory.graph.no_git', { id }));
    return EXIT.failed;
  }
  const graphs = await graphsOf(ctx.kingdom, ctx.store.root, io);
  if (graphs === undefined) {
    io.err(t('cli.territory.graph.no_graphify'));
    return EXIT.failed;
  }
  const ref = textOption(input, 'commit');
  const commit = await commitOf(graphs, territory, ref);
  if (commit === null) {
    io.err(t('cli.territory.graph.no_commit', { ref: ref ?? territory.vcs.default_branch ?? '' }));
    return EXIT.failed;
  }
  const build = await graphs.build(territory, commit);
  if (!build.ok) {
    io.err(t('cli.territory.graph.failed', { commit, reason: build.reason }));
    return EXIT.failed;
  }
  printBuild(ctx, territory.id, build);
  const question = textOption(input, 'query');
  if (question === undefined) return EXIT.ok;
  const answer = await graphs.ask(build.dir, ['query', question], io.cwd);
  io.out(answer.stdout.trimEnd());
  if (answer.exit_code === 0) return EXIT.ok;
  io.err(t('cli.territory.graph.query_failed', { reason: answer.stderr.trim() || String(answer.exit_code) }));
  return EXIT.failed;
}

export const TERRITORY_GRAPH: CommandSpec = {
  name: ['territory', 'graph'],
  summary: 'cli.territory.graph.summary',
  args: [{ name: '<id>', help: 'cli.territory.graph.arg.id' }],
  options: {
    commit: { type: 'string', value: '<ref>', help: 'cli.territory.graph.option.commit' },
    query: { type: 'string', value: '<words>', help: 'cli.territory.graph.option.query' },
  },
  run: runTerritoryGraph,
};
