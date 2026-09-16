import type { FastifyInstance } from "fastify";
import { findBookABet } from "../betway/client";
import { prisma } from "../db/client";
import { calculateTotalOdds } from "../domain/odds";
import { isLegBettable } from "../domain/staleness";
import { InvalidCodeError } from "../httpErrors";

interface ResolveBody {
  bookingCode: string;
}

export function registerResolveRoute(app: FastifyInstance): void {
  app.post<{ Body: ResolveBody }>(
    "/api/booking-codes/resolve",
    {
      schema: {
        body: {
          type: "object",
          required: ["bookingCode"],
          properties: {
            bookingCode: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (request) => {
      const { bookingCode } = request.body;
      const result = await findBookABet(bookingCode);

      if (result.kind === "dead") {
        await prisma.bookingCodeRequest.create({
          data: { operation: "resolve", bookingCode, status: "invalid_code" },
        });
        throw new InvalidCodeError();
      }

      // docs/betway-api.md §2: outcomeName carries a trailing space on Totals ("Over ") and
      // isn't self-describing alone; marketName is already the qualified display string, so
      // only outcomeName needs trimming here.
      const selections = result.selections.map((selection) => ({
        outcomeId: selection.outcomeId,
        marketId: selection.marketId,
        marketName: selection.marketName,
        outcomeName: selection.outcomeName.trim(),
        eventId: selection.eventId,
        eventName: selection.eventName,
        eventEpoch: selection.eventEpoch,
        priceDecimal: selection.priceDecimal,
        isBettable: isLegBettable(selection),
      }));

      await prisma.bookingCodeRequest.create({
        data: {
          operation: "resolve",
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
