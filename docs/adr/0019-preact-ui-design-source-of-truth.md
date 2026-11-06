# ADR 0019 · 2D UI is Preact + signals; design/ is the first source of the design system, ui-kit owns it after the port

- Status: accepted · 2026-11-06
- Related: [implementation-plan.md](../implementation-plan.md) §1.1, §2.7, §7, §9.1 items 18–19; [DESIGN-HANDOFF.md](../../design/DESIGN-HANDOFF.md)

## Context

Design v0.2 in `design/` holds the real design system `elvaria.css` (`--elv-*` tokens, `.elv-*` classes, night and day themes), the icon set in `Icons.dc.html`, components, 10 desktop screens, 4 phone screens, 15 state screens and 6 flows. The phone lite client (stage 2) and the HUD over Three.js (stage 3) share these components. Principle 8: light is a law, so an idle UI must cost nothing. The owner decided (2026-11-06) that `design/` is only the first source: the design may change while coding, without changing `design/`.

## Decision

- 2D UI: Preact + `@preact/signals`, built with Vite. No CSS-in-JS, no Tailwind.
- `design/` v0.2 is the **seed**, imported once when `@elvaria/ui-kit` is created (stage 2):
  - `pnpm ui:import` copies `design/project/elvaria.css` and runs `scripts/gen-icons.mjs`, which reads the `renderVals()` block of `Icons.dc.html` and writes `icons.ts` (viewBox 16, stroke 1.5), renaming VI slugs to EN ids through `scripts/icon-names.json` and failing on an unknown icon.
  - Fonts are self-hosted (Alegreya, Source Sans 3, Grenze Gotisch, Cinzel; latin + vietnamese subsets; OFL, `LICENSES.md`).
- After the import, **`packages/ui-kit` (CSS, icons, tokens) and `packages/ui` (Preact components with the real `.elv-*` classes) are the source of truth**. Design changes are made there, by quests, with tests and screenshots; `design/` stays frozen as the v0.2 record and is never edited. There is no CI drift check against `design/`.
- A later design drop (a new folder such as `design/v0.3/`) is merged into `ui-kit`/`ui` by a quest, using `ui:import` as a helper; it never overwrites code silently.
- Domain does not rename itself after the design; it maps through pure functions and theme data: `statusToneOf` (12 quest statuses → the `data-status` tones of the ui-kit CSS, 8 in v0.2), `characterToneOf` (idle → no icon), `bannerOf` (HUD scene), `rankTierOf`, `gearTierOf`; `themes/fantasy/{kinds,classes,tribes}.json` map ids to icons and title keys. A test reads the tones from the current CSS source (`design/` until ui-kit exists, then ui-kit).
- Port order follows the handoff: phone screens in stage 2; HUD and main screens in stage 3; first open, open realm, war room and muster in stage 4.

## Alternatives

- React (as in dc1): same JSX, larger runtime and re-render cost at idle.
- Keep `design/` as the permanent source with a drift check: every UI tweak would need a design round-trip first.

## Consequences

- The UI evolves in code like everything else; `docs/` and screenshots in tests record what it looks like now.
- Feedback for a future design round (EN icon ids, two mana pools, script-tier badge, crests for new tribes, missing settings group) is in implementation-plan.md §9.1 item 19.
