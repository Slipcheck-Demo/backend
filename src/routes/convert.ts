import type { FastifyInstance } from "fastify";
import { bookABet, findBookABet } from "../betway/client";
import { normalizeSelection } from "../domain/normalizeSelection";
import { calculateTotalOdds } from "../domain/odds";
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
        throw new InvalidCodeError();
      }

      const normalized = decoded.selections.map(normalizeSelection);
      const selections = normalized.filter((selection) => selection.isBettable);
      const removedLegs = normalized.filter((selection) => !selection.isBettable);

      if (selections.length === 0) {
        // Every leg failed the six staleness signals — there's nothing left to re-encode.
        throw new InvalidCodeError();
      }

      const { bookingCode: resultCode } = await bookABet(
        selections.map((selection) => selection.outcomeId),
      );

      return {
        bookingCode: resultCode,
        selections,
        removedLegs,
        totalOdds: calculateTotalOdds(selections.map((selection) => selection.priceDecimal)),
      };
    },
  );
}
