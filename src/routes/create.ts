import type { FastifyInstance } from "fastify";
import { bookABet, findBookABet } from "../betway/client";
import { prisma } from "../db/client";
import { normalizeSelection } from "../domain/normalizeSelection";
import { calculateTotalOdds } from "../domain/odds";
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
      const { bookingCode } = await bookABet(outcomeIds);

      // docs/betway-api.md §3: BookABet neither validates outcome ids (a dead id still
      // returns a well-formed code) nor that selections can coexist (same-event conflicts
      // round-trip cleanly). The only way to catch either is to decode the code we just
      // created before handing it back.
      const decoded = await findBookABet(bookingCode);

      if (decoded.kind === "dead") {
        await prisma.bookingCodeRequest.create({
          data: { operation: "create", bookingCode, status: "invalid_code" },
        });
        throw new InvalidCodeError();
      }

      const eventIds = decoded.selections.map((selection) => selection.eventId);
      const hasConflict = new Set(eventIds).size !== eventIds.length;
      if (hasConflict) {
        await prisma.bookingCodeRequest.create({
          data: {
            operation: "create",
            bookingCode,
            status: "conflicting_selections",
            legCount: decoded.selections.length,
          },
        });
        throw new ConflictingSelectionsError();
      }

      const selections = decoded.selections.map(normalizeSelection);

      await prisma.bookingCodeRequest.create({
        data: {
          operation: "create",
          bookingCode,
          status: "ok",
          legCount: selections.length,
        },
      });

      return {
        bookingCode,
        selections,
        totalOdds: calculateTotalOdds(selections.map((selection) => selection.priceDecimal)),
      };
    },
  );
}
