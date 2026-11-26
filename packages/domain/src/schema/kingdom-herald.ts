// kingdom.herald: where the Herald listens and which origins it lets in (P2-01, ADR 0031 item 4; wave-1 plan W12), out
// of kingdom.ts to keep it under the size limit. Optional with every key defaulted, so a kingdom file written before
// it stays valid at version 1. There is no address to choose: the Herald binds 127.0.0.1 only (ADR 0031 item 1).
import { z } from 'zod';

import { unique } from './common.ts';

const describe = (description: string) => ({ description });

/** The port `elvaria herald` listens on unless `--port` says otherwise for one run. */
const HERALD_PORT = 7411;
const PORT_MAX = 65_535;

/** An origin as a browser sends it: scheme, host and an optional port, no path, lower case. */
const ORIGIN_PATTERN = /^https?:\/\/[a-z0-9.-]+(?::[0-9]{1,5})?$/;

export const HeraldSchema = z
  .strictObject({
    port: z
      .int()
      .min(1)
      .max(PORT_MAX)
      .default(HERALD_PORT)
      .meta(describe('The loopback port the Herald listens on.')),
    origins: unique(z.array(z.string().regex(ORIGIN_PATTERN)))
      .default(() => [])
      .meta(
        describe(
          "Origins the Herald accepts besides its own loopback origin, which it always accepts: the tunnel's (e.g. https://elvaria.example.ts.net), added by the owner. A request through one of them is source lite; through loopback, source herald (ADR 0031 item 5).",
        ),
      ),
  })
  .prefault({});
