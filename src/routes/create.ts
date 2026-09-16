import type { FastifyInstance } from "fastify";
import { bookABet, findBookABet } from "../betway/client";
import { UpstreamError } from "../betway/errors";
import { logRequest } from "../db/logRequest";
import { normalizeSelection } from "../domain/normalizeSelection";
import { calculateTotalOdds } from "../domain/odds";
import { isLegBettable } from "../domain/staleness";
import { ConflictingSelectionsError, InvalidCodeError } from "../httpErrors";

interface CreateBody {
  outcomeIds: string[];
}

export function registerCreateRoute(app: FastifyInstance): void {
  app.post<{ Body: CreateBody }>(
    "/api/booking-codes",
    {
      schema: {
        body: {
          type: "object",
          required: ["outcomeIds"],
          properties: {
            outcomeIds: {
              type: "array",
              items: { type: "string", minLength: 1 },
              minItems: 1,
            },
          },
        },
      },
    },
    async (request) => {
      const { outcomeIds } = request.body;

      try {
        const { bookingCode } = await bookABet(outcomeIds);

        // docs/betway-api.md §3: BookABet neither validates outcome ids (a dead id still
        // returns a well-formed code) nor that selections can coexist (same-event conflicts
        // round-trip cleanly). The only way to catch either is to decode the code we just
        // created before handing it back.
        const decoded = await findBookABet(bookingCode);

        if (decoded.kind === "dead") {
          logRequest({ operation: "create", bookingCode, status: "invalid_code" });
          throw new InvalidCodeError();
        }

        const eventIds = decoded.selections.map((selection) => selection.eventId);
        const hasConflict = new Set(eventIds).size !== eventIds.length;
        if (hasConflict) {
          logRequest({
            operation: "create",
            bookingCode,
            status: "conflicting_selections",
            legCount: decoded.selections.length,
          });
          throw new ConflictingSelectionsError();
        }

        // Same six-signal staleness check convert/resolve apply: BookABet can hand back a
        // well-formed code whose legs went stale (suspended market, finished event) in the
        // moment between selection and confirm. Without this, create would return a 200 for
        // a booking code that's already dead on arrival.
        if (!decoded.selections.some(isLegBettable)) {
          logRequest({
            operation: "create",
            bookingCode,
            status: "invalid_code",
            legCount: decoded.selections.length,
          });
          throw new InvalidCodeError();
        }

        const selections = decoded.selections.map(normalizeSelection);
        logRequest({ operation: "create", bookingCode, status: "ok", legCount: selections.length });

        return {
          bookingCode,
          selections,
          totalOdds: calculateTotalOdds(selections.map((selection) => selection.priceDecimal)),
        };
      } catch (err) {
        if (err instanceof UpstreamError) {
          logRequest({ operation: "create", status: "upstream_error" });
        }
        throw err;
      }
    },
  );
}
