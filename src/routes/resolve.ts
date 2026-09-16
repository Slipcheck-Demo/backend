import type { FastifyInstance } from "fastify";
import { findBookABet } from "../betway/client";
import { normalizeSelection } from "../domain/normalizeSelection";
import { calculateTotalOdds } from "../domain/odds";
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
        throw new InvalidCodeError();
      }

      const selections = result.selections.map(normalizeSelection);

      return {
        bookingCode,
        selections,
        totalOdds: calculateTotalOdds(selections.map((selection) => selection.priceDecimal)),
      };
    },
  );
}
