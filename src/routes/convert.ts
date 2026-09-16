import type { FastifyInstance } from "fastify";
import { bookABet, findBookABet } from "../betway/client";
import { prisma } from "../db/client";
import { normalizeSelection } from "../domain/normalizeSelection";
import { calculateTotalOdds } from "../domain/odds";
import { isLegBettable } from "../domain/staleness";
import { InvalidCodeError } from "../httpErrors";

interface ConvertBody {
  bookingCode: string;
}

export function registerConvertRoute(app: FastifyInstance): void {
  app.post<{ Body: ConvertBody }>(
    "/api/booking-codes/convert",
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
      const decoded = await findBookABet(bookingCode);

      if (decoded.kind === "dead") {
        await prisma.bookingCodeRequest.create({
          data: { operation: "convert", bookingCode, status: "invalid_code" },
        });
        throw new InvalidCodeError();
      }

      const bettable = decoded.selections.filter(isLegBettable);
      const dead = decoded.selections.filter((selection) => !isLegBettable(selection));

      if (bettable.length === 0) {
        // Every leg failed the six staleness signals — there's nothing left to re-encode.
        await prisma.bookingCodeRequest.create({
          data: { operation: "convert", bookingCode, status: "invalid_code", legCount: 0 },
        });
        throw new InvalidCodeError();
      }

      const { bookingCode: resultCode } = await bookABet(
        bettable.map((selection) => selection.outcomeId),
      );

      await prisma.bookingCodeRequest.create({
        data: {
          operation: "convert",
          bookingCode,
          resultCode,
          status: "ok",
          legCount: bettable.length,
        },
      });

      const selections = bettable.map(normalizeSelection);
      const removedLegs = dead.map(normalizeSelection);

      return {
        bookingCode: resultCode,
        selections,
        removedLegs,
        totalOdds: calculateTotalOdds(selections.map((selection) => selection.priceDecimal)),
      };
    },
  );
}
