import type { FastifyInstance } from "fastify";
import { findBookABet } from "../betway/client";
import { prisma } from "../db/client";
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
        await prisma.bookingCodeRequest.create({
          data: { operation: "resolve", bookingCode, status: "invalid_code" },
        });
        throw new InvalidCodeError();
      }

      const selections = result.selections.map(normalizeSelection);

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
