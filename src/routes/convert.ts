import type { FastifyInstance } from "fastify";
import { bookABet, findBookABet } from "../betway/client";
import { UpstreamError } from "../betway/errors";
import { logRequest } from "../db/logRequest";
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

      try {
        const decoded = await findBookABet(bookingCode);

        if (decoded.kind === "dead") {
          logRequest({ operation: "convert", bookingCode, status: "invalid_code" });
          throw new InvalidCodeError();
        }

        const normalized = decoded.selections.map(normalizeSelection);
        const selections = normalized.filter((selection) => selection.isBettable);
        const removedLegs = normalized.filter((selection) => !selection.isBettable);

        if (selections.length === 0) {
          // Every leg failed the six staleness signals — there's nothing left to re-encode.
          logRequest({ operation: "convert", bookingCode, status: "invalid_code", legCount: 0 });
          throw new InvalidCodeError();
        }

        const { bookingCode: resultCode } = await bookABet(
          selections.map((selection) => selection.outcomeId),
        );

        logRequest({
          operation: "convert",
          bookingCode,
          resultCode,
          status: "ok",
          legCount: selections.length,
        });

        return {
          bookingCode: resultCode,
          selections,
          removedLegs,
          totalOdds: calculateTotalOdds(selections.map((selection) => selection.priceDecimal)),
        };
      } catch (err) {
        if (err instanceof UpstreamError) {
          logRequest({ operation: "convert", bookingCode, status: "upstream_error" });
        }
        throw err;
      }
    },
  );
}
