// The band under the HUD's top bar (implementation-plan §2.7; design Hud.dc.html: scenes sandbox, defense, cli,
// sleeping). The world and the lite client draw the same band from the same state, so the choice is one pure
// selector here, not two copies in two renderers.
import type { CampaignId, TribeId } from '../core/ids.ts';
import type { Campaign } from '../schema/campaign/campaign.ts';

/** Whether a tribe's CLI can take quests: installed and logged in (`elvaria doctor`, mana probes). */
export type ToolState = 'ready' | 'missing' | 'logged_out';

/**
 * What the band is derived from: mana × tools × sandbox flag × defense (§2.7). The world state (P0-09) holds
 * these fields, so `bannerOf(state)` takes it as it is.
 */
export interface BannerSource {
  /** The state replays a sandbox day: everything on screen is fake. */
  readonly sandbox: boolean;
  readonly tribes: readonly { readonly id: TribeId; readonly enabled: boolean; readonly tool: ToolState }[];
  /** Mana per pool (ADR 0009); a tribe with one pool names it after itself. */
  readonly pools: readonly { readonly tribe: TribeId; readonly pool: string; readonly asleep: boolean }[];
  readonly campaigns: readonly Pick<Campaign, 'id' | 'mode' | 'status'>[];
}

export type Banner =
  | { readonly kind: 'sandbox' }
  /** A defense campaign is under way (an incident): the band links to the war room. */
  | { readonly kind: 'defense'; readonly campaigns: readonly CampaignId[] }
  | {
      readonly kind: 'tool_unavailable';
      readonly tribes: readonly { readonly tribe: TribeId; readonly tool: Exclude<ToolState, 'ready'> }[];
    }
  | {
      readonly kind: 'asleep';
      readonly pools: readonly { readonly tribe: TribeId; readonly pool: string }[];
    };

const UNDER_WAY: readonly Campaign['status'][] = ['declared', 'active'];

/**
 * The one band to show, or null for none. The HUD has room for one, so the most pressing wins: fake data must
 * never pass for real, an incident beats routine, and a CLI that needs the owner beats mana that comes back by
 * itself. Disabled tribes take no quests and raise no band.
 */
export function bannerOf(source: BannerSource): Banner | null {
  if (source.sandbox) return { kind: 'sandbox' };
  const defenses = source.campaigns.filter(
    ({ mode, status }) => mode === 'defense' && UNDER_WAY.includes(status),
  );
  if (defenses.length > 0) return { kind: 'defense', campaigns: defenses.map(({ id }) => id) };
  const enabled = new Set(source.tribes.filter((tribe) => tribe.enabled).map(({ id }) => id));
  const tools = source.tribes.flatMap(({ id, enabled: on, tool }) =>
    on && tool !== 'ready' ? [{ tribe: id, tool }] : [],
  );
  if (tools.length > 0) return { kind: 'tool_unavailable', tribes: tools };
  const asleep = source.pools.flatMap(({ tribe, pool, asleep: sleeps }) =>
    sleeps && enabled.has(tribe) ? [{ tribe, pool }] : [],
  );
  return asleep.length > 0 ? { kind: 'asleep', pools: asleep } : null;
}
