// One Bell that rings several (P2-03): the console, the desktop, and next to them the web push of P2-08. Each rings
// on its own: one that throws or rejects is reported and the others still ring, and the ring itself never fails, so
// the Steward's tick never sees a broken bell.
import type { Bell } from '@elvaria/steward';

export function fanOut(bells: readonly Bell[], failed: (error: unknown) => void): Bell {
  return {
    ring: async (notice) => {
      // `async` turns a bell that throws at once into a rejection like the others.
      const outcomes = await Promise.allSettled(bells.map(async (bell) => bell.ring(notice)));
      for (const outcome of outcomes) {
        if (outcome.status === 'rejected') failed(outcome.reason);
      }
    },
  };
}
